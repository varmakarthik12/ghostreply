package chat

import (
	"bytes"
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
	"github.com/varmakarthik12/ghostreply/internal/timeutil"
)

const DefaultModel = "llama3.2"

// LLMClientFactory builds an LLM client from a base URL and API key.
// Tests inject a stub; main wires the real one.
type LLMClientFactory func(baseURL, apiKey string, timeout time.Duration) LLM

type LLM interface {
	Chat(ctx context.Context, model string, msgs []llm.Message, contextSize int, params llm.SamplingParams) (string, llm.Stats, error)
	TranscribeAudio(ctx context.Context, model string, audioBase64 string, format string) (string, llm.Stats, error)
	ListModels(ctx context.Context) ([]string, error)
}

type ModelSetting struct {
	Model             string  `json:"model"`
	URL               string  `json:"url,omitempty"`
	APIKey            string  `json:"api_key,omitempty"`
	ContextSize       int     `json:"context_size,omitempty"`
	Temperature       float64 `json:"temperature,omitempty"`
	TopP              float64 `json:"top_p,omitempty"`
	TopK              int     `json:"top_k,omitempty"`
	MinP              float64 `json:"min_p,omitempty"`
	RepetitionPenalty float64 `json:"repetition_penalty,omitempty"`
	ThinkingLevel     string  `json:"thinking_level,omitempty"` // "none"|"low"|"medium"|"high"|custom budget string
}

type ModelConfig struct {
	Chat           ModelSetting `json:"chat"`
	Summary        ModelSetting `json:"summary"`
	Image          ModelSetting `json:"image"`
	Voice          ModelSetting `json:"voice"`
	Video          ModelSetting `json:"video"`
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
		factory = func(baseURL, apiKey string, timeout time.Duration) LLM {
			return llm.NewClient(baseURL, apiKey, timeout)
		}
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

	chatClient, chatModel, chatContextSize, chatParams := e.ResolveLLMClient(conv.ID, req.IntegrationID, cfg.Chat, DefaultModel, cfg.RequestTimeout)

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
		isVideo := strings.HasPrefix(req.MediaType, "video/")

		if isAudio {
			// Resolve voice client, model, and context window
			voiceClient, voiceModel, voiceCtxSize, voiceParams := e.ResolveLLMClient(conv.ID, req.IntegrationID, cfg.Voice, "whisper-1", cfg.RequestTimeout)

			_ = e.Store.UpdateActivityLog(logID, "in_progress", "Transcribing received voice note...", "")

			format := "mp3"
			if strings.Contains(req.MediaType, "wav") {
				format = "wav"
			} else if strings.Contains(req.MediaType, "aac") {
				format = "aac"
			} else if strings.Contains(req.MediaType, "ogg") || strings.Contains(req.MediaType, "opus") {
				format = "opus"
			} else if strings.Contains(req.MediaType, "m4a") || strings.Contains(req.MediaType, "mp4") {
				format = "m4a"
			} else if strings.Contains(req.MediaType, "3gpp") || strings.Contains(req.MediaType, "3gp") {
				format = "3gp"
			}

			// Inspect audio header bytes for precise format
			if rawAudio, decodeErr := llm.DecodeBase64Flexible(req.MediaData); decodeErr == nil && len(rawAudio) >= 12 {
				if bytes.HasPrefix(rawAudio, []byte("RIFF")) {
					format = "wav"
				} else if bytes.HasPrefix(rawAudio, []byte("OggS")) {
					format = "opus"
				} else if len(rawAudio) >= 16 && (bytes.Contains(rawAudio[:16], []byte("ftyp")) || bytes.Contains(rawAudio[:16], []byte("moov"))) {
					format = "m4a"
				} else if len(rawAudio) >= 2 && rawAudio[0] == 0xFF && (rawAudio[1]&0xF0) == 0xF0 {
					format = "aac"
				}
			}

			// 1. First try dedicated audio transcription (e.g. Whisper endpoint /v1/audio/transcriptions)
			// For m4a/mp4 audio, try both format variants.
			transcriptFormats := []string{format}
			if format == "m4a" {
				transcriptFormats = []string{"m4a", "mp4", "mp3"}
			} else if format == "mp4" {
				transcriptFormats = []string{"mp4", "m4a", "mp3"}
			}

			var transcript string
			var transcriptErr error
			for _, tryFormat := range transcriptFormats {
				transcript, _, transcriptErr = voiceClient.TranscribeAudio(ctx, voiceModel, req.MediaData, tryFormat)
				if transcriptErr == nil && transcript != "" {
					if debugEnabled {
						log.Printf("[DEBUG] Voice transcription succeeded with format=%s", tryFormat)
					}
					break
				}
				if debugEnabled {
					log.Printf("[DEBUG] Voice transcription failed with format=%s: %v", tryFormat, transcriptErr)
				}
			}

			if transcriptErr == nil && transcript != "" {
				mediaDescription = "Voice Note: " + strings.TrimSpace(transcript)
				if debugEnabled {
					log.Printf("[DEBUG] Generated voice transcription via audio API: %s", mediaDescription)
				}
			} else {
				// 2. If transcription endpoint fails or returns error, try multimodal Chat endpoint (for direct audio chat models)
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

				reply, _, chatErr := voiceClient.Chat(ctx, voiceModel, analysisMsgs, voiceCtxSize, voiceParams)
				if chatErr == nil && reply != "" {
					mediaDescription = "Voice Note: " + strings.TrimSpace(reply)
					if debugEnabled {
						log.Printf("[DEBUG] Generated voice transcription/summary via Chat API: %s", mediaDescription)
					}
				} else {
					log.Printf("[WARN] Voice note audio analysis unavailable on model %s (transcribe err: %v, chat err: %v)", voiceModel, transcriptErr, chatErr)
					// Graceful fallback description so persona stays in character and does not receive a broken analysis failure
					mediaDescription = "Voice Note: [Voice message received]"
				}
			}
		} else if isVideo {
			// Resolve video client, model, and context window
			videoClient, videoModel, videoCtxSize, videoParams := e.ResolveLLMClient(conv.ID, req.IntegrationID, cfg.Video, chatModel, cfg.RequestTimeout)

			_ = e.Store.UpdateActivityLog(logID, "in_progress", "Analyzing received video...", "")

			analysisPrompt := "Identify what is happening in this video snap/clip. Describe the main subject, setting, actions, movements, mood, or anything spoken/shown. Summarize what occurs in 1-2 brief, descriptive sentences. Respond ONLY with the final summary."

			prefix := "data:video/mp4;base64,"
			if req.MediaType != "" {
				prefix = "data:" + req.MediaType + ";base64,"
			}

			analysisMsgs := []llm.Message{
				{
					Role:    "user",
					Content: analysisPrompt,
					Videos:  []string{prefix + req.MediaData},
				},
			}

			reply, _, err := videoClient.Chat(ctx, videoModel, analysisMsgs, videoCtxSize, videoParams)
			if err != nil {
				log.Printf("[ERROR] Video analysis failed: %v", err)
				mediaDescription = "Video Clip: (analysis failed)"
			} else {
				mediaDescription = "Video Clip: " + strings.TrimSpace(reply)
				if debugEnabled {
					log.Printf("[DEBUG] Generated media summary (video): %s", mediaDescription)
				}
			}
		} else {
			// Resolve image client, model, and context window
			imageClient, imageModel, imageCtxSize, imageParams := e.ResolveLLMClient(conv.ID, req.IntegrationID, cfg.Image, chatModel, cfg.RequestTimeout)

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

			reply, _, err := imageClient.Chat(ctx, imageModel, analysisMsgs, imageCtxSize, imageParams)
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
	timezone := e.Store.ResolveConfig(conv.ID, req.IntegrationID, "timezone", "UTC")
	userLocation := e.Store.ResolveConfig(conv.ID, req.IntegrationID, "user_location", "")

	system := persona
	if system != "" {
		system += "\n\n"
	}

	if conv.ChatType != "" {
		system += fmt.Sprintf("You are in a %s chat. Stay fully in character — never break the persona.", conv.ChatType) + "\n"
	}

	timeCtx := timeutil.BuildTimeContext(time.Now().UTC(), userLocation, timezone)
	system += timeCtx + "\n"
	system += "## Contextual & Temporal Guidelines" + "\n"
	system += "- Be temporally and situationally aware. Your current activities, greetings, and tone should realistically match the current time of day and location." + "\n"
	system += "- When asked 'what are you doing?' or 'what are you up to?', reply with activities that make sense for this exact time of day (e.g. at 3am: scrolling phone in bed, can't sleep, winding down, late night studying/gaming; in the afternoon: working, running errands, hanging out; in the evening: dinner, relaxing)." + "\n"
	system += "- When asked for the time (e.g. 'what time is it?', 'what time is it over there?'), reply casually and naturally like a normal human texting a friend — rounded or natural (e.g. 'around 3am', '3:15', 'almost 4 in the morning', 'evening 4ish', 'quarter past 5'). Never reply with robotic ISO timestamps, machine-like time strings, or seconds." + "\n"
	system += "- Never mention or volunteer the time unprompted. Only state the time when explicitly asked or when naturally relevant to the flow of conversation." + "\n\n"

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
				} else if strings.HasPrefix(m.MediaDescription, "Video Clip: ") {
					content = fmt.Sprintf("%s\n[Received Video Snap/Clip: %s]", content, strings.TrimPrefix(m.MediaDescription, "Video Clip: "))
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

	reply, stats, err := chatClient.Chat(ctx, chatModel, msgs, chatContextSize, chatParams)
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

func (e *Engine) ResolveLLMClient(convID, integrationID string, setting ModelSetting, defaultModel string, globalTimeout int) (LLM, string, int, llm.SamplingParams) {
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

	// Build sampling params with recommended defaults when not explicitly set
	params := llm.SamplingParams{
		Temperature:       setting.Temperature,
		TopP:              setting.TopP,
		TopK:              setting.TopK,
		MinP:              setting.MinP,
		RepetitionPenalty: setting.RepetitionPenalty,
		ThinkingLevel:     setting.ThinkingLevel,
	}
	if params.Temperature == 0 {
		params.Temperature = 1.15
	}
	if params.TopP == 0 {
		params.TopP = 0.94
	}
	if params.TopK == 0 {
		params.TopK = 64
	}
	if params.MinP == 0 {
		params.MinP = 0.01
	}
	if params.RepetitionPenalty == 0 {
		params.RepetitionPenalty = 1.15
	}
	if params.ThinkingLevel == "" {
		params.ThinkingLevel = "high"
	}

	client := e.NewLLM(url, key, timeout)
	return client, model, ctxSize, params
}

func ParseModelConfig(value string, defaultModel string) ModelConfig {
	var cfg ModelConfig
	if err := json.Unmarshal([]byte(value), &cfg); err == nil && (cfg.Chat.Model != "" || cfg.Summary.Model != "" || cfg.Image.Model != "" || cfg.Voice.Model != "" || cfg.Video.Model != "") {
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
