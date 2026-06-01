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
	"time"

	"github.com/google/uuid"
	"github.com/varmakarthik12/ghostreply/internal/db"
	"github.com/varmakarthik12/ghostreply/internal/llm"
)

const DefaultModel = "llama3.2"

// LLMClientFactory builds an LLM client from a base URL and API key.
// Tests inject a stub; main wires the real one.
type LLMClientFactory func(baseURL, apiKey string, timeout time.Duration) LLM

type LLM interface {
	Chat(ctx context.Context, model string, msgs []llm.Message, contextSize int) (string, llm.Stats, error)
	ListModels(ctx context.Context) ([]string, error)
}

type ModelSetting struct {
	Model       string `json:"model"`
	URL         string `json:"url,omitempty"`
	APIKey      string `json:"api_key,omitempty"`
	ContextSize int    `json:"context_size,omitempty"`
}

type ModelConfig struct {
	Chat           ModelSetting `json:"chat"`
	Summary        ModelSetting `json:"summary"`
	Image          ModelSetting `json:"image"`
	Voice          ModelSetting `json:"voice"`
	RequestDelay   int          `json:"request_delay"`
	RequestTimeout int          `json:"request_timeout"`
}

type Engine struct {
	Store  *db.Store
	LLMURL string
	NewLLM LLMClientFactory

	// Track active requests per conversation for cancellation
	activeRequests sync.Map // map[string]activeRequest
}

type activeRequest struct {
	cancel context.CancelFunc
	logID  string
}

func NewEngine(store *db.Store, llmURL string, factory LLMClientFactory) *Engine {
	if factory == nil {
		factory = func(baseURL, apiKey string, timeout time.Duration) LLM { return llm.NewClient(baseURL, apiKey, timeout) }
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
	MediaData      string           `json:"media_data"`
	MediaType      string           `json:"media_type"`
}

type HistoryMessage struct {
	Content    string `json:"content"`
	SenderID   string `json:"sender_id"`
	SenderName string `json:"sender_name"`
	IsOutbound bool   `json:"is_outbound"`
	Timestamp  string `json:"timestamp"`
	MessageID  string `json:"message_id"`
}

type AutoReplyResponse struct {
	Reply string `json:"reply"`
}

var ErrIntegrationNotFound = errors.New("integration not found")

func (e *Engine) HandleAutoReply(ctx context.Context, req AutoReplyRequest) (*AutoReplyResponse, error) {
	// 1. Sync conversation
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

	// 2. Create Activity Log
	logID := uuid.NewString()
	activityLog := &db.ActivityLog{
		ID:                logID,
		Type:              "engine",
		ConversationID:    conv.ID,
		ConversationTitle: conv.Title,
		RequestType:       "auto_reply",
		Status:            "pending",
	}
	_ = e.Store.CreateActivityLog(activityLog)

	// 3. Cancellation logic: cancel previous request for this conversation
	convKey := req.IntegrationID + ":" + req.ConversationID
	ctx, cancel := context.WithCancel(ctx)
	newAR := activeRequest{cancel: cancel, logID: logID}
	if old, loaded := e.activeRequests.LoadOrStore(convKey, newAR); loaded {
		oldAR := old.(activeRequest)
		oldAR.cancel()
		// Mark superseded log as cancelled immediately
		_ = e.Store.UpdateActivityLog(oldAR.logID, "cancelled", "Superseded by a new request", "")
		e.activeRequests.Store(convKey, newAR)
	}
	defer func() {
		// Only delete if it's still our request
		if val, ok := e.activeRequests.Load(convKey); ok {
			if ar, ok := val.(activeRequest); ok && ar.logID == logID {
				e.activeRequests.Delete(convKey)
			}
		}
	}()

	debugEnabled := e.Store.GetConfigValue("debug_auto_reply", "false") == "true"
	if debugEnabled {
		reqJSON, _ := json.MarshalIndent(req, "", "  ")
		log.Printf("[DEBUG] AutoReply Request (Integration: %s, Conv: %s):\n%s", req.IntegrationID, req.ConversationID, string(reqJSON))
	}

	// Early initialization of model settings and LLM client to support media analysis
	modelValue := e.Store.ResolveModel(conv.ID, req.IntegrationID, DefaultModel)
	cfg := ParseModelConfig(modelValue, DefaultModel)

	chatClient, chatModel, chatContextSize := e.ResolveLLMClient(conv.ID, req.IntegrationID, cfg.Chat, DefaultModel, cfg.RequestTimeout)

	// 4. Sync message history
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

	// 5. Process current message
	mediaDescription := ""
	if req.MediaData != "" {
		isAudio := strings.HasPrefix(req.MediaType, "audio/")

		if isAudio {
			// Resolve voice client, model, and context window
			voiceClient, voiceModel, voiceCtxSize := e.ResolveLLMClient(conv.ID, req.IntegrationID, cfg.Voice, "whisper-1", cfg.RequestTimeout)

			_ = e.Store.UpdateActivityLog(logID, "in_progress", "Transcribing received voice note...", "")

			format := "mp3"
			if strings.Contains(req.MediaType, "wav") {
				format = "wav"
			} else if strings.Contains(req.MediaType, "aac") {
				format = "aac"
			} else if strings.Contains(req.MediaType, "ogg") || strings.Contains(req.MediaType, "opus") {
				format = "opus"
			}

			analysisPrompt := "Identify what is spoken in this audio/voice note. Summarize the key message, details, and tone in 1-2 brief, descriptive sentences. Respond ONLY with the final summary."

			analysisMsgs := []llm.Message{
				{
					Role:    "user",
					Content: analysisPrompt,
					Audios: []llm.AudioContent{
						{
							Data:   req.MediaData,
							Format: format,
						},
					},
				},
			}

			reply, _, err := voiceClient.Chat(ctx, voiceModel, analysisMsgs, voiceCtxSize)
			if err != nil {
				log.Printf("[ERROR] Voice note analysis failed: %v", err)
				mediaDescription = "Voice Note: (analysis failed)"
			} else {
				mediaDescription = "Voice Note: " + strings.TrimSpace(reply)
				if debugEnabled {
					log.Printf("[DEBUG] Generated voice transcription/summary: %s", mediaDescription)
				}
			}
		} else {
			// Resolve image client, model, and context window
			imageClient, imageModel, imageCtxSize := e.ResolveLLMClient(conv.ID, req.IntegrationID, cfg.Image, chatModel, cfg.RequestTimeout)

			_ = e.Store.UpdateActivityLog(logID, "in_progress", "Analyzing received image...", "")

			analysisPrompt := "Identify if this image is a snap of a person (e.g. selfie, portrait, group photo, body picture) or a random snap (e.g. object, scenery, screenshot, meme, background, etc.). Summarize what the snap is, describing the content, mood, action, or expressions. Keep it to 1-2 brief, descriptive sentences. Respond ONLY with the final summary."

			prefix := "data:image/jpeg;base64,"
			if req.MediaType != "" {
				prefix = "data:" + req.MediaType + ";base64,"
			}

			analysisMsgs := []llm.Message{
				{
					Role:    "user",
					Content: analysisPrompt,
					Images:  []string{prefix + req.MediaData},
				},
			}

			reply, _, err := imageClient.Chat(ctx, imageModel, analysisMsgs, imageCtxSize)
			if err != nil {
				log.Printf("[ERROR] Media analysis failed: %v", err)
			} else {
				mediaDescription = strings.TrimSpace(reply)
				if debugEnabled {
					log.Printf("[DEBUG] Generated media summary (image): %s", mediaDescription)
				}
			}
		}
	}

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
			ConversationID:   conv.ID,
			IsOutbound:       0,
			Content:          req.Content,
			SenderID:         req.SenderID,
			SenderName:       req.SenderName,
			DedupHash:        hash,
			Timestamp:        req.Timestamp,
			MediaDescription: mediaDescription,
		}); err != nil {
			return nil, fmt.Errorf("insert incoming: %w", err)
		}
	}

	// 6. Spam Prevention: Check consecutive assistant messages
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
			if debugEnabled {
				log.Printf("[DEBUG] Skipping auto-reply: maximum consecutive assistant messages reached (%d)", maxConsecutive)
			}
			_ = e.Store.UpdateActivityLog(logID, "cancelled", "Max consecutive assistant messages reached", "")
			return &AutoReplyResponse{Reply: ""}, nil
		}
	}

	// 7. Generate Reply
	// Build prompt
	maxN := atoiDefault(e.Store.ResolveConfig(conv.ID, req.IntegrationID, "max_context_messages", "20"), 20)
	recent, err := e.Store.RecentMessages(conv.ID, maxN)
	if err != nil {
		_ = e.Store.UpdateActivityLog(logID, "failure", err.Error(), "")
		return nil, fmt.Errorf("recent messages: %w", err)
	}
	summaries, _ := e.Store.GetLinkedSummaries(conv.ID)
	// If no linked summaries found via identity mapping, fallback to the current conversation's summary
	if len(summaries) == 0 {
		if sm, err := e.Store.LatestSummary(conv.ID); err == nil && sm != nil {
			summaries = append(summaries, *sm)
		}
	}

	summaryText := ""
	for _, sm := range summaries {
		if summaryText != "" {
			summaryText += "\n---\n"
		}
		summaryText += sm.Text
	}
	persona := e.Store.ResolvePersona(conv.ID, req.IntegrationID)

	if cfg.RequestDelay > 0 {
		if debugEnabled {
			log.Printf("[DEBUG] Delaying auto-reply by %d seconds as per model config", cfg.RequestDelay)
		}
		_ = e.Store.UpdateActivityLog(logID, "in_progress", "Waiting for request delay", "")
		select {
		case <-time.After(time.Duration(cfg.RequestDelay) * time.Second):
		case <-ctx.Done():
			_ = e.Store.UpdateActivityLog(logID, "cancelled", "Request canceled during delay", "")
			return nil, ctx.Err()
		}
	}

	_ = e.Store.UpdateActivityLog(logID, "in_progress", "Generating reply...", "")

	style := e.Store.ResolveConfig(conv.ID, req.IntegrationID, "reply_style", "brief")

	system := persona
	if system != "" {
		system += "\n\n"
	}

	if conv.ChatType != "" {
		system += fmt.Sprintf("You are in a %s chat. Stay fully in character — never break the persona.", conv.ChatType) + "\n"
	}

	if summaryText != "" {
		system += "## Background memory" + "\n"
		system += "This gives you context about the person across one or more platforms. Use it to stay consistent — your voice, your shared history, and the established vibe. Even if this memory comes from a different platform, it is the same person. Do NOT use this as an agenda. Just be aware of it." + "\n"
		system += "- My speaking style: copy it exactly. Rhythm, vocab, quirks." + "\n"
		system += "- Relationship dynamic: match the emotional energy." + "\n"
		system += "- What they've shared: remember it. Bring it up only if it fits naturally." + "\n"
		system += "- What I've shared: stay consistent. Never contradict yourself." + "\n"
		system += "- Recent thread and active topics: awareness only. Follow where the conversation goes NOW, not where it was." + "\n"
		system += summaryText + "\n"
	}

	if style == "detailed" {
		system += "Go deeper when it feels right — share more, ask follow-ups, be emotionally present." + "\n"
	} else {
		system += "Reply like a real person texting — casual, short, sometimes trailing off. One thought at a time. No walls of text. 1 to 2 sentences is usually enough." + "\n"
	}

	system += "Never use line breaks or newlines in your reply. Write everything as one flowing text, like a real text message." + "\n"
	system += "Never comment on how many messages were sent at once. Never say you need a brain reset or that you are overwhelmed. Just reply to the most recent thing naturally." + "\n"
	system += "Reply to what was just said. Do not drag old topics back into the conversation unless it comes up naturally. Follow the person's lead." + "\n"

	msgs := []llm.Message{{Role: "system", Content: system}}
	for _, m := range recent {
		role := "user"
		content := m.Content
		if m.IsOutbound == 1 {
			role = "assistant"
		} else {
			if m.MediaDescription != "" {
				if strings.HasPrefix(m.MediaDescription, "Voice Note: ") {
					content = fmt.Sprintf("%s\n[%s]", content, m.MediaDescription)
				} else {
					content = fmt.Sprintf("%s\n[Received Snap/Image: %s]", content, m.MediaDescription)
				}
			}
			if m.SenderName != "" {
				content = fmt.Sprintf("[%s]: %s", m.SenderName, content)
			}
		}
		msgs = append(msgs, llm.Message{Role: role, Content: content})
	}

	if debugEnabled {
		log.Printf("[DEBUG] ConversationId=%s, LLM Model: %s", req.ConversationID, chatModel)
		log.Printf("[DEBUG] ConversationId=%s, LLM Messages: %v", req.ConversationID, msgs)
	}

	reply, stats, err := chatClient.Chat(ctx, chatModel, msgs, chatContextSize)
	if err != nil {
		status := "failure"
		errMsg := err.Error()
		if errors.Is(err, context.Canceled) {
			status = "cancelled"
			log.Printf("[ERROR] LLM Chat canceled for conversation %s and sender %s", req.ConversationID, req.SenderName)
		} else if errors.Is(err, context.DeadlineExceeded) {
			log.Printf("[ERROR] LLM Chat timed out for conversation %s and sender %s", req.ConversationID, req.SenderName)
		} else {
			log.Printf("[ERROR] LLM Chat failed for conversation %s and sender %s: %v", req.ConversationID, req.SenderName, err)
		}
		log.Printf("[ERROR] LLM Usage: ConversationId=%s, Input=%d, Output=%d, Total=%d", req.ConversationID, stats.PromptTokens, stats.CompletionTokens, stats.TotalTokens)
		_ = e.Store.UpdateActivityLog(logID, status, errMsg, "")
		return nil, fmt.Errorf("llm: %w", err)
	}

	if debugEnabled {
		log.Printf("[DEBUG] LLM Usage: ConversationId=%s, Input=%d, Output=%d, Total=%d", req.ConversationID, stats.PromptTokens, stats.CompletionTokens, stats.TotalTokens)
	}

	meta, _ := json.Marshal(stats)
	_ = e.Store.UpdateActivityLog(logID, "success", "", string(meta))

	resp := &AutoReplyResponse{Reply: reply}
	if debugEnabled {
		respJSON, _ := json.MarshalIndent(resp, "", "  ")
		log.Printf("[DEBUG] AutoReply Response (Integration: %s, Conv: %s):\n%s", req.IntegrationID, req.ConversationID, string(respJSON))
	}

	return resp, nil
}

func (e *Engine) ResolveLLMClient(convID, integrationID string, setting ModelSetting, defaultModel string, globalTimeout int) (LLM, string, int) {
	url := setting.URL
	if url == "" {
		url = e.LLMURL
	}

	key := setting.APIKey

	model := setting.Model
	if model == "" {
		model = defaultModel
	}

	ctxSize := setting.ContextSize
	if ctxSize <= 0 {
		ctxSize = 30000
	}

	timeout := 5 * time.Minute
	if globalTimeout > 0 {
		timeout = time.Duration(globalTimeout) * time.Second
	}

	client := e.NewLLM(url, key, timeout)
	return client, model, ctxSize
}

func ParseModelConfig(value string, defaultModel string) ModelConfig {
	var cfg ModelConfig
	if err := json.Unmarshal([]byte(value), &cfg); err == nil && (cfg.Chat.Model != "" || cfg.Summary.Model != "" || cfg.Image.Model != "" || cfg.Voice.Model != "") {
		return cfg
	}

	// Fallback to default model name if parsing failed or empty
	cfg.Chat.Model = defaultModel
	return cfg
}

func atoiDefault(s string, def int) int {
	n, err := strconv.Atoi(s)
	if err != nil {
		return def
	}
	return n
}
