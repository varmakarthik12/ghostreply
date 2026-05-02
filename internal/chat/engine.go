package chat

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"strconv"
	"strings"
	"sync"

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

	// Track active requests per conversation for cancellation
	activeRequests sync.Map // map[string]context.CancelFunc
}

func NewEngine(store *db.Store, llmURL string, factory LLMClientFactory) *Engine {
	if factory == nil {
		factory = func(baseURL, apiKey string) LLM { return llm.NewClient(baseURL, apiKey) }
	}
	return &Engine{
		Store:  store,
		LLMURL: llmURL,
		NewLLM: factory,
	}
}

type AutoReplyRequest struct {
	IntegrationID  string           `json:"integration_id"`
	ConversationID string           `json:"conversation_id"`
	Content        string           `json:"content"`
	SenderID       string           `json:"sender_id"`
	SenderName     string           `json:"sender_name"`
	ChatType       string           `json:"chat_type"`
	Timestamp      string           `json:"timestamp"`
	MessageID      string           `json:"message_id"`
	History        []HistoryMessage `json:"history"`
}

type HistoryMessage struct {
	Content    string `json:"content"`
	SenderID   string `json:"sender_id"`
	SenderName string `json:"sender_name"`
	IsOutbound bool   `json:"is_outbound"`
	Timestamp  string `json:"timestamp"`
	MessageID  string `json:"message_id"`
}

type WebhookResponse struct {
	Reply string `json:"reply"`
}

var ErrIntegrationNotFound = errors.New("integration not found")

func (e *Engine) HandleAutoReply(ctx context.Context, req AutoReplyRequest) (*WebhookResponse, error) {
	// 1. Cancellation logic: cancel previous request for this conversation
	convKey := req.IntegrationID + ":" + req.ConversationID
	ctx, cancel := context.WithCancel(ctx)
	if oldCancel, loaded := e.activeRequests.LoadOrStore(convKey, cancel); loaded {
		oldCancel.(context.CancelFunc)()
		e.activeRequests.Store(convKey, cancel)
	}
	defer e.activeRequests.Delete(convKey)

	debugEnabled := e.Store.GetConfigValue("debug_auto_reply", "false") == "true"
	if debugEnabled {
		reqJSON, _ := json.MarshalIndent(req, "", "  ")
		log.Printf("[DEBUG] AutoReply Request (Integration: %s, Conv: %s):\n%s", req.IntegrationID, req.ConversationID, string(reqJSON))
	}

	// 2. Sync conversation
	conv, err := e.Store.FindConversation(req.IntegrationID, req.ConversationID)
	if err != nil {
		conv = &db.Conversation{
			IntegrationID: req.IntegrationID,
			ExternalID:    req.ConversationID,
			Title:         req.SenderName,
			ChatType:      req.ChatType,
		}
		if err := e.Store.CreateConversation(conv); err != nil {
			return nil, fmt.Errorf("create conversation: %w", err)
		}
	} else if conv.ChatType == "" && req.ChatType != "" {
		conv.ChatType = req.ChatType
		_ = e.Store.CreateConversation(conv)
	}

	// 3. Spam Prevention: Check consecutive assistant messages
	maxConsecutive := atoiDefault(e.Store.ResolveConfig(conv.ID, req.IntegrationID, "max_consecutive_assistant_messages", "0"), 0)
	if maxConsecutive > 0 {
		recentForSpam, _ := e.Store.RecentMessages(conv.ID, maxConsecutive)
		allAssistant := true
		if len(recentForSpam) < maxConsecutive {
			allAssistant = false
		} else {
			for _, m := range recentForSpam {
				if m.IsOutbound == 0 {
					allAssistant = false
					break
				}
			}
		}
		if allAssistant {
			return &WebhookResponse{Reply: ""}, nil
		}
	}

	// 4. Sync History if provided
	for _, hm := range req.History {
		isOutbound := 0
		if hm.IsOutbound {
			isOutbound = 1
		}
		hashKey := hm.MessageID
		if hashKey == "" {
			hashKey = hm.Timestamp
		}
		if hm.Content == "" {
			continue
		}
		hash := db.DedupHash(conv.ID, hm.MessageID, hm.Content, hashKey)
		if existing, _ := e.Store.FindMessageByDedup(hash); existing != nil {
			if debugEnabled {
				log.Printf("[DEBUG] Skipping history message (duplicate): %s", hm.Content)
			}
			continue
		}
		if err := e.Store.InsertMessage(&db.Message{
			ConversationID: conv.ID,
			IsOutbound:     isOutbound,
			Content:        hm.Content,
			SenderID:       hm.SenderID,
			SenderName:     hm.SenderName,
			DedupHash:      hash,
			Timestamp:      hm.Timestamp,
		}); err != nil {
			if !strings.Contains(err.Error(), "UNIQUE constraint failed") {
				log.Printf("[ERROR] Failed to insert history message: %v", err)
			}
		}
	}

	// 3. Process current message
	hashKey := req.MessageID
	if hashKey == "" {
		hashKey = req.Timestamp
	}
	hash := db.DedupHash(conv.ID, req.MessageID, req.Content, hashKey)
	if existing, err := e.Store.FindMessageByDedup(hash); err == nil && existing != nil {
		if debugEnabled {
			log.Printf("[DEBUG] Skipping incoming message (already processed): %s", req.Content)
		}
	} else {
		if err := e.Store.InsertMessage(&db.Message{
			ConversationID: conv.ID,
			IsOutbound:     0,
			Content:        req.Content,
			SenderID:       req.SenderID,
			SenderName:     req.SenderName,
			DedupHash:      hash,
			Timestamp:      req.Timestamp,
		}); err != nil {
			return nil, fmt.Errorf("insert incoming: %w", err)
		}
	}

	// 4. Generate Reply (reuse logic)
	// Build prompt
	maxN := atoiDefault(e.Store.ResolveConfig(conv.ID, req.IntegrationID, "max_context_messages", "20"), 20)
	recent, err := e.Store.RecentMessages(conv.ID, maxN)
	if err != nil {
		return nil, fmt.Errorf("recent messages: %w", err)
	}
	summaryText := ""
	if sm, err := e.Store.LatestSummary(conv.ID); err == nil && sm != nil {
		summaryText = sm.Text
	}
	persona := e.Store.ResolvePersona(conv.ID, req.IntegrationID)
	model := e.Store.ResolveModel(conv.ID, req.IntegrationID, DefaultModel)

	style := e.Store.ResolveConfig(conv.ID, req.IntegrationID, "reply_style", "brief")

	system := persona
	if system != "" {
		system += "\n\n"
	}

	if conv.ChatType != "" {
		system += fmt.Sprintf("You are in a %s chat. Stay fully in character — never break the persona.\n", conv.ChatType)
	}

	if summaryText != "" {
		system += `## Memory — read this carefully before every reply
This is a structured memory of the conversation so far. Use each section as follows:

- **My speaking style** → Write exactly like this. Copy the rhythm, vocabulary, and quirks described.
- **Relationship dynamic** → Match the emotional tone between us. Keep that same energy.
- **What they've shared** → Remember this. Bring it up naturally when relevant — don't ignore it.
- **What I've shared** → Stay consistent. Never contradict your own past self.
- **Recent conversation thread** → This is the emotional direction we were heading. Continue it.
- **Active topics / follow-ups** → These are your priority. Pick up open threads naturally.

` + summaryText + "\n\n"
	}

	if style == "detailed" {
		system += "Go deeper when it feels natural — share more, ask follow-ups, be emotionally present."
	} else {
		system += "Reply the way a real person texts — short, natural, sometimes incomplete sentences. Never write a wall of text. 1 to 3 sentences max unless the moment calls for more."
	}

	// Keep the conversation on track
	system += "\n\nFollow the conversation naturally. Pick up on what was last said. If you shift topics, make it feel organic — like a real person who got distracted, not a bot trying to escape a question."

	msgs := []llm.Message{{Role: "system", Content: system}}
	for _, m := range recent {
		role := "user"
		content := m.Content
		if m.IsOutbound == 1 {
			role = "assistant"
		} else if m.SenderName != "" {
			content = fmt.Sprintf("[%s]: %s", m.SenderName, m.Content)
		}
		msgs = append(msgs, llm.Message{Role: role, Content: content})
	}

	baseURL := e.Store.ResolveConfig(conv.ID, req.IntegrationID, "llm_url", e.LLMURL)
	apiKey := e.Store.ResolveConfig(conv.ID, req.IntegrationID, "llm_key", "")
	client := e.NewLLM(baseURL, apiKey)
	if debugEnabled {
		log.Printf("[DEBUG] LLM Model: %s", model)
		log.Printf("[DEBUG] LLM Messages: %v", msgs)
	}
	reply, err := client.Chat(ctx, model, msgs)
	if err != nil {
		log.Printf("[ERROR] LLM Chat failed: %v", err)
		return nil, fmt.Errorf("llm: %w", err)
	}

	resp := &WebhookResponse{Reply: reply}
	if debugEnabled {
		respJSON, _ := json.MarshalIndent(resp, "", "  ")
		log.Printf("[DEBUG] AutoReply Response (Integration: %s, Conv: %s):\n%s", req.IntegrationID, req.ConversationID, string(respJSON))
	}

	return resp, nil
}

func atoiDefault(s string, def int) int {
	n, err := strconv.Atoi(s)
	if err != nil {
		return def
	}
	return n
}
