package api

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/varmakarthik12/ghostreply/internal/chat"
	"github.com/varmakarthik12/ghostreply/internal/db"
	"github.com/varmakarthik12/ghostreply/internal/llm"
)

const testToken = "test-token-12345"

type stubLLM struct{ Reply string }

func (s *stubLLM) Chat(_ context.Context, _ string, _ []llm.Message, _ int, _ llm.SamplingParams) (string, llm.Stats, error) {
	return s.Reply, llm.Stats{}, nil
}

func (s *stubLLM) TranscribeAudio(_ context.Context, _ string, _ string, _ string) (string, llm.Stats, error) {
	return s.Reply, llm.Stats{}, nil
}

func (s *stubLLM) ListModels(_ context.Context) ([]string, error) {
	return []string{"llama3.2"}, nil
}

func newTestServer(t *testing.T) (*API, http.Handler) {
	t.Helper()
	store, err := db.NewStore(":memory:")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { store.Close() })

	stub := &stubLLM{Reply: "hi from stub"}
	api := NewAPI(store, testToken, "http://localhost:11434", func(string, string, time.Duration) chat.LLM { return stub })
	r := chi.NewRouter()
	r.Route("/api", func(r chi.Router) { api.Mount(r) })
	storeRegistry[r] = store
	return api, r
}

func do(t *testing.T, h http.Handler, method, path string, body interface{}, token string) *httptest.ResponseRecorder {
	t.Helper()
	var rdr *bytes.Reader
	if body != nil {
		b, _ := json.Marshal(body)
		rdr = bytes.NewReader(b)
	} else {
		rdr = bytes.NewReader(nil)
	}
	req := httptest.NewRequest(method, path, rdr)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	return rr
}

func TestAuthRequired(t *testing.T) {
	_, h := newTestServer(t)
	rr := do(t, h, "GET", "/api/integrations", nil, "")
	if rr.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", rr.Code)
	}
	rr = do(t, h, "GET", "/api/integrations", nil, "wrong")
	if rr.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", rr.Code)
	}
}

func TestIntegrationsCRUD(t *testing.T) {
	_, h := newTestServer(t)
	rr := do(t, h, "POST", "/api/integrations", map[string]string{"platform": "telegram", "account": "Bot"}, testToken)
	if rr.Code != http.StatusCreated {
		t.Fatalf("create: %d %s", rr.Code, rr.Body.String())
	}
	var created db.Integration
	json.Unmarshal(rr.Body.Bytes(), &created)
	if created.ID == "" {
		t.Fatal("id missing")
	}

	rr = do(t, h, "GET", "/api/integrations", nil, testToken)
	if rr.Code != 200 {
		t.Fatal(rr.Body.String())
	}
	var list []db.Integration
	json.Unmarshal(rr.Body.Bytes(), &list)
	if len(list) != 1 {
		t.Fatalf("expected 1 got %d", len(list))
	}

	rr = do(t, h, "PUT", "/api/integrations/"+created.ID,
		map[string]interface{}{"platform": "telegram", "account": "Bot2", "active": 0}, testToken)
	if rr.Code != 200 {
		t.Fatal(rr.Body.String())
	}

	rr = do(t, h, "DELETE", "/api/integrations/"+created.ID, nil, testToken)
	if rr.Code != http.StatusNoContent {
		t.Fatalf("delete: %d", rr.Code)
	}
}

func TestConversationsAndMessagesCRUD(t *testing.T) {
	_, h := newTestServer(t)
	rr := do(t, h, "POST", "/api/integrations",
		map[string]string{"platform": "telegram", "account": "Bot"}, testToken)
	var integ db.Integration
	json.Unmarshal(rr.Body.Bytes(), &integ)

	rr = do(t, h, "POST", "/api/conversations",
		map[string]string{"integration_id": integ.ID, "external_id": "user1", "title": "User One"}, testToken)
	if rr.Code != http.StatusCreated {
		t.Fatal(rr.Body.String())
	}
	var conv db.Conversation
	json.Unmarshal(rr.Body.Bytes(), &conv)

	rr = do(t, h, "POST", "/api/messages",
		map[string]interface{}{"conversation_id": conv.ID, "content": "hi", "is_outbound": 0}, testToken)
	if rr.Code != http.StatusCreated {
		t.Fatal(rr.Body.String())
	}

	rr = do(t, h, "GET", "/api/messages?conversation_id="+conv.ID, nil, testToken)
	if rr.Code != 200 {
		t.Fatal(rr.Body.String())
	}
	var msgs []db.Message
	json.Unmarshal(rr.Body.Bytes(), &msgs)
	if len(msgs) != 1 {
		t.Fatalf("expected 1 message, got %d", len(msgs))
	}

	rr = do(t, h, "DELETE", "/api/conversations/"+conv.ID, nil, testToken)
	if rr.Code != http.StatusNoContent {
		t.Fatal("delete conv")
	}
}

func TestSystemPromptsCRUD(t *testing.T) {
	_, h := newTestServer(t)
	rr := do(t, h, "POST", "/api/system-prompts",
		map[string]string{"scope": "global", "text": "be casual"}, testToken)
	if rr.Code != http.StatusCreated {
		t.Fatal(rr.Body.String())
	}
	var p db.SystemPrompt
	json.Unmarshal(rr.Body.Bytes(), &p)

	rr = do(t, h, "PUT", "/api/system-prompts/"+p.ID, map[string]string{"text": "be brief"}, testToken)
	if rr.Code != 200 {
		t.Fatal(rr.Body.String())
	}

	rr = do(t, h, "GET", "/api/system-prompts", nil, testToken)
	var list []db.SystemPrompt
	json.Unmarshal(rr.Body.Bytes(), &list)
	if len(list) != 1 || list[0].Text != "be brief" {
		t.Fatalf("update failed: %+v", list)
	}

	rr = do(t, h, "DELETE", "/api/system-prompts/"+p.ID, nil, testToken)
	if rr.Code != http.StatusNoContent {
		t.Fatal("delete prompt")
	}
}

func TestModelConfigsAndConfigs(t *testing.T) {
	_, h := newTestServer(t)
	rr := do(t, h, "POST", "/api/model-configs",
		map[string]string{"scope": "global", "value": "llama3.2"}, testToken)
	if rr.Code != http.StatusCreated {
		t.Fatal(rr.Body.String())
	}
	rr = do(t, h, "GET", "/api/model-configs", nil, testToken)
	var mc []db.ModelConfig
	json.Unmarshal(rr.Body.Bytes(), &mc)
	if len(mc) != 1 || mc[0].Value != "llama3.2" {
		t.Fatalf("model: %+v", mc)
	}

	rr = do(t, h, "POST", "/api/configs",
		map[string]string{"scope": "global", "key": "max_context_messages", "value": "10"}, testToken)
	if rr.Code != http.StatusCreated {
		t.Fatal(rr.Body.String())
	}
}

func TestIdentityLinksCRUD(t *testing.T) {
	_, h := newTestServer(t)
	rr := do(t, h, "POST", "/api/identity-links",
		map[string]string{"identity_id": "alex", "conversation_id": "conv123"}, testToken)
	if rr.Code != http.StatusCreated {
		t.Fatalf("create link: %d %s", rr.Code, rr.Body.String())
	}
	var l struct {
		ID string `json:"id"`
	}
	json.Unmarshal(rr.Body.Bytes(), &l)
	rr = do(t, h, "DELETE", "/api/identity-links/"+l.ID, nil, testToken)
	if rr.Code != http.StatusNoContent {
		t.Fatal("delete link")
	}
}

func apiStore(t *testing.T, h http.Handler) *db.Store {
	t.Helper()
	if s, ok := storeRegistry[h]; ok {
		return s
	}
	t.Fatal("store not registered")
	return nil
}

var storeRegistry = map[http.Handler]*db.Store{}
