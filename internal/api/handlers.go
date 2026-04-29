package api

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/varmakarthik12/ghostreply/internal/chat"
	"github.com/varmakarthik12/ghostreply/internal/db"
	"github.com/varmakarthik12/ghostreply/internal/summary"
)

type API struct {
	store   *db.Store
	engine  *chat.Engine
	worker  *summary.Worker
	token   string
	ollamaURL string
}

func NewAPI(store *db.Store, token, ollamaURL string) *API {
	engine := chat.NewEngine(store)
	worker := summary.NewWorker(store)
	worker.Start()
	return &API{store: store, engine: engine, worker: worker, token: token, ollamaURL: ollamaURL}
}

func (a *API) AuthMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		token := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
		if token == "" || token != a.token {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (a *API) Mount(r chi.Router) {
	r.Use(a.AuthMiddleware)
	// Chat
	r.Post("/chat/{conversationId}", a.handleChat)
	// Integrations
	r.Get("/integrations", a.listIntegrations)
	r.Post("/integrations", a.createIntegration)
	r.Get("/integrations/{id}", a.getIntegration)
	r.Delete("/integrations/{id}", a.deleteIntegration)
	// Conversations
	r.Get("/integrations/{integrationId}/conversations", a.listConversations)
	r.Post("/integrations/{integrationId}/conversations", a.createConversation)
	r.Get("/conversations/{id}", a.getConversation)
	r.Put("/conversations/{id}", a.updateConversation)
	r.Delete("/conversations/{id}", a.deleteConversation)
	r.Get("/conversations/{id}/messages", a.getMessages)
	r.Post("/conversations/{id}/summarize", a.manualSummarize)
	r.Get("/conversations/{id}/summary", a.getSummary)
	// System Prompts
	r.Get("/system-prompts", a.getSystemPrompts)
	r.Post("/system-prompts", a.saveSystemPrompt)
	r.Put("/system-prompts/{id}", a.saveSystemPrompt)
	r.Delete("/system-prompts/{id}", a.deleteSystemPrompt)
	// Config
	r.Get("/config", a.getConfig)
	r.Put("/config", a.setConfig)
	r.Delete("/config/{id}", a.deleteConfig)
	// Model Config
	r.Get("/model-config", a.getModelConfig)
	r.Put("/model-config", a.saveModelConfig)
	r.Get("/model-config/ollama-models", a.listOllamaModels)
	// Identity Links
	r.Get("/identity-links", a.getIdentityLinks)
	r.Post("/identity-links", a.createIdentityLink)
	r.Delete("/identity-links/{id}", a.deleteIdentityLink)
}

// Chat handler
func (a *API) handleChat(w http.ResponseWriter, r *http.Request) {
	convID := chi.URLParam(r, "conversationId")
	var req chat.ChatRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if req.ConversationID == "" {
		req.ConversationID = convID
	}
	resp, err := a.engine.HandleChat(r.Context(), req)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	json.NewEncoder(w).Encode(resp)
}

// Integrations
func (a *API) listIntegrations(w http.ResponseWriter, r *http.Request) {
	list, _ := a.store.ListIntegrations()
	json.NewEncoder(w).Encode(list)
}

func (a *API) createIntegration(w http.ResponseWriter, r *http.Request) {
	var body struct {
		ID          string `json:"id"`
		AppType     string `json:"app_type"`
		DisplayName string `json:"display_name"`
	}
	json.NewDecoder(r.Body).Decode(&body)
	a.store.CreateIntegration(body.ID, body.AppType, body.DisplayName)
	w.WriteHeader(http.StatusCreated)
}

func (a *API) getIntegration(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	i, _ := a.store.GetIntegration(id)
	json.NewEncoder(w).Encode(i)
}

func (a *API) deleteIntegration(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	a.store.DeleteIntegration(id)
	w.WriteHeader(http.StatusNoContent)
}

// Conversations
func (a *API) listConversations(w http.ResponseWriter, r *http.Request) {
	integrationID := chi.URLParam(r, "integrationId")
	list, _ := a.store.ListConversations(integrationID)
	json.NewEncoder(w).Encode(list)
}

func (a *API) createConversation(w http.ResponseWriter, r *http.Request) {
	var body struct {
		ID                string `json:"id"`
		ConvType          string `json:"conv_type"`
		TargetDisplayName string `json:"target_display_name"`
	}
	json.NewDecoder(r.Body).Decode(&body)
	integrationID := chi.URLParam(r, "integrationId")
	c := &db.Conversation{
		ID:                body.ID,
		IntegrationID:     integrationID,
		ConvType:          body.ConvType,
		TargetDisplayName: body.TargetDisplayName,
	}
	a.store.CreateConversation(c)
	w.WriteHeader(http.StatusCreated)
}

func (a *API) getConversation(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	c, _ := a.store.GetConversation(id)
	json.NewEncoder(w).Encode(c)
}

func (a *API) updateConversation(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var body struct {
		ConvType          string `json:"conv_type"`
		TargetDisplayName string `json:"target_display_name"`
	}
	json.NewDecoder(r.Body).Decode(&body)
	c := &db.Conversation{ID: id, ConvType: body.ConvType, TargetDisplayName: body.TargetDisplayName}
	a.store.UpdateConversation(c)
	w.WriteHeader(http.StatusNoContent)
}

func (a *API) deleteConversation(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	a.store.DeleteConversation(id)
	w.WriteHeader(http.StatusNoContent)
}

func (a *API) getMessages(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	limit := 50
	msgs, _ := a.store.GetMessages(id, limit)
	json.NewEncoder(w).Encode(msgs)
}

func (a *API) manualSummarize(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	// Trigger via worker
	json.NewEncoder(w).Encode(map[string]string{"status": "triggered", "conversation_id": id})
}

func (a *API) getSummary(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	sm, _ := a.store.GetSummary(id)
	json.NewEncoder(w).Encode(sm)
}

// System Prompts
func (a *API) getSystemPrompts(w http.ResponseWriter, r *http.Request) {
	scope := r.URL.Query().Get("scope")
	scopeID := r.URL.Query().Get("scope_id")
	list, _ := a.store.GetSystemPrompts(scope, scopeID, false)
	json.NewEncoder(w).Encode(list)
}

func (a *API) saveSystemPrompt(w http.ResponseWriter, r *http.Request) {
	var p db.SystemPrompt
	json.NewDecoder(r.Body).Decode(&p)
	if p.ID == "" { p.ID = uuid.NewString() }
	a.store.SaveSystemPrompt(&p)
	w.WriteHeader(http.StatusCreated)
}

func (a *API) deleteSystemPrompt(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	a.store.DeleteSystemPrompt(id)
	w.WriteHeader(http.StatusNoContent)
}

// Config
func (a *API) getConfig(w http.ResponseWriter, r *http.Request) {
	merged := a.store.GetMergedConfig("")
	json.NewEncoder(w).Encode(merged)
}

func (a *API) setConfig(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Scope    string      `json:"scope"`
		ScopeID  string      `json:"scope_id"`
		Key      string      `json:"key"`
		Value    interface{} `json:"value"`
	}
	json.NewDecoder(r.Body).Decode(&body)
	a.store.SetConfig(body.Scope, body.ScopeID, body.Key, body.Value)
	w.WriteHeader(http.StatusNoContent)
}

func (a *API) deleteConfig(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusNoContent)
}

// Model Config
func (a *API) getModelConfig(w http.ResponseWriter, r *http.Request) {
	scope := r.URL.Query().Get("scope")
	scopeID := r.URL.Query().Get("scope_id")
	c, _ := a.store.GetModelConfig(scope, scopeID)
	json.NewEncoder(w).Encode(c)
}

func (a *API) saveModelConfig(w http.ResponseWriter, r *http.Request) {
	var c db.ModelConfig
	json.NewDecoder(r.Body).Decode(&c)
	if c.ID == "" { c.ID = uuid.NewString() }
	a.store.SaveModelConfig(&c)
	w.WriteHeader(http.StatusCreated)
}

func (a *API) listOllamaModels(w http.ResponseWriter, r *http.Request) {
	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Get(a.ollamaURL + "/api/tags")
	if err != nil {
		http.Error(w, err.Error(), http.StatusServiceUnavailable)
		return
	}
	defer resp.Body.Close()
	http.ResponseWriter.Write(w, make([]byte, resp.ContentLength))
	resp.Body.Read(make([]byte, resp.ContentLength))
}

// Identity Links
func (a *API) getIdentityLinks(w http.ResponseWriter, r *http.Request) {
	list, _ := a.store.GetIdentityLinks()
	json.NewEncoder(w).Encode(list)
}

func (a *API) createIdentityLink(w http.ResponseWriter, r *http.Request) {
	var l db.IdentityLink
	json.NewDecoder(r.Body).Decode(&l)
	a.store.CreateIdentityLink(&l)
	w.WriteHeader(http.StatusCreated)
}

func (a *API) deleteIdentityLink(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	a.store.DeleteIdentityLink(id)
	w.WriteHeader(http.StatusNoContent)
}
