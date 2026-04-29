package summary

import (
	"context"
	"fmt"
	"time"
	"github.com/google/uuid"
	"github.com/varmakarthik12/ghostreply/internal/chat"
	"github.com/varmakarthik12/ghostreply/internal/db"
	"github.com/varmakarthik12/ghostreply/internal/llm"
)

type Worker struct {
	store     *db.Store
	semaphore chan struct{} // max 3 concurrent
	ticker    *time.Ticker
	done      chan struct{}
}

func NewWorker(store *db.Store) *Worker {
	return &Worker{
		store:     store,
		semaphore: make(chan struct{}, 3),
		ticker:    time.NewTicker(60 * time.Second),
		done:      make(chan struct{}),
	}
}

func (w *Worker) Start() {
	go w.run()
}

func (w *Worker) Stop() {
	w.ticker.Stop()
	close(w.done)
}

func (w *Worker) run() {
	for {
		select {
		case <-w.ticker.C:
			w.checkConversations()
		case <-w.done:
			return
		}
	}
}

func (w *Worker) checkConversations() {
	convs, _ := w.store.ListConversations("")
	for _, c := range convs {
		w.checkConversation(c.ID)
	}
}

func (w *Worker) checkConversation(convID string) {
	modelCfg := w.store.GetEffectiveModelConfig(convID, "")
	ctxWindow := modelCfg.ContextWindowTokens
	config := w.store.GetMergedConfig(convID)
	msgThreshold := getInt(config, "summary_message_threshold", 50)

	// Get latest summary
	sm, _ := w.store.GetSummary(convID)
	var sinceID string
	if sm != nil {
		sinceID = sm.CoversUpToMessageID
	}

	// Count messages since last summary
	count, _ := w.store.CountMessagesSince(convID, sinceID)

	// Estimate tokens of unsummarized messages
	msgs, _ := w.store.GetMessages(convID, 200)
	var tokenEst int
	for _, m := range msgs {
		if sinceID != "" && m.ID <= sinceID { continue }
		tokenEst += len(m.Content) / 4
	}

	// Trigger if either threshold hit
	if count < msgThreshold && tokenEst < ctxWindow*70/100 {
		return
	}

	// Acquire semaphore
	w.semaphore <- struct{}{}
	defer func() { <-w.semaphore }()

	// Perform summarization
	w.summarize(convID, sinceID, sm, msgs, ctxWindow)
}

func (w *Worker) summarize(convID, sinceID string, priorSm *db.Summary, allMsgs []*db.Message, ctxWindow int) {
	// Filter unsummarized messages
	var unsummarized []*db.Message
	for _, m := range allMsgs {
		if sinceID == "" || m.ID > sinceID {
			unsummarized = append(unsummarized, m)
		}
	}
	if len(unsummarized) == 0 {
		return
	}

	// Build prompt
	system := "You are a conversation memory system. Maintain a single rolling summary."
	var userPrompt string
	if priorSm != nil {
		userPrompt = fmt.Sprintf(`EXISTING SUMMARY (covers up to %s):
%s

NEW MESSAGES SINCE LAST SUMMARY:
`, priorSm.CreatedAt, priorSm.SummaryText)
	} else {
		userPrompt = "Summarize this conversation:\n"
	}
	for _, m := range unsummarized {
		userPrompt += fmt.Sprintf("%s: %s\n", m.SenderID, m.Content)
	}
	userPrompt += "\nUpdate the existing summary by incorporating the new messages. Produce ONE comprehensive summary paragraph covering the ENTIRE conversation. Focus on: relationship context, recurring topics, emotional tone, important facts, unresolved threads. Be concise but complete."

	// Create provider
	modelCfg := w.store.GetEffectiveModelConfig(convID, "")
	provider, err := chat.NewProviderFromConfig(modelCfg)
	if err != nil {
		fmt.Printf("Summarize error: %v\n", err)
		return
	}

	reply, err := provider.Chat(context.Background(), system, []llm.Turn{
		{Role: "user", Content: userPrompt},
	})
	if err != nil {
		fmt.Printf("Summarize LLM error: %v\n", err)
		return
	}

	// Get last message ID for coverage
	lastMsgID := ""
	if len(allMsgs) > 0 {
		lastMsgID = allMsgs[len(allMsgs)-1].ID
	}

	// Store summary
	sm := &db.Summary{
		ID:                    uuid.NewString(),
		ConversationID:        convID,
		SummaryText:           reply,
		CoversUpToMessageID:   lastMsgID,
		EstimatedTokenCount:   len(reply) / 4,
	}
	w.store.SaveSummary(sm)
	fmt.Printf("Summarized conversation %s: %d messages covered\n", convID, len(unsummarized))
}

func getInt(m map[string]interface{}, key string, def int) int {
	if v, ok := m[key]; ok {
		if i, ok := v.(int); ok { return i }
	}
	return def
}
