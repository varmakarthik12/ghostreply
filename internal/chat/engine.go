package chat

import (
	"context"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/varmakarthik12/ghostreply/internal/db"
)

var (
	inflight  sync.Map // conversationId -> context.CancelFunc
	convMutex sync.Map // conversationId -> *sync.Mutex
)

func getConvMutex(convID string) *sync.Mutex {
	actual, _ := convMutex.LoadOrStore(convID, &sync.Mutex{})
	return actual.(*sync.Mutex)
}

type ChatRequest struct {
	IntegrationID    string                `json:"integration_id"`
	ConversationType string                `json:"conversation_type"` // individual|group
	ConversationID   string                `json:"conversation_id,omitempty"`
	ForceReply       bool                  `json:"force_reply"`
	Messages         []db.IncomingMessage  `json:"messages"`
}

type ChatResponse struct {
	Reply         string `json:"reply,omitempty"`
	ConversationID string `json:"conversation_id"`
	Skipped       bool   `json:"skipped"`
	SkipReason    string `json:"skip_reason,omitempty"` // group_no_force|waiting_for_target|duplicate_only
}

type Engine struct {
	store *db.Store
}

func NewEngine(store *db.Store) *Engine { return &Engine{store: store} }

func (e *Engine) HandleChat(ctx context.Context, req ChatRequest) (*ChatResponse, error) {
	convID := req.ConversationID
	if convID == "" {
		convID = req.IntegrationID + "::" + uuid.NewString()
	}

	// Auto-create integration if not exists
	if existingIntegration, _ := e.store.GetIntegration(req.IntegrationID); existingIntegration == nil {
		e.store.CreateIntegration(req.IntegrationID, "custom", req.IntegrationID)
	}
	// Auto-create conversation if not exists
	if existingConv, _ := e.store.GetConversation(convID); existingConv == nil {
		c := &db.Conversation{ID: convID, IntegrationID: req.IntegrationID, ConvType: req.ConversationType}
		e.store.CreateConversation(c)
	}

	// Step 2: Save messages, skip duplicates
	insertedCount := 0
	for _, m := range req.Messages {
		deh := db.DedupHash(m.Content, m.SenderID, m.Timestamp.Unix())
		exists, _ := e.store.MessageExists(convID, deh)
		if !exists {
			deh2 := deh + "_" + m.SenderType
			e.store.SaveMessage(m, convID, deh2)
			insertedCount++
		}
	}

	// Step 3: In-flight management
	mutex := getConvMutex(convID)
	mutex.Lock()
	defer mutex.Unlock()

	if val, ok := inflight.Load(convID); ok {
		if cancel, ok2 := val.(context.CancelFunc); ok2 && cancel != nil {
			cancel()
		}
	}
	reqCtx, cancel := context.WithCancel(ctx)
	inflight.Store(convID, cancel)
	defer func() { inflight.Delete(convID); cancel() }()

	// Step 4: Resolve config
	config := e.store.GetMergedConfig(convID)

	// Step 5: Group reply guard
	if req.ConversationType == "group" {
		if !getBool(config, "auto_reply_groups") && !req.ForceReply {
			return &ChatResponse{ConversationID: convID, Skipped: true, SkipReason: "group_no_force"}, nil
		}
	}

	// Step 6: Multi-reply guard
	if !getBool(config, "allow_multi_reply") {
		last, _ := e.store.GetLastMessage(convID)
		if last != nil && last.SenderType == "host" {
			return &ChatResponse{ConversationID: convID, Skipped: true, SkipReason: "waiting_for_target"}, nil
		}
	}

	// Step 7: Duplicate-only guard
	if insertedCount == 0 && len(req.Messages) > 0 {
		return &ChatResponse{ConversationID: convID, Skipped: true, SkipReason: "duplicate_only"}, nil
	}

	// Step 8-9: Assemble context and call LLM
	assembly := NewContextAssembler(e.store, convID, req.IntegrationID, config)
	systemPrompt, turns, err := assembly.Assemble()
	if err != nil {
		return nil, err
	}
	modelCfg := e.store.GetEffectiveModelConfig(convID, req.IntegrationID)
	provider, err := NewProviderFromConfig(modelCfg)
	if err != nil {
		return nil, err
	}
	// Token budget check
	fullPrompt := systemPrompt
	for _, t := range turns { fullPrompt += "\n" + t.Content }
	estimated := provider.EstimateTokens(fullPrompt)
	maxAllowed := int(float64(provider.ContextWindow()) * 0.80)
	for estimated > maxAllowed && len(turns) > 10 {
		turns = turns[1:]
		fullPrompt = systemPrompt
		for _, t := range turns { fullPrompt += "\n" + t.Content }
		estimated = provider.EstimateTokens(fullPrompt)
	}
	reply, err := provider.Chat(reqCtx, systemPrompt, turns)
	if err != nil {
		return nil, err
	}

	// Step 10: Persist reply as host message
	replyMsg := db.IncomingMessage{
		Timestamp:  time.Now().UTC(),
		Content:    reply,
		SenderType: "host",
		SenderID:   "host",
	}
	e.store.SaveMessage(replyMsg, convID, db.DedupHash(reply, "host", replyMsg.Timestamp.Unix()))

	return &ChatResponse{Reply: reply, ConversationID: convID, Skipped: false}, nil
}

func getBool(m map[string]interface{}, key string) bool {
	if v, ok := m[key]; ok {
		if b, ok := v.(bool); ok { return b }
	}
	return false
}
