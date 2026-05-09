package chat

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/varmakarthik12/ghostreply/internal/db"
	"github.com/varmakarthik12/ghostreply/internal/llm"
)

type mockLLM struct{}

func (m *mockLLM) Chat(ctx context.Context, model string, msgs []llm.Message, contextSize int) (string, llm.Stats, error) {
	return "mock reply", llm.Stats{}, nil
}

func (m *mockLLM) ListModels(ctx context.Context) ([]string, error) {
	return []string{"llama3.2"}, nil
}

func TestDeduplication(t *testing.T) {
	dbPath := "test_dedup.db"
	os.Remove(dbPath)
	defer os.Remove(dbPath)

	store, err := db.NewStore(dbPath)
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()

	factory := func(baseURL, apiKey string, timeout time.Duration) LLM { return &mockLLM{} }
	engine := NewEngine(store, "http://localhost:11434", factory)

	ctx := context.Background()
	req := AutoReplyRequest{
		IntegrationID:  "int1",
		ConversationID: "conv1",
		Content:        "hi",
		SenderID:       "user1",
		SenderName:     "User 1",
		Timestamp:      "2026-05-02T19:00:00Z",
		MessageID:      "msg123",
		History: []HistoryMessage{
			{Content: "prev", SenderID: "user1", Timestamp: "2026-05-02T18:59:00Z", MessageID: "msg000"},
		},
	}

	// 1. First call
	_, err = engine.HandleAutoReply(ctx, req)
	if err != nil {
		t.Fatal(err)
	}

	// Expected: 1 history + 1 current + 1 reply = 3
	// Wait, the engine inserts history, then current, then generates reply.
	// Actually, the reply is inserted too.
	// But let's check the messages count.
	conv, _ := store.FindConversation("int1", "conv1")
	msgs, _ := store.ListMessages(conv.ID, 10)
	if len(msgs) < 2 {
		t.Errorf("expected at least 2 messages, got %d", len(msgs))
	}

	// 2. Second call with SAME request
	_, err = engine.HandleAutoReply(ctx, req)
	if err != nil {
		t.Fatal(err)
	}

	msgs2, _ := store.ListMessages(conv.ID, 10)
	// Should not have increased (except maybe for the reply if LLM generates it again, but it should be deduped too)
	// Wait, the outbound reply hash is based on content. If LLM is same, it dedupes.

	// Check for duplicates of "hi"
	hiCount := 0
	for _, m := range msgs2 {
		if m.Content == "hi" {
			hiCount++
		}
	}
	if hiCount > 1 {
		t.Errorf("deduplication failed: found %d 'hi' messages", hiCount)
	}

	// 3. Third call with DIFFERENT timestamp but SAME MessageID
	req.Timestamp = "2026-05-02T19:00:01Z"
	req.MessageID = "msg123"
	_, err = engine.HandleAutoReply(ctx, req)
	if err != nil {
		t.Fatal(err)
	}

	msgs3, _ := store.ListMessages(conv.ID, 10)
	hiCount = 0
	for _, m := range msgs3 {
		if m.Content == "hi" {
			hiCount++
		}
	}
	if hiCount > 1 {
		t.Errorf("deduplication failed on timestamp change with stable MessageID: found %d 'hi' messages", hiCount)
	}

	// 4. Test history deduplication with MessageID
	req2 := AutoReplyRequest{
		IntegrationID:  "int1",
		ConversationID: "conv1",
		Content:        "new",
		SenderID:       "user1",
		MessageID:      "msg456",
		History: []HistoryMessage{
			{Content: "hi", SenderID: "user1", MessageID: "msg123"}, // Already exists
		},
	}
	_, err = engine.HandleAutoReply(ctx, req2)
	if err != nil {
		t.Fatal(err)
	}

	msgs4, _ := store.ListMessages(conv.ID, 10)
	hiCount = 0
	for _, m := range msgs4 {
		if m.Content == "hi" {
			hiCount++
		}
	}
	if hiCount > 1 {
		t.Errorf("history deduplication failed with MessageID: found %d 'hi' messages", hiCount)
	}

	// 5. Test fuzzy deduplication (same second, different milliseconds)
	req3 := AutoReplyRequest{
		IntegrationID:  "int1",
		ConversationID: "conv1",
		Content:        "fuzzy",
		SenderID:       "user1",
		Timestamp:      "2026-05-02T20:00:00.123Z",
	}
	_, err = engine.HandleAutoReply(ctx, req3)
	if err != nil {
		t.Fatal(err)
	}

	// Call again with same second but .999Z
	req3.Timestamp = "2026-05-02T20:00:00.999Z"
	_, err = engine.HandleAutoReply(ctx, req3)
	if err != nil {
		t.Fatal(err)
	}

	msgs5, _ := store.ListMessages(conv.ID, 10)
	fuzzyCount := 0
	for _, m := range msgs5 {
		if m.Content == "fuzzy" {
			fuzzyCount++
		}
	}
	if fuzzyCount > 1 {
		t.Errorf("fuzzy deduplication failed: found %d 'fuzzy' messages", fuzzyCount)
	}
}
