package db

import (
	"os"
	"testing"
	"time"
)

func TestNewStore(t *testing.T) {
	dbPath := "test_newstore.db"
	os.Remove(dbPath)
	defer os.Remove(dbPath)

	store, err := NewStore(dbPath)
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()

	if store.DB == nil {
		t.Fatal("expected DB to be initialized")
	}
}

func TestPurgeActivityLogs(t *testing.T) {
	store, err := NewStore(":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()

	// Create a server session first (needed because of foreign key constraints on activity_logs)
	sessionID, err := store.CreateServerSession()
	if err != nil {
		t.Fatal(err)
	}

	// Insert old activity log (10 days old)
	oldLog := &ActivityLog{
		ID:             "old-log",
		SessionID:      sessionID,
		Type:           "engine",
		ConversationID: "conv1",
		RequestType:    "auto_reply",
		Status:         "success",
		CreatedAt:      time.Now().UTC().AddDate(0, 0, -10).Format(time.RFC3339Nano),
	}
	if err := store.CreateActivityLog(oldLog); err != nil {
		t.Fatal(err)
	}

	// Insert new activity log (2 days old)
	newLog := &ActivityLog{
		ID:             "new-log",
		SessionID:      sessionID,
		Type:           "engine",
		ConversationID: "conv2",
		RequestType:    "auto_reply",
		Status:         "success",
		CreatedAt:      time.Now().UTC().AddDate(0, 0, -2).Format(time.RFC3339Nano),
	}
	if err := store.CreateActivityLog(newLog); err != nil {
		t.Fatal(err)
	}

	// Purge logs older than 7 days
	purged, err := store.PurgeActivityLogs(7)
	if err != nil {
		t.Fatal(err)
	}
	if purged != 1 {
		t.Errorf("expected 1 purged row, got %d", purged)
	}

	// Verify old log is gone and new log is present
	_, err = store.GetActivityLogByID("old-log")
	if err == nil {
		t.Error("expected old-log to be deleted")
	}
	_, err = store.GetActivityLogByID("new-log")
	if err != nil {
		t.Errorf("expected new-log to exist, got error: %v", err)
	}

	// Purge with 0 days should do nothing
	purged, err = store.PurgeActivityLogs(0)
	if err != nil {
		t.Fatal(err)
	}
	if purged != 0 {
		t.Errorf("expected 0 purged rows with keepDays=0, got %d", purged)
	}
}

func TestScopeHierarchy(t *testing.T) {
	store, err := NewStore(":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()

	// 1. Test Configs Hierarchy (conversation > integration > global > default)
	// Default fallback
	if val := store.ResolveConfig("c1", "i1", "style", "def"); val != "def" {
		t.Errorf("expected default 'def', got '%s'", val)
	}

	// Global override
	_ = store.UpsertConfig(&Config{Scope: "global", Key: "style", Value: "global_style"})
	if val := store.ResolveConfig("c1", "i1", "style", "def"); val != "global_style" {
		t.Errorf("expected global 'global_style', got '%s'", val)
	}

	// Integration override
	_ = store.UpsertConfig(&Config{Scope: "integration", ScopeID: "i1", Key: "style", Value: "int1_style"})
	_ = store.UpsertConfig(&Config{Scope: "integration", ScopeID: "i2", Key: "style", Value: "int2_style"})
	if val := store.ResolveConfig("c1", "i1", "style", "def"); val != "int1_style" {
		t.Errorf("expected integration 'int1_style', got '%s'", val)
	}
	if val := store.ResolveConfig("c1", "i2", "style", "def"); val != "int2_style" {
		t.Errorf("expected integration 'int2_style', got '%s'", val)
	}

	// Conversation override
	_ = store.UpsertConfig(&Config{Scope: "conversation", ScopeID: "c1", Key: "style", Value: "conv1_style"})
	_ = store.UpsertConfig(&Config{Scope: "conversation", ScopeID: "c2", Key: "style", Value: "conv2_style"})
	if val := store.ResolveConfig("c1", "i1", "style", "def"); val != "conv1_style" {
		t.Errorf("expected conversation 'conv1_style', got '%s'", val)
	}
	if val := store.ResolveConfig("c2", "i1", "style", "def"); val != "conv2_style" {
		t.Errorf("expected conversation 'conv2_style', got '%s'", val)
	}

	// 2. Test ModelConfigs Hierarchy & Coexistence
	if val := store.ResolveModel("c1", "i1", "default_model"); val != "default_model" {
		t.Errorf("expected default 'default_model', got '%s'", val)
	}

	_ = store.UpsertModelConfig(&ModelConfig{Scope: "global", Value: "global_model"})
	if val := store.ResolveModel("c1", "i1", "default_model"); val != "global_model" {
		t.Errorf("expected global 'global_model', got '%s'", val)
	}

	// Multiple integrations must coexist without overwriting each other
	_ = store.UpsertModelConfig(&ModelConfig{Scope: "integration", ScopeID: "i1", Value: "int1_model"})
	_ = store.UpsertModelConfig(&ModelConfig{Scope: "integration", ScopeID: "i2", Value: "int2_model"})
	if val := store.ResolveModel("c1", "i1", "default_model"); val != "int1_model" {
		t.Errorf("expected integration 'int1_model', got '%s'", val)
	}
	if val := store.ResolveModel("c1", "i2", "default_model"); val != "int2_model" {
		t.Errorf("expected integration 'int2_model', got '%s'", val)
	}

	// Conversation level override
	_ = store.UpsertModelConfig(&ModelConfig{Scope: "conversation", ScopeID: "c1", Value: "conv1_model"})
	if val := store.ResolveModel("c1", "i1", "default_model"); val != "conv1_model" {
		t.Errorf("expected conversation 'conv1_model', got '%s'", val)
	}
	// Different conversation in i1 falls back to i1 model
	if val := store.ResolveModel("other_c", "i1", "default_model"); val != "int1_model" {
		t.Errorf("expected other conv in i1 to get 'int1_model', got '%s'", val)
	}

	// 3. Test Persona Hierarchy & Coexistence
	if val := store.ResolvePersona("c1", "i1"); val != "" {
		t.Errorf("expected empty persona, got '%s'", val)
	}

	_ = store.CreateSystemPrompt(&SystemPrompt{Scope: "global", Text: "global_persona"})
	if val := store.ResolvePersona("c1", "i1"); val != "global_persona" {
		t.Errorf("expected global 'global_persona', got '%s'", val)
	}

	_ = store.CreateSystemPrompt(&SystemPrompt{Scope: "integration", ScopeID: "i1", Text: "int1_persona"})
	_ = store.CreateSystemPrompt(&SystemPrompt{Scope: "integration", ScopeID: "i2", Text: "int2_persona"})
	if val := store.ResolvePersona("c1", "i1"); val != "int1_persona" {
		t.Errorf("expected integration 'int1_persona', got '%s'", val)
	}
	if val := store.ResolvePersona("c1", "i2"); val != "int2_persona" {
		t.Errorf("expected integration 'int2_persona', got '%s'", val)
	}

	_ = store.CreateSystemPrompt(&SystemPrompt{Scope: "conversation", ScopeID: "c1", Text: "conv1_persona"})
	if val := store.ResolvePersona("c1", "i1"); val != "conv1_persona" {
		t.Errorf("expected conversation 'conv1_persona', got '%s'", val)
	}
	if val := store.ResolvePersona("other_c", "i1"); val != "int1_persona" {
		t.Errorf("expected other conv to get 'int1_persona', got '%s'", val)
	}
}

func TestActivityLogIntegrationDetails(t *testing.T) {
	store, err := NewStore(":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()

	sessionID, err := store.CreateServerSession()
	if err != nil {
		t.Fatal(err)
	}

	// 1. Create integration
	intID := "int-telegram-1"
	if err := store.CreateIntegration(&Integration{
		ID:       intID,
		Platform: "telegram",
		Account:  "@ghostbot",
	}); err != nil {
		t.Fatal(err)
	}

	// 2. Create conversation
	convID := "conv-101"
	if err := store.CreateConversation(&Conversation{
		ID:            convID,
		IntegrationID: intID,
		ExternalID:    "chat_999",
		Title:         "Support Chat",
	}); err != nil {
		t.Fatal(err)
	}

	// 3. Create activity log with integration_id
	log1 := &ActivityLog{
		ID:                "log-1",
		SessionID:         sessionID,
		Type:              "engine",
		ConversationID:    convID,
		ConversationTitle: "Support Chat",
		IntegrationID:     intID,
		RequestType:       "auto_reply",
		Status:            "success",
	}
	if err := store.CreateActivityLog(log1); err != nil {
		t.Fatal(err)
	}

	// 4. Create another activity log without explicit integration_id (join fallback)
	log2 := &ActivityLog{
		ID:                "log-2",
		SessionID:         sessionID,
		Type:              "summary",
		ConversationID:    convID,
		ConversationTitle: "Support Chat",
		RequestType:       "manual_summary",
		Status:            "in_progress",
	}
	if err := store.CreateActivityLog(log2); err != nil {
		t.Fatal(err)
	}

	// Verify GetActivityLogByID
	fetched1, err := store.GetActivityLogByID("log-1")
	if err != nil {
		t.Fatalf("failed to fetch log-1: %v", err)
	}
	if fetched1.IntegrationID != intID {
		t.Errorf("expected IntegrationID %q, got %q", intID, fetched1.IntegrationID)
	}
	if fetched1.Platform != "telegram" {
		t.Errorf("expected Platform 'telegram', got %q", fetched1.Platform)
	}
	if fetched1.Account != "@ghostbot" {
		t.Errorf("expected Account '@ghostbot', got %q", fetched1.Account)
	}

	// Verify log2 has joined integration info even without explicit integration_id
	fetched2, err := store.GetActivityLogByID("log-2")
	if err != nil {
		t.Fatalf("failed to fetch log-2: %v", err)
	}
	if fetched2.IntegrationID != intID {
		t.Errorf("expected IntegrationID %q from conversation join, got %q", intID, fetched2.IntegrationID)
	}
	if fetched2.Platform != "telegram" {
		t.Errorf("expected Platform 'telegram', got %q", fetched2.Platform)
	}

	// Verify GetActivityLogsFiltered
	logs, err := store.GetActivityLogsFiltered("", "", "", intID, 10)
	if err != nil {
		t.Fatalf("failed to filter logs: %v", err)
	}
	if len(logs) != 2 {
		t.Fatalf("expected 2 logs for integration %s, got %d", intID, len(logs))
	}

	// Filter by different integration should return 0
	logsEmpty, err := store.GetActivityLogsFiltered("", "", "", "non-existent-int", 10)
	if err != nil {
		t.Fatalf("failed to filter logs: %v", err)
	}
	if len(logsEmpty) != 0 {
		t.Fatalf("expected 0 logs for non-existent-int, got %d", len(logsEmpty))
	}
}


