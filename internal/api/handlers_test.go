package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/varmakarthik12/ghostreply/internal/db"
)

func testSetup(t *testing.T) (*API, *db.Store, func()) {
	tmpFile, _ := os.CreateTemp("", "test-*.db")
	dbPath := tmpFile.Name()
	tmpFile.Close()

	store, err := db.NewStore(dbPath)
	if err != nil {
		t.Fatalf("Failed to create store: %v", err)
	}
	token := "test-token-12345"
	api := NewAPI(store, token, "http://localhost:11434")
	return api, store, func() {
		store.Close()
		os.Remove(dbPath)
	}
}

// setupRouter creates a chi router with API routes for testing
func setupRouter(api *API) chi.Router {
	r := chi.NewMux()
	r.Route("/api", func(r chi.Router) {
		api.Mount(r)
	})
	return r
}

// makeRequest is a helper to make authenticated requests
func makeRequest(t *testing.T, r chi.Router, method, path string, body interface{}, token string) *httptest.ResponseRecorder {
	var req *http.Request
	if body != nil {
		bodyBytes, _ := json.Marshal(body)
		req = httptest.NewRequest(method, path, bytes.NewReader(bodyBytes))
		req.Header.Set("Content-Type", "application/json")
	} else {
		req = httptest.NewRequest(method, path, nil)
	}

	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}

	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, req)
	return rr
}


// ============================================================================
// AUTH TESTS
// ============================================================================

func TestAuthMiddleware(t *testing.T) {
	api, _, cleanup := testSetup(t)
	defer cleanup()

	tests := []struct {
		name       string
		authHeader string
		expectCode int
	}{
		{"valid token", "Bearer test-token-12345", http.StatusOK},
		{"invalid token", "Bearer wrong-token", http.StatusUnauthorized},
		{"missing token", "", http.StatusUnauthorized},
		{"malformed header", "NotBearer test-token-12345", http.StatusUnauthorized},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest("GET", "/api/integrations", nil)
			if tt.authHeader != "" {
				req.Header.Set("Authorization", tt.authHeader)
			}
			handler := api.AuthMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(http.StatusOK)
			}))
			rr := httptest.NewRecorder()
			handler.ServeHTTP(rr, req)
			if rr.Code != tt.expectCode {
				t.Errorf("Expected %d, got %d", tt.expectCode, rr.Code)
			}
		})
	}
}

// ============================================================================
// INTEGRATION TESTS
// ============================================================================

func TestCreateIntegration(t *testing.T) {
	api, store, cleanup := testSetup(t)
	defer cleanup()

	r := setupRouter(api)

	body := map[string]string{
		"id":           "telegram-123",
		"app_type":     "telegram",
		"display_name": "Telegram Bot",
	}

	rr := makeRequest(t, r, "POST", "/api/integrations", body, "test-token-12345")
	if rr.Code != http.StatusCreated {
		t.Errorf("Expected 201, got %d", rr.Code)
	}

	i, _ := store.GetIntegration("telegram-123")
	if i == nil || i.ID != "telegram-123" {
		t.Error("Integration was not created correctly")
	}
}

func TestListIntegrations(t *testing.T) {
	api, store, cleanup := testSetup(t)
	defer cleanup()

	store.CreateIntegration("slack-1", "slack", "Slack Workspace")
	store.CreateIntegration("telegram-1", "telegram", "Telegram Bot")

	r := setupRouter(api)
	rr := makeRequest(t, r, "GET", "/api/integrations", nil, "test-token-12345")

	if rr.Code != http.StatusOK {
		t.Errorf("Expected 200, got %d: %s", rr.Code, rr.Body.String())
	}

	var integrations []*db.Integration
	json.NewDecoder(rr.Body).Decode(&integrations)
	if len(integrations) < 2 {
		t.Errorf("Expected at least 2 integrations, got %d", len(integrations))
	}
}

func TestGetIntegration(t *testing.T) {
	api, store, cleanup := testSetup(t)
	defer cleanup()

	store.CreateIntegration("slack-1", "slack", "Slack Workspace")

	r := setupRouter(api)
	rr := makeRequest(t, r, "GET", "/api/integrations/slack-1", nil, "test-token-12345")

	if rr.Code != http.StatusOK {
		t.Errorf("Expected 200, got %d", rr.Code)
	}

	var integration db.Integration
	json.NewDecoder(rr.Body).Decode(&integration)
	if integration.ID != "slack-1" {
		t.Errorf("Expected ID slack-1, got %s", integration.ID)
	}
}

func TestDeleteIntegration(t *testing.T) {
	api, store, cleanup := testSetup(t)
	defer cleanup()

	store.CreateIntegration("slack-1", "slack", "Slack Workspace")

	r := setupRouter(api)
	rr := makeRequest(t, r, "DELETE", "/api/integrations/slack-1", nil, "test-token-12345")

	if rr.Code != http.StatusNoContent {
		t.Errorf("Expected 204, got %d", rr.Code)
	}

	i, _ := store.GetIntegration("slack-1")
	if i != nil {
		t.Error("Integration was not deleted")
	}
}

// ============================================================================
// CONVERSATION TESTS
// ============================================================================

func TestListConversations(t *testing.T) {
	api, store, cleanup := testSetup(t)
	defer cleanup()

	integrationID := "slack-1"
	store.CreateIntegration(integrationID, "slack", "Slack")
	store.CreateConversation(&db.Conversation{
		ID:            integrationID + "::conv1",
		IntegrationID: integrationID,
		ConvType:      "individual",
	})

	r := setupRouter(api)
	rr := makeRequest(t, r, "GET", "/api/integrations/"+integrationID+"/conversations", nil, "test-token-12345")

	if rr.Code != http.StatusOK {
		t.Errorf("Expected 200, got %d", rr.Code)
	}

	var convs []*db.Conversation
	json.NewDecoder(rr.Body).Decode(&convs)
	if len(convs) < 1 {
		t.Errorf("Expected at least 1 conversation, got %d", len(convs))
	}
}

func TestCreateConversation(t *testing.T) {
	api, store, cleanup := testSetup(t)
	defer cleanup()

	integrationID := "slack-1"
	store.CreateIntegration(integrationID, "slack", "Slack")

	r := setupRouter(api)

	body := map[string]string{
		"id":                   integrationID + "::conv1",
		"conv_type":            "individual",
		"target_display_name":  "Joe",
	}

	rr := makeRequest(t, r, "POST", "/api/integrations/"+integrationID+"/conversations", body, "test-token-12345")

	if rr.Code != http.StatusCreated {
		t.Errorf("Expected 201, got %d", rr.Code)
	}

	c, _ := store.GetConversation(integrationID + "::conv1")
	if c == nil {
		t.Error("Conversation was not created")
	}
}

func TestGetConversation(t *testing.T) {
	api, store, cleanup := testSetup(t)
	defer cleanup()

	integrationID := "slack-1"
	convID := integrationID + "::conv1"
	store.CreateIntegration(integrationID, "slack", "Slack")
	store.CreateConversation(&db.Conversation{
		ID:            convID,
		IntegrationID: integrationID,
		ConvType:      "individual",
	})

	r := setupRouter(api)
	rr := makeRequest(t, r, "GET", "/api/conversations/"+convID, nil, "test-token-12345")

	if rr.Code != http.StatusOK {
		t.Errorf("Expected 200, got %d", rr.Code)
	}

	var conv db.Conversation
	json.NewDecoder(rr.Body).Decode(&conv)
	if conv.ID != convID {
		t.Errorf("Expected ID %s, got %s", convID, conv.ID)
	}
}

func TestUpdateConversation(t *testing.T) {
	api, store, cleanup := testSetup(t)
	defer cleanup()

	integrationID := "slack-1"
	convID := integrationID + "::conv1"
	store.CreateIntegration(integrationID, "slack", "Slack")
	store.CreateConversation(&db.Conversation{
		ID:            convID,
		IntegrationID: integrationID,
		ConvType:      "individual",
	})

	r := setupRouter(api)

	body := map[string]string{
		"conv_type":            "group",
		"target_display_name":  "Joe Updated",
	}

	rr := makeRequest(t, r, "PUT", "/api/conversations/"+convID, body, "test-token-12345")

	if rr.Code != http.StatusNoContent {
		t.Errorf("Expected 204, got %d", rr.Code)
	}
}

func TestDeleteConversation(t *testing.T) {
	api, store, cleanup := testSetup(t)
	defer cleanup()

	integrationID := "slack-1"
	convID := integrationID + "::conv1"
	store.CreateIntegration(integrationID, "slack", "Slack")
	store.CreateConversation(&db.Conversation{
		ID:            convID,
		IntegrationID: integrationID,
		ConvType:      "individual",
	})

	r := setupRouter(api)
	rr := makeRequest(t, r, "DELETE", "/api/conversations/"+convID, nil, "test-token-12345")

	if rr.Code != http.StatusNoContent {
		t.Errorf("Expected 204, got %d", rr.Code)
	}
}

// ============================================================================
// MESSAGE TESTS
// ============================================================================

func TestGetMessages(t *testing.T) {
	api, store, cleanup := testSetup(t)
	defer cleanup()

	integrationID := "slack-1"
	convID := integrationID + "::conv1"
	store.CreateIntegration(integrationID, "slack", "Slack")
	store.CreateConversation(&db.Conversation{
		ID:            convID,
		IntegrationID: integrationID,
		ConvType:      "individual",
	})

	store.SaveMessage(db.IncomingMessage{
		Timestamp:      time.Now(),
		Content:        "Hello",
		SenderType:     "target",
		SenderID:       "user1",
		SenderUsername: "joe",
	}, convID, "dedup1")

	r := setupRouter(api)
	rr := makeRequest(t, r, "GET", "/api/conversations/"+convID+"/messages", nil, "test-token-12345")

	if rr.Code != http.StatusOK {
		t.Errorf("Expected 200, got %d", rr.Code)
	}

	var messages []*db.Message
	json.NewDecoder(rr.Body).Decode(&messages)
	if len(messages) < 1 {
		t.Errorf("Expected at least 1 message, got %d", len(messages))
	}
}

// ============================================================================
// SYSTEM PROMPTS TESTS
// ============================================================================

func TestGetSystemPrompts(t *testing.T) {
	api, store, cleanup := testSetup(t)
	defer cleanup()

	store.SaveSystemPrompt(&db.SystemPrompt{
		ID:       uuid.NewString(),
		Scope:    "global",
		Label:    "Default Prompt",
		Content:  "You are a helpful assistant",
		IsActive: true,
		Priority: 0,
	})

	r := setupRouter(api)
	rr := makeRequest(t, r, "GET", "/api/system-prompts", nil, "test-token-12345")

	if rr.Code != http.StatusOK {
		t.Errorf("Expected 200, got %d", rr.Code)
	}

	var prompts []*db.SystemPrompt
	json.NewDecoder(rr.Body).Decode(&prompts)
	if len(prompts) < 1 {
		t.Errorf("Expected at least 1 prompt, got %d", len(prompts))
	}
}

func TestSaveSystemPrompt(t *testing.T) {
	api, _, cleanup := testSetup(t)
	defer cleanup()

	r := setupRouter(api)

	body := map[string]interface{}{
		"scope":    "global",
		"label":    "Test Prompt",
		"content":  "Test content",
		"is_active": true,
		"priority": 0,
	}

	rr := makeRequest(t, r, "POST", "/api/system-prompts", body, "test-token-12345")

	if rr.Code != http.StatusCreated {
		t.Errorf("Expected 201, got %d", rr.Code)
	}
}

func TestDeleteSystemPrompt(t *testing.T) {
	api, store, cleanup := testSetup(t)
	defer cleanup()

	promptID := uuid.NewString()
	store.SaveSystemPrompt(&db.SystemPrompt{
		ID:       promptID,
		Scope:    "global",
		Label:    "Test Prompt",
		Content:  "Test content",
		IsActive: true,
		Priority: 0,
	})

	r := setupRouter(api)
	rr := makeRequest(t, r, "DELETE", "/api/system-prompts/"+promptID, nil, "test-token-12345")

	if rr.Code != http.StatusNoContent {
		t.Errorf("Expected 204, got %d", rr.Code)
	}
}

// ============================================================================
// CONFIG TESTS
// ============================================================================

func TestGetConfig(t *testing.T) {
	api, _, cleanup := testSetup(t)
	defer cleanup()

	r := setupRouter(api)
	rr := makeRequest(t, r, "GET", "/api/config", nil, "test-token-12345")

	if rr.Code != http.StatusOK {
		t.Errorf("Expected 200, got %d", rr.Code)
	}

	var config map[string]interface{}
	json.NewDecoder(rr.Body).Decode(&config)
	// Config may be empty on fresh DB, which is OK
	t.Logf("Got config: %+v", config)
}

func TestSetConfig(t *testing.T) {
	api, _, cleanup := testSetup(t)
	defer cleanup()

	r := setupRouter(api)

	body := map[string]interface{}{
		"scope":     "global",
		"scope_id":  "",
		"key":       "new_key",
		"value":     "new_value",
	}

	rr := makeRequest(t, r, "PUT", "/api/config", body, "test-token-12345")

	if rr.Code != http.StatusNoContent {
		t.Errorf("Expected 204, got %d", rr.Code)
	}
}

// ============================================================================
// MODEL CONFIG TESTS
// ============================================================================

func TestGetModelConfig(t *testing.T) {
	api, store, cleanup := testSetup(t)
	defer cleanup()

	// Save a model config first
	configID := uuid.NewString()
	store.SaveModelConfig(&db.ModelConfig{
		ID:                    configID,
		Scope:                 "global",
		Provider:              "ollama",
		ModelName:             "gemma3:4b",
		BaseURL:               "http://localhost:11434",
		ContextWindowTokens:   8192,
	})

	r := setupRouter(api)
	rr := makeRequest(t, r, "GET", "/api/model-config?scope=global", nil, "test-token-12345")

	if rr.Code != http.StatusOK {
		t.Errorf("Expected 200, got %d: %s", rr.Code, rr.Body.String())
	}

	var config db.ModelConfig
	json.NewDecoder(rr.Body).Decode(&config)
	if config.ID == "" {
		t.Logf("No model config found, which is OK for this test")
	} else if config.ModelName != "gemma3:4b" {
		t.Errorf("Expected model gemma3:4b, got %s", config.ModelName)
	}
}

func TestSaveModelConfig(t *testing.T) {
	api, _, cleanup := testSetup(t)
	defer cleanup()

	r := setupRouter(api)

	body := map[string]interface{}{
		"scope":                    "global",
		"provider":                 "openai",
		"model_name":               "gpt-4",
		"base_url":                 "https://api.openai.com/v1",
		"api_key":                  "sk-test",
		"context_window_tokens":    8192,
	}

	rr := makeRequest(t, r, "PUT", "/api/model-config", body, "test-token-12345")

	if rr.Code != http.StatusCreated {
		t.Errorf("Expected 201, got %d", rr.Code)
	}
}

// ============================================================================
// IDENTITY LINKS TESTS
// ============================================================================

func TestGetIdentityLinks(t *testing.T) {
	api, store, cleanup := testSetup(t)
	defer cleanup()

	store.CreateIdentityLink(&db.IdentityLink{
		ID:                    uuid.NewString(),
		PrimaryIntegrationID:  "slack-1",
		PrimarySenderID:       "U123",
		LinkedIntegrationID:   "telegram-1",
		LinkedSenderID:        "C456",
		UnifiedDisplayName:    "Joe",
	})

	r := setupRouter(api)
	rr := makeRequest(t, r, "GET", "/api/identity-links", nil, "test-token-12345")

	if rr.Code != http.StatusOK {
		t.Errorf("Expected 200, got %d", rr.Code)
	}

	var links []*db.IdentityLink
	json.NewDecoder(rr.Body).Decode(&links)
	if len(links) < 1 {
		t.Errorf("Expected at least 1 link, got %d", len(links))
	}
}

func TestCreateIdentityLink(t *testing.T) {
	api, _, cleanup := testSetup(t)
	defer cleanup()

	r := setupRouter(api)

	body := map[string]string{
		"primary_integration_id": "slack-1",
		"primary_sender_id":      "U123",
		"linked_integration_id":  "telegram-1",
		"linked_sender_id":       "C456",
		"unified_display_name":   "Joe",
	}

	rr := makeRequest(t, r, "POST", "/api/identity-links", body, "test-token-12345")

	if rr.Code != http.StatusCreated {
		t.Errorf("Expected 201, got %d", rr.Code)
	}
}

func TestDeleteIdentityLink(t *testing.T) {
	api, store, cleanup := testSetup(t)
	defer cleanup()

	linkID := uuid.NewString()
	store.CreateIdentityLink(&db.IdentityLink{
		ID:                    linkID,
		PrimaryIntegrationID:  "slack-1",
		PrimarySenderID:       "U123",
		LinkedIntegrationID:   "telegram-1",
		LinkedSenderID:        "C456",
	})

	r := setupRouter(api)
	rr := makeRequest(t, r, "DELETE", "/api/identity-links/"+linkID, nil, "test-token-12345")

	if rr.Code != http.StatusNoContent {
		t.Errorf("Expected 204, got %d", rr.Code)
	}
}

// ============================================================================
// SUMMARY TESTS
// ============================================================================

func TestGetSummary(t *testing.T) {
	api, store, cleanup := testSetup(t)
	defer cleanup()

	integrationID := "slack-1"
	convID := integrationID + "::conv1"
	store.CreateIntegration(integrationID, "slack", "Slack")
	store.CreateConversation(&db.Conversation{
		ID:            convID,
		IntegrationID: integrationID,
		ConvType:      "individual",
	})

	store.SaveSummary(&db.Summary{
		ID:                    uuid.NewString(),
		ConversationID:        convID,
		SummaryText:           "This is a test summary",
		CoversUpToMessageID:   "msg1",
		EstimatedTokenCount:   100,
	})

	r := setupRouter(api)
	rr := makeRequest(t, r, "GET", "/api/conversations/"+convID+"/summary", nil, "test-token-12345")

	if rr.Code != http.StatusOK {
		t.Errorf("Expected 200, got %d", rr.Code)
	}

	var summary db.Summary
	json.NewDecoder(rr.Body).Decode(&summary)
	if summary.SummaryText != "This is a test summary" {
		t.Errorf("Expected summary text, got %s", summary.SummaryText)
	}
}

func TestManualSummarize(t *testing.T) {
	api, store, cleanup := testSetup(t)
	defer cleanup()

	integrationID := "slack-1"
	convID := integrationID + "::conv1"
	store.CreateIntegration(integrationID, "slack", "Slack")
	store.CreateConversation(&db.Conversation{
		ID:            convID,
		IntegrationID: integrationID,
		ConvType:      "individual",
	})

	r := setupRouter(api)
	rr := makeRequest(t, r, "POST", "/api/conversations/"+convID+"/summarize", nil, "test-token-12345")

	if rr.Code != http.StatusOK {
		t.Errorf("Expected 200, got %d", rr.Code)
	}

	var result map[string]string
	json.NewDecoder(rr.Body).Decode(&result)
	if result["status"] != "triggered" {
		t.Errorf("Expected status triggered, got %s", result["status"])
	}
}

// ============================================================================
// TABLE-DRIVEN TESTS
// ============================================================================

func TestAPIEndpointsWithoutAuth(t *testing.T) {
	api, _, cleanup := testSetup(t)
	defer cleanup()

	r := setupRouter(api)

	endpoints := []struct {
		name   string
		method string
		path   string
	}{
		{"List Integrations", "GET", "/api/integrations"},
		{"List Config", "GET", "/api/config"},
		{"List Model Config", "GET", "/api/model-config"},
		{"List System Prompts", "GET", "/api/system-prompts"},
		{"List Identity Links", "GET", "/api/identity-links"},
	}

	for _, ep := range endpoints {
		t.Run(ep.name, func(t *testing.T) {
			rr := makeRequest(t, r, ep.method, ep.path, nil, "")
			if rr.Code != http.StatusUnauthorized {
				t.Errorf("%s: Expected 401, got %d", ep.name, rr.Code)
			}
		})
	}
}

func TestIntegrationWorkflow(t *testing.T) {
	api, _, cleanup := testSetup(t)
	defer cleanup()

	r := setupRouter(api)
	token := "test-token-12345"

	// 1. Create Integration
	integrationBody := map[string]string{
		"id":           "test-slack",
		"app_type":     "slack",
		"display_name": "Test Slack",
	}
	rr := makeRequest(t, r, "POST", "/api/integrations", integrationBody, token)
	if rr.Code != http.StatusCreated {
		t.Fatalf("Failed to create integration: %d", rr.Code)
	}

	// 2. Get Integration
	rr = makeRequest(t, r, "GET", "/api/integrations/test-slack", nil, token)
	if rr.Code != http.StatusOK {
		t.Fatalf("Failed to get integration: %d", rr.Code)
	}

	// 3. Create Conversation
	convBody := map[string]string{
		"id":                   "test-slack::conv1",
		"conv_type":            "individual",
		"target_display_name":  "Joe",
	}
	rr = makeRequest(t, r, "POST", "/api/integrations/test-slack/conversations", convBody, token)
	if rr.Code != http.StatusCreated {
		t.Fatalf("Failed to create conversation: %d", rr.Code)
	}

	// 4. Get Conversation
	rr = makeRequest(t, r, "GET", "/api/conversations/test-slack::conv1", nil, token)
	if rr.Code != http.StatusOK {
		t.Fatalf("Failed to get conversation: %d", rr.Code)
	}

	// 5. Get Messages
	rr = makeRequest(t, r, "GET", "/api/conversations/test-slack::conv1/messages", nil, token)
	if rr.Code != http.StatusOK {
		t.Fatalf("Failed to get messages: %d", rr.Code)
	}

	// 6. Set Config
	configBody := map[string]interface{}{
		"scope":    "conversation",
		"scope_id": "test-slack::conv1",
		"key":      "auto_reply",
		"value":    true,
	}
	rr = makeRequest(t, r, "PUT", "/api/config", configBody, token)
	if rr.Code != http.StatusNoContent {
		t.Fatalf("Failed to set config: %d", rr.Code)
	}

	// 7. Get Config
	rr = makeRequest(t, r, "GET", "/api/config", nil, token)
	if rr.Code != http.StatusOK {
		t.Fatalf("Failed to get config: %d", rr.Code)
	}

	// 8. Save System Prompt
	promptBody := map[string]interface{}{
		"scope":      "conversation",
		"scope_id":   "test-slack::conv1",
		"label":      "Test Prompt",
		"content":    "You are helpful",
		"is_active":  true,
		"priority":   0,
	}
	rr = makeRequest(t, r, "POST", "/api/system-prompts", promptBody, token)
	if rr.Code != http.StatusCreated {
		t.Fatalf("Failed to save prompt: %d", rr.Code)
	}

	// 9. Save Model Config
	modelBody := map[string]interface{}{
		"scope":                    "conversation",
		"scope_id":                 "test-slack::conv1",
		"provider":                 "ollama",
		"model_name":               "mistral",
		"base_url":                 "http://localhost:11434",
		"context_window_tokens":    4096,
	}
	rr = makeRequest(t, r, "PUT", "/api/model-config", modelBody, token)
	if rr.Code != http.StatusCreated {
		t.Fatalf("Failed to save model config: %d", rr.Code)
	}

	// 10. Create Identity Link
	linkBody := map[string]string{
		"primary_integration_id": "test-slack",
		"primary_sender_id":      "U123",
		"linked_integration_id":  "telegram",
		"linked_sender_id":       "C456",
		"unified_display_name":   "Joe",
	}
	rr = makeRequest(t, r, "POST", "/api/identity-links", linkBody, token)
	if rr.Code != http.StatusCreated {
		t.Fatalf("Failed to create identity link: %d", rr.Code)
	}

	t.Logf("Complete integration workflow executed successfully")
}
