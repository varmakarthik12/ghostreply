package summary

import (
	"testing"
	"time"

	"github.com/varmakarthik12/ghostreply/internal/chat"
	"github.com/varmakarthik12/ghostreply/internal/db"
)

func TestNewWorker(t *testing.T) {
	store, _ := db.NewStore(":memory:")
	engine := chat.NewEngine(store, "", nil)
	worker := NewWorker(store, engine, 1*time.Minute)
	if worker.Interval != 1*time.Minute {
		t.Errorf("expected 1m, got %v", worker.Interval)
	}
}
