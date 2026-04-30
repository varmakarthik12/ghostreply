package chat

import (
	"context"
	"errors"
	"fmt"
	"strconv"

	"github.com/varmakarthik12/ghostreply/internal/db"
	"github.com/varmakarthik12/ghostreply/internal/llm"
)

const DefaultModel = "llama3.2"

// LLMClientFactory builds an LLM client from a base URL and API key.
// Tests inject a stub; main wires the real one.
type LLMClientFactory func(baseURL, apiKey string) LLM

type LLM interface {
	Chat(ctx context.Context, model string, msgs []llm.Message) (string, error)
}

type Engine struct {
	Store  *db.Store
	LLMURL string
	NewLLM LLMClientFactory
}

func NewEngine(store *db.Store, llmURL string, factory LLMClientFactory) *Engine {
	if factory == nil {
		factory = func(baseURL, apiKey string) LLM { return llm.NewClient(baseURL, apiKey) }
	}
	return &Engine{Store: store, LLMURL: llmURL, NewLLM: factory}
}

type WebhookRequest struct {
	Text     string `json:"text"`
	Platform string `json:"platform"`
	ChatID   string `json:"chat_id"`
}

type WebhookResponse struct {
	Reply string `json:"reply"`
}

var ErrIntegrationNotFound = errors.New("integration not found")

// HandleWebhook implements the 13-step flow from the spec.
func (e *Engine) HandleWebhook(ctx context.Context, req WebhookRequest) (*WebhookResponse, error) {
	// 2. Find active integration by platform.
	integration, err := e.Store.GetActiveIntegrationByPlatform(req.Platform)
	if err != nil {
		return nil, ErrIntegrationNotFound
	}

	// 3. Find or create conversation.
	conv, err := e.Store.FindConversation(integration.ID, req.ChatID)
	if err != nil {
		conv = &db.Conversation{
			IntegrationID: integration.ID,
			ExternalID:    req.ChatID,
			Title:         req.ChatID,
		}
		if err := e.Store.CreateConversation(conv); err != nil {
			return nil, fmt.Errorf("create conversation: %w", err)
		}
	}

	// 4. Dedup check.
	hash := db.DedupHash(conv.ID, req.Text)
	if existing, err := e.Store.FindMessageByDedup(hash); err == nil && existing != nil {
		if last, err := e.Store.LastOutboundMessage(conv.ID); err == nil && last != nil {
			return &WebhookResponse{Reply: last.Content}, nil
		}
		return &WebhookResponse{Reply: ""}, nil
	}

	// 5. Insert incoming message.
	if err := e.Store.InsertMessage(&db.Message{
		ConversationID: conv.ID,
		IsOutbound:     0,
		Content:        req.Text,
		DedupHash:      hash,
	}); err != nil {
		return nil, fmt.Errorf("insert incoming: %w", err)
	}

	// 6. Context: latest summary + last N messages.
	maxN := atoiDefault(e.Store.GetConfigValue("max_context_messages", "20"), 20)
	recent, err := e.Store.RecentMessages(conv.ID, maxN)
	if err != nil {
		return nil, fmt.Errorf("recent messages: %w", err)
	}
	summaryText := ""
	if sm, err := e.Store.LatestSummary(conv.ID); err == nil && sm != nil {
		summaryText = sm.Text
	}

	// 7. Persona.
	persona := e.Store.ResolvePersona(conv.ID, integration.ID)

	// 8. Model.
	model := e.Store.ResolveModel(conv.ID, integration.ID, DefaultModel)

	// 9. Build LLM messages.
	system := persona
	if system != "" {
		system += "\n\n"
	}
	system += "You are responding on behalf of the host user.\nBe natural, casual, match their tone."
	if summaryText != "" {
		system += "\n\nContext summary:\n" + summaryText
	}
	msgs := []llm.Message{{Role: "system", Content: system}}
	for _, m := range recent {
		role := "user"
		if m.IsOutbound == 1 {
			role = "assistant"
		}
		msgs = append(msgs, llm.Message{Role: role, Content: m.Content})
	}

	// 10. Call LLM.
	baseURL := e.Store.GetConfigValue("llm_url", e.LLMURL)
	apiKey := e.Store.GetConfigValue("llm_key", "")
	client := e.NewLLM(baseURL, apiKey)
	reply, err := client.Chat(ctx, model, msgs)
	if err != nil {
		return nil, fmt.Errorf("llm: %w", err)
	}

	// 11/12. Persist reply.
	if err := e.Store.InsertMessage(&db.Message{
		ConversationID: conv.ID,
		IsOutbound:     1,
		Content:        reply,
		DedupHash:      db.DedupHash(conv.ID, "out:"+reply),
	}); err != nil {
		return nil, fmt.Errorf("insert reply: %w", err)
	}

	// 13. Return.
	return &WebhookResponse{Reply: reply}, nil
}

func atoiDefault(s string, def int) int {
	n, err := strconv.Atoi(s)
	if err != nil {
		return def
	}
	return n
}
