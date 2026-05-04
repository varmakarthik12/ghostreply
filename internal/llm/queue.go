package llm

import (
	"context"
	"strconv"
	"sync"

	"github.com/varmakarthik12/ghostreply/internal/db"
)

type Queue struct {
	store *db.Store
	mu    sync.Mutex

	runningEngine  int
	runningSummary int
	waitingEngine  int
	waitingSummary int

	notify chan struct{}
}

func NewQueue(store *db.Store) *Queue {
	return &Queue{
		store:  store,
		notify: make(chan struct{}),
	}
}

func (q *Queue) Acquire(ctx context.Context, label string, isEngine bool) (func(), error) {

	for {
		q.mu.Lock()

		max, _ := strconv.Atoi(q.store.GetConfigValue("max_llm_concurrency", "5"))
		if max <= 0 {
			max = 5
		}

		canRun := false
		running := q.runningEngine + q.runningSummary

		if running < max {
			if isEngine {
				// Engine can run if:
				// 1. Total running < max-1 (reserve one for summary)
				// 2. Total running == max-1 AND no summaries are waiting
				if running < max-1 || q.waitingSummary == 0 {
					canRun = true
				}
			} else {
				// Summary can always take a slot if total < max
				canRun = true
			}
		}

		if canRun {
			if isEngine {
				q.runningEngine++
			} else {
				q.runningSummary++
			}
			q.mu.Unlock()

			var once sync.Once
			return func() {
				once.Do(func() {
					q.mu.Lock()
					if isEngine {
						q.runningEngine--
					} else {
						q.runningSummary--
					}
					// Notify others
					close(q.notify)
					q.notify = make(chan struct{})
					q.mu.Unlock()
				})
			}, nil
		}

		// Wait
		if isEngine {
			q.waitingEngine++
		} else {
			q.waitingSummary++
		}
		waitChan := q.notify
		q.mu.Unlock()

		select {
		case <-ctx.Done():
			q.mu.Lock()
			if isEngine {
				q.waitingEngine--
			} else {
				q.waitingSummary--
			}
			q.mu.Unlock()
			return nil, ctx.Err()
		case <-waitChan:
			q.mu.Lock()
			if isEngine {
				q.waitingEngine--
			} else {
				q.waitingSummary--
			}
			q.mu.Unlock()
			// Loop and try again
		}
	}
}
