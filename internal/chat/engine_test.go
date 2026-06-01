package chat

import (
	"context"
	"encoding/base64"
	"os"
	"strings"
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

type multiModalMockLLM struct {
	calls      []llm.Message
	modelsUsed []string
}

func (m *multiModalMockLLM) Chat(ctx context.Context, model string, msgs []llm.Message, contextSize int) (string, llm.Stats, error) {
	m.modelsUsed = append(m.modelsUsed, model)
	for _, msg := range msgs {
		if msg.Role == "user" && len(msg.Images) > 0 {
			m.calls = append(m.calls, msg)
			return "Mock description: selfie of a person smiling", llm.Stats{}, nil
		}
		if msg.Role == "user" && len(msg.Audios) > 0 {
			m.calls = append(m.calls, msg)
			return "Mock voice transcription: hello this is a voice note", llm.Stats{}, nil
		}
	}
	m.calls = append(m.calls, msgs...)
	return "mock reply to snap", llm.Stats{}, nil
}

func (m *multiModalMockLLM) ListModels(ctx context.Context) ([]string, error) {
	return []string{"llama3.2"}, nil
}

func TestMultiModalAutoReply(t *testing.T) {
	dbPath := "test_multimodal.db"
	os.Remove(dbPath)
	defer os.Remove(dbPath)

	store, err := db.NewStore(dbPath)
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()

	mockClient := &multiModalMockLLM{}
	factory := func(baseURL, apiKey string, timeout time.Duration) LLM { return mockClient }
	engine := NewEngine(store, "http://localhost:11434", factory)

	ctx := context.Background()
	req := AutoReplyRequest{
		IntegrationID:  "int2",
		ConversationID: "conv2",
		Content:        "sent a snap",
		SenderID:       "user2",
		SenderName:     "User 2",
		Timestamp:      "2026-05-02T19:00:00Z",
		MessageID:      "msg456",
		MediaData:      "abc123base64data",
		MediaType:      "image/jpeg",
	}

	resp, err := engine.HandleAutoReply(ctx, req)
	if err != nil {
		t.Fatal(err)
	}

	if resp.Reply != "mock reply to snap" {
		t.Errorf("expected reply 'mock reply to snap', got '%s'", resp.Reply)
	}

	conv, _ := store.FindConversation("int2", "conv2")
	msgs, err := store.ListMessages(conv.ID, 10)
	if err != nil {
		t.Fatal(err)
	}

	// Verify the received snap message has media_description populated
	var snapMsg *db.Message
	for _, m := range msgs {
		if m.Content == "sent a snap" {
			snapMsg = &m
			break
		}
	}

	if snapMsg == nil {
		t.Fatal("incoming snap message not found in database")
	}

	expectedDesc := "Mock description: selfie of a person smiling"
	if snapMsg.MediaDescription != expectedDesc {
		t.Errorf("expected media description '%s', got '%s'", expectedDesc, snapMsg.MediaDescription)
	}

	// Verify that the reply prompt included the image description context
	foundContext := false
	for _, callMsg := range mockClient.calls {
		if callMsg.Role == "user" && len(callMsg.Images) == 0 {
			if strings.Contains(callMsg.Content, "[Received Snap/Image: Mock description: selfie of a person smiling]") {
				foundContext = true
			}
		}
	}

	if !foundContext {
		t.Error("expected reply generation context to contain the image description")
	}

	// Verify image_model/voice_model resolution via Model Config JSON
	mockClient.modelsUsed = nil
	mockClient.calls = nil
	err = store.UpsertModelConfig(&db.ModelConfig{
		Scope:   "conversation",
		ScopeID: conv.ID,
		Value:   `{"chat": {"model": "json-main-model"}, "image": {"model": "json-image-model"}}`,
	})
	if err != nil {
		t.Fatal(err)
	}

	// Test image route
	req.MessageID = "msg459"
	req.Timestamp = "2026-05-02T19:03:00Z"
	req.MediaType = "image/png"
	_, err = engine.HandleAutoReply(ctx, req)
	if err != nil {
		t.Fatal(err)
	}
	if len(mockClient.modelsUsed) < 2 {
		t.Fatalf("expected 2 models used, got %v", mockClient.modelsUsed)
	}
	if mockClient.modelsUsed[0] != "json-image-model" {
		t.Errorf("expected image model to be json-image-model, got %s", mockClient.modelsUsed[0])
	}
	if mockClient.modelsUsed[1] != "json-main-model" {
		t.Errorf("expected main model to be json-main-model, got %s", mockClient.modelsUsed[1])
	}

	// Test voice/audio route
	mockClient.modelsUsed = nil
	mockClient.calls = nil
	// Upsert model config JSON with voice_model
	err = store.UpsertModelConfig(&db.ModelConfig{
		Scope:   "conversation",
		ScopeID: conv.ID,
		Value:   `{"chat": {"model": "json-main-model"}, "voice": {"model": "json-voice-model"}}`,
	})
	if err != nil {
		t.Fatal(err)
	}

	req.MessageID = "msg461"
	req.Timestamp = "2026-05-02T19:05:00Z"
	req.MediaType = "audio/aac"
	req.MediaData = base64.StdEncoding.EncodeToString([]byte("fake audio bytes"))
	_, err = engine.HandleAutoReply(ctx, req)
	if err != nil {
		t.Fatal(err)
	}
	if len(mockClient.modelsUsed) < 2 {
		t.Fatalf("expected at least 2 models used, got %v", mockClient.modelsUsed)
	}
	if mockClient.modelsUsed[0] != "json-voice-model" {
		t.Errorf("expected voice model to be json-voice-model, got %s", mockClient.modelsUsed[0])
	}
	if mockClient.modelsUsed[1] != "json-main-model" {
		t.Errorf("expected main model to be json-main-model, got %s", mockClient.modelsUsed[1])
	}

	// Verify that the database message has the media description set with the voice note prefix
	msgs, err = store.ListMessages(conv.ID, 10)
	if err != nil {
		t.Fatal(err)
	}
	var voiceMsg *db.Message
	for _, m := range msgs {
		if m.Timestamp == "2026-05-02T19:05:00Z" {
			voiceMsg = &m
			break
		}
	}
	if voiceMsg == nil {
		t.Fatal("voice message not found in db")
	}
	if voiceMsg.MediaDescription != "Voice Note: Mock voice transcription: hello this is a voice note" {
		t.Errorf("expected voice note media description, got %s", voiceMsg.MediaDescription)
	}
}
