package api

import (
	"context"
	"encoding/json"
	"net/http"
	"os"
	"runtime/debug"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/varmakarthik12/ghostreply/internal/chat"
	"github.com/varmakarthik12/ghostreply/internal/db"
	"github.com/varmakarthik12/ghostreply/internal/summary"
)

var (
	Version   = ""
	Commit    = ""
	BuildDate = ""
)

func init() {
	if envVer := os.Getenv("GHOSTREPLY_VERSION"); envVer != "" && Version == "" {
		Version = envVer
	}
	if envCommit := os.Getenv("GHOSTREPLY_COMMIT"); envCommit != "" && Commit == "" {
		Commit = envCommit
	}
	if envDate := os.Getenv("GHOSTREPLY_BUILD_DATE"); envDate != "" && BuildDate == "" {
		BuildDate = envDate
	}
	if bi, ok := debug.ReadBuildInfo(); ok {
		if bi.Main.Version != "" && bi.Main.Version != "(devel)" && Version == "" {
			Version = bi.Main.Version
		}
		for _, s := range bi.Settings {
			if s.Key == "vcs.revision" && (Commit == "" || Commit == "none") {
				Commit = s.Value
			}
			if s.Key == "vcs.time" && (BuildDate == "" || BuildDate == "unknown") {
				BuildDate = s.Value
			}
		}
	}
	if Version == "" {
		Version = "v1.5.1"
	}
	if Commit == "" {
		Commit = "none"
	}
	if BuildDate == "" {
		BuildDate = "unknown"
	}
}

type API struct {
	Store  *db.Store
	Engine *chat.Engine
	Worker *summary.Worker
	Token  string
	LLMURL string
}

func NewAPI(store *db.Store, token, llmURL string, factory chat.LLMClientFactory) *API {
	engine := chat.NewEngine(store, llmURL, factory)
	worker := summary.NewWorker(store, engine, 0)
	return &API{Store: store, Engine: engine, Worker: worker, Token: token, LLMURL: llmURL}
}

func (a *API) AuthMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		got := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
		if got == "" || got != a.Token {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (a *API) Mount(r chi.Router) {
	// Public version endpoint
	r.Get("/version", a.versionHandler)

	r.Group(func(r chi.Router) {
		r.Use(a.AuthMiddleware)

		r.Get("/version", a.versionHandler)

		r.Post("/integrations/{integrationID}/conversations/{externalID}/auto-reply", a.autoReply)

		r.Get("/integrations", a.listIntegrations)
		r.Post("/integrations", a.createIntegration)
		r.Put("/integrations/{id}", a.updateIntegration)
		r.Delete("/integrations/{id}", a.deleteIntegration)

		r.Get("/conversations", a.listConversations)
		r.Post("/conversations", a.createConversation)
		r.Delete("/conversations/{id}", a.deleteConversation)

		r.Get("/messages", a.listMessages)
		r.Post("/messages", a.createMessage)
		r.Delete("/messages/{id}", a.deleteMessage)

		r.Get("/configs", a.listConfigs)
		r.Post("/configs", a.createConfig)
		r.Put("/configs/{id}", a.updateConfig)
		r.Delete("/configs/{id}", a.deleteConfig)

		r.Get("/model-configs", a.listModelConfigs)
		r.Post("/model-configs", a.createModelConfig)
		r.Put("/model-configs/{id}", a.updateModelConfig)
		r.Delete("/model-configs/{id}", a.deleteModelConfig)

		r.Get("/summaries", a.listSummaries)
		r.Post("/summaries", a.triggerSummary)
		r.Delete("/summaries/{id}", a.deleteSummary)

		r.Get("/identity-links", a.listIdentityLinks)
		r.Post("/identity-links", a.createIdentityLink)
		r.Delete("/identity-links/{id}", a.deleteIdentityLink)

		r.Get("/system-prompts", a.listSystemPrompts)
		r.Post("/system-prompts", a.createSystemPrompt)
		r.Put("/system-prompts/{id}", a.updateSystemPrompt)
		r.Delete("/system-prompts/{id}", a.deleteSystemPrompt)

		r.Get("/activity-logs", a.listActivityLogs)
		r.Post("/activity-logs/{id}/cancel", a.cancelActivityLog)
		r.Get("/session-stats", a.sessionStats)

		r.Get("/stats", a.stats)
		r.Get("/ollama/models", a.listOllamaModels)
	})
}

// ----- helpers -----

func writeJSON(w http.ResponseWriter, status int, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func decodeBody(r *http.Request, v interface{}) error {
	return json.NewDecoder(r.Body).Decode(v)
}

// ----- auto-reply -----

func (a *API) autoReply(w http.ResponseWriter, r *http.Request) {
	integrationID := chi.URLParam(r, "integrationID")
	externalID := chi.URLParam(r, "externalID")

	var req chat.AutoReplyRequest
	if err := decodeBody(r, &req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	req.IntegrationID = integrationID
	req.ConversationID = externalID

	resp, err := a.Engine.HandleAutoReply(r.Context(), req)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, resp)
}

// ----- integrations -----

func (a *API) listIntegrations(w http.ResponseWriter, r *http.Request) {
	out, err := a.Store.ListIntegrations()
	if err != nil {
		writeJSON(w, 500, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, 200, out)
}

func (a *API) createIntegration(w http.ResponseWriter, r *http.Request) {
	var i db.Integration
	if err := decodeBody(r, &i); err != nil {
		writeJSON(w, 400, map[string]string{"error": err.Error()})
		return
	}
	if i.Active == 0 {
		i.Active = 1
	}
	if err := a.Store.CreateIntegration(&i); err != nil {
		writeJSON(w, 500, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, 201, i)
}

func (a *API) updateIntegration(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var i db.Integration
	if err := decodeBody(r, &i); err != nil {
		writeJSON(w, 400, map[string]string{"error": err.Error()})
		return
	}
	i.ID = id
	if err := a.Store.UpdateIntegration(&i); err != nil {
		writeJSON(w, 500, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, 200, i)
}

func (a *API) deleteIntegration(w http.ResponseWriter, r *http.Request) {
	if err := a.Store.DeleteIntegration(chi.URLParam(r, "id")); err != nil {
		writeJSON(w, 500, map[string]string{"error": err.Error()})
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ----- conversations -----

func (a *API) listConversations(w http.ResponseWriter, r *http.Request) {
	out, err := a.Store.ListConversations(r.URL.Query().Get("integration_id"))
	if err != nil {
		writeJSON(w, 500, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, 200, out)
}

func (a *API) createConversation(w http.ResponseWriter, r *http.Request) {
	var c db.Conversation
	if err := decodeBody(r, &c); err != nil {
		writeJSON(w, 400, map[string]string{"error": err.Error()})
		return
	}
	if err := a.Store.CreateConversation(&c); err != nil {
		writeJSON(w, 500, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, 201, c)
}

func (a *API) deleteConversation(w http.ResponseWriter, r *http.Request) {
	if err := a.Store.DeleteConversation(chi.URLParam(r, "id")); err != nil {
		writeJSON(w, 500, map[string]string{"error": err.Error()})
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ----- messages -----

func (a *API) listMessages(w http.ResponseWriter, r *http.Request) {
	convID := r.URL.Query().Get("conversation_id")
	out, err := a.Store.ListMessages(convID, 100)
	if err != nil {
		writeJSON(w, 500, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, 200, out)
}

func (a *API) createMessage(w http.ResponseWriter, r *http.Request) {
	var m db.Message
	if err := decodeBody(r, &m); err != nil {
		writeJSON(w, 400, map[string]string{"error": err.Error()})
		return
	}
	if m.DedupHash == "" {
		m.DedupHash = db.DedupHash(m.ConversationID, m.SenderID, m.Content, m.Timestamp)
	}
	if err := a.Store.InsertMessage(&m); err != nil {
		writeJSON(w, 500, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, 201, m)
}

func (a *API) deleteMessage(w http.ResponseWriter, r *http.Request) {
	if err := a.Store.DeleteMessage(chi.URLParam(r, "id")); err != nil {
		writeJSON(w, 500, map[string]string{"error": err.Error()})
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ----- configs -----

func (a *API) listConfigs(w http.ResponseWriter, r *http.Request) {
	out, err := a.Store.ListConfigs(r.URL.Query().Get("scope"), r.URL.Query().Get("scope_id"))
	if err != nil {
		writeJSON(w, 500, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, 200, out)
}

func (a *API) createConfig(w http.ResponseWriter, r *http.Request) {
	var c db.Config
	if err := decodeBody(r, &c); err != nil {
		writeJSON(w, 400, map[string]string{"error": err.Error()})
		return
	}
	if err := a.Store.UpsertConfig(&c); err != nil {
		writeJSON(w, 500, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, 201, c)
}

func (a *API) updateConfig(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var body struct {
		Key   string `json:"key"`
		Value string `json:"value"`
	}
	if err := decodeBody(r, &body); err != nil {
		writeJSON(w, 400, map[string]string{"error": err.Error()})
		return
	}
	if err := a.Store.UpdateConfig(id, body.Key, body.Value); err != nil {
		writeJSON(w, 500, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, 200, map[string]string{"id": id})
}

func (a *API) deleteConfig(w http.ResponseWriter, r *http.Request) {
	if err := a.Store.DeleteConfig(chi.URLParam(r, "id")); err != nil {
		writeJSON(w, 500, map[string]string{"error": err.Error()})
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ----- model configs -----

func (a *API) listModelConfigs(w http.ResponseWriter, r *http.Request) {
	out, err := a.Store.ListModelConfigs()
	if err != nil {
		writeJSON(w, 500, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, 200, out)
}

func (a *API) createModelConfig(w http.ResponseWriter, r *http.Request) {
	var m db.ModelConfig
	if err := decodeBody(r, &m); err != nil {
		writeJSON(w, 400, map[string]string{"error": err.Error()})
		return
	}
	if err := a.Store.UpsertModelConfig(&m); err != nil {
		writeJSON(w, 500, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, 201, m)
}

func (a *API) updateModelConfig(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var body struct {
		Value string `json:"value"`
	}
	if err := decodeBody(r, &body); err != nil {
		writeJSON(w, 400, map[string]string{"error": err.Error()})
		return
	}
	if err := a.Store.UpdateModelConfig(id, body.Value); err != nil {
		writeJSON(w, 500, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, 200, map[string]string{"id": id})
}

func (a *API) deleteModelConfig(w http.ResponseWriter, r *http.Request) {
	if err := a.Store.DeleteModelConfig(chi.URLParam(r, "id")); err != nil {
		writeJSON(w, 500, map[string]string{"error": err.Error()})
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ----- summaries -----

func (a *API) listSummaries(w http.ResponseWriter, r *http.Request) {
	out, err := a.Store.ListSummaries(r.URL.Query().Get("conversation_id"))
	if err != nil {
		writeJSON(w, 500, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, 200, out)
}

func (a *API) triggerSummary(w http.ResponseWriter, r *http.Request) {
	var body struct {
		ConversationID string `json:"conversation_id"`
	}
	if err := decodeBody(r, &body); err != nil {
		writeJSON(w, 400, map[string]string{"error": err.Error()})
		return
	}
	if body.ConversationID == "" {
		writeJSON(w, 400, map[string]string{"error": "conversation_id required"})
		return
	}
	go a.Worker.Summarize(context.Background(), body.ConversationID, "manual_summary")
	writeJSON(w, 202, map[string]string{"status": "triggered", "conversation_id": body.ConversationID})
}

func (a *API) deleteSummary(w http.ResponseWriter, r *http.Request) {
	if err := a.Store.DeleteSummary(chi.URLParam(r, "id")); err != nil {
		writeJSON(w, 500, map[string]string{"error": err.Error()})
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ----- identity links -----

func (a *API) listIdentityLinks(w http.ResponseWriter, r *http.Request) {
	out, err := a.Store.ListIdentityLinks()
	if err != nil {
		writeJSON(w, 500, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, 200, out)
}

func (a *API) createIdentityLink(w http.ResponseWriter, r *http.Request) {
	var l db.IdentityLink
	if err := decodeBody(r, &l); err != nil {
		writeJSON(w, 400, map[string]string{"error": err.Error()})
		return
	}
	if err := a.Store.CreateIdentityLink(&l); err != nil {
		writeJSON(w, 500, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, 201, l)
}

func (a *API) deleteIdentityLink(w http.ResponseWriter, r *http.Request) {
	if err := a.Store.DeleteIdentityLink(chi.URLParam(r, "id")); err != nil {
		writeJSON(w, 500, map[string]string{"error": err.Error()})
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ----- system prompts -----

func (a *API) listSystemPrompts(w http.ResponseWriter, r *http.Request) {
	out, err := a.Store.ListSystemPrompts()
	if err != nil {
		writeJSON(w, 500, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, 200, out)
}

func (a *API) createSystemPrompt(w http.ResponseWriter, r *http.Request) {
	var p db.SystemPrompt
	if err := decodeBody(r, &p); err != nil {
		writeJSON(w, 400, map[string]string{"error": err.Error()})
		return
	}
	if err := a.Store.CreateSystemPrompt(&p); err != nil {
		writeJSON(w, 500, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, 201, p)
}

func (a *API) updateSystemPrompt(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var body struct {
		Text string `json:"text"`
	}
	if err := decodeBody(r, &body); err != nil {
		writeJSON(w, 400, map[string]string{"error": err.Error()})
		return
	}
	if err := a.Store.UpdateSystemPrompt(id, body.Text); err != nil {
		writeJSON(w, 500, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, 200, map[string]string{"id": id})
}

func (a *API) deleteSystemPrompt(w http.ResponseWriter, r *http.Request) {
	if err := a.Store.DeleteSystemPrompt(chi.URLParam(r, "id")); err != nil {
		writeJSON(w, 500, map[string]string{"error": err.Error()})
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ----- activity logs -----

func (a *API) listActivityLogs(w http.ResponseWriter, r *http.Request) {
	out, err := a.Store.GetActivityLogs(
		r.URL.Query().Get("conversation_id"),
		r.URL.Query().Get("status"),
		r.URL.Query().Get("type"),
		50,
	)
	if err != nil {
		writeJSON(w, 500, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, 200, out)
}

func (a *API) cancelActivityLog(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if err := a.Store.UpdateActivityLog(id, "cancelled", "Manually cancelled", ""); err != nil {
		writeJSON(w, 500, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, 200, map[string]string{"id": id, "status": "cancelled"})
}

func (a *API) sessionStats(w http.ResponseWriter, r *http.Request) {
	allTime := r.URL.Query().Get("all_time") == "true"
	out, err := a.Store.GetSessionStats(allTime)
	if err != nil {
		writeJSON(w, 500, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, 200, out)
}

// ----- stats -----

func (a *API) stats(w http.ResponseWriter, r *http.Request) {
	i, c, m := a.Store.Stats()
	session, _ := a.Store.GetCurrentSession()
	writeJSON(w, 200, map[string]interface{}{
		"integrations":  i,
		"conversations": c,
		"messages":      m,
		"session":       session,
	})
}
func (a *API) listOllamaModels(w http.ResponseWriter, r *http.Request) {
	baseURL := a.Store.GetConfigValue("llm_url", a.LLMURL)
	apiKey := a.Store.GetConfigValue("llm_key", "")
	client := a.Engine.NewLLM(baseURL, apiKey, 0)

	models, err := client.ListModels(r.Context())
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	if models == nil {
		models = []string{}
	}
	writeJSON(w, http.StatusOK, models)
}

func (a *API) versionHandler(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{
		"version":    Version,
		"commit":     Commit,
		"build_date": BuildDate,
	})
}
