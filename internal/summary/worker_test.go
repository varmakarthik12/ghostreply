package summary

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/varmakarthik12/ghostreply/internal/chat"
	"github.com/varmakarthik12/ghostreply/internal/db"
	"github.com/varmakarthik12/ghostreply/internal/llm"
)

func TestNewWorker(t *testing.T) {
	store, _ := db.NewStore(":memory:")
	engine := chat.NewEngine(store, "", nil)
	worker := NewWorker(store, engine, 1*time.Minute)
	if worker.Interval != 1*time.Minute {
		t.Errorf("expected 1m, got %v", worker.Interval)
	}
}

func TestWorkerRunOncePurge(t *testing.T) {
	store, _ := db.NewStore(":memory:")
	
	// Create server session
	sessionID, _ := store.CreateServerSession()
	
	// Insert 10 days old activity log
	oldLog := &db.ActivityLog{
		ID:             "old-log",
		SessionID:      sessionID,
		Type:           "engine",
		ConversationID: "conv1",
		RequestType:    "auto_reply",
		Status:         "success",
		CreatedAt:      time.Now().UTC().AddDate(0, 0, -10).Format(time.RFC3339Nano),
	}
	_ = store.CreateActivityLog(oldLog)
	
	// Configure activity_log_keep_days to 7
	_ = store.UpsertConfig(&db.Config{
		Scope: "global",
		Key:   "activity_log_keep_days",
		Value: "7",
	})
	
	engine := chat.NewEngine(store, "", nil)
	worker := NewWorker(store, engine, 1*time.Minute)
	
	// Call RunOnce
	worker.RunOnce(context.Background())
	
	// Verify that "old-log" is purged
	_, err := store.GetActivityLogByID("old-log")
	if err == nil {
		t.Error("expected old-log to be purged by worker RunOnce")
	}
}

type summaryRecordingLLM struct {
	lastPrompt string
}

func (m *summaryRecordingLLM) Chat(ctx context.Context, model string, msgs []llm.Message, contextSize int, params llm.SamplingParams) (string, llm.Stats, error) {
	for _, msg := range msgs {
		if msg.Role == "user" {
			m.lastPrompt = msg.Content
		}
	}
	return "### 1. User Profile & Disclosed Facts\n- Age: 24, Location: Seattle\n### 2. Host Persona & Disclosed Facts\n- Location: New York", llm.Stats{}, nil
}

func (m *summaryRecordingLLM) ListModels(ctx context.Context) ([]string, error) {
	return []string{"llama3.2"}, nil
}

func TestSummarizePromptStructure(t *testing.T) {
	store, _ := db.NewStore(":memory:")
	mockClient := &summaryRecordingLLM{}
	factory := func(baseURL, apiKey string, timeout time.Duration) chat.LLM { return mockClient }
	engine := chat.NewEngine(store, "", factory)
	worker := NewWorker(store, engine, 1*time.Minute)

	// Create conversation
	conv := &db.Conversation{
		ID:            "conv_sum",
		IntegrationID: "int_sum",
		ExternalID:    "ext_sum",
		Title:         "Alice",
	}
	_ = store.CreateConversation(conv)

	// Insert previous summary
	_ = store.InsertSummary(&db.Summary{
		ConversationID: "conv_sum",
		Text:           "### 1. User Profile & Disclosed Facts\n- Name: Alice, Age: 24, Location: Seattle\n- Hobbies: photography",
	})

	// Insert messages
	_ = store.InsertMessage(&db.Message{
		ConversationID: "conv_sum",
		IsOutbound:     0,
		Content:        "I just got a new golden retriever named Max!",
		SenderName:     "Alice",
	})

	err := worker.Summarize(context.Background(), "conv_sum", "manual_summary")
	if err != nil {
		t.Fatal(err)
	}

	// Verify the prompt passed to the LLM
	prompt := mockClient.lastPrompt
	if !strings.Contains(prompt, "User Profile & Disclosed Facts") {
		t.Errorf("expected User Profile section instructions in prompt, got:\n%s", prompt)
	}
	if !strings.Contains(prompt, "PERMANENT MEMORY") {
		t.Errorf("expected permanent memory rule in prompt, got:\n%s", prompt)
	}
	if !strings.Contains(prompt, "Alice, Age: 24, Location: Seattle") {
		t.Errorf("expected previous summary content in prompt, got:\n%s", prompt)
	}
	if !strings.Contains(prompt, "golden retriever named Max") {
		t.Errorf("expected new message content in prompt, got:\n%s", prompt)
	}

	// Verify that the new summary was saved
	latest, err := store.LatestSummary("conv_sum")
	if err != nil || latest == nil {
		t.Fatalf("expected summary to be saved in store: %v", err)
	}
	if !strings.Contains(latest.Text, "User Profile") {
		t.Errorf("expected saved summary text, got %s", latest.Text)
	}
}

