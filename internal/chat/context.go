package chat

import (
	"fmt"
	"github.com/varmakarthik12/ghostreply/internal/db"
	"github.com/varmakarthik12/ghostreply/internal/llm"
)

type ContextAssembler struct {
	store        *db.Store
	convID       string
	integrationID string
	config       map[string]interface{}
}

func NewContextAssembler(store *db.Store, convID, integrationID string, config map[string]interface{}) *ContextAssembler {
	return &ContextAssembler{store: store, convID: convID, integrationID: integrationID, config: config}
}

func (a *ContextAssembler) Assemble() (string, []llm.Turn, error) {
	// Block 1: System prompts
	systemPrompts, _ := a.store.GetSystemPrompts("global", "", true)
	intPrompts, _ := a.store.GetSystemPrompts("integration", a.integrationID, true)
	convPrompts, _ := a.store.GetSystemPrompts("conversation", a.convID, true)
	allPrompts := append(append(systemPrompts, intPrompts...), convPrompts...)
	system := ""
	for _, p := range allPrompts {
		system += p.Content + "\n\n"
	}
	if persona, ok := a.config["host_persona_description"].(string); ok && persona != "" {
		system += "HOST PERSONALITY: " + persona + "\n\n"
	}
	// Block 2: Identity context (cross-conversation)
	if getBool(a.config, "cross_conversation_memory") {
		if link, _ := a.store.GetLinkedIdentity(a.integrationID, "target"); link != nil {
			if sm, _ := a.store.GetSummary(link.LinkedIntegrationID + "::" + link.LinkedSenderID); sm != nil {
				system += fmt.Sprintf("CROSS-APP CONTEXT for %s: %s\n\n", link.UnifiedDisplayName, sm.SummaryText)
			}
		}
	}
	// Block 4: Conversation summary
	if sm, _ := a.store.GetSummary(a.convID); sm != nil {
		system += fmt.Sprintf("CONVERSATION SUMMARY (up to %s): %s\n\n", sm.CreatedAt, sm.SummaryText)
	}
	// Block 5: Recent messages
	maxMsgs := getInt(a.config, "max_context_messages", 30)
	msgs, err := a.store.GetMessages(a.convID, maxMsgs)
	if err != nil {
		return "", nil, err
	}
	turns := make([]llm.Turn, 0, len(msgs))
	for _, m := range msgs {
		role := "user"
		if m.SenderType == "host" {
			role = "assistant"
		}
		senderName := m.SenderDisplayName
		if senderName == "" { senderName = m.SenderUsername }
		if senderName == "" { senderName = m.SenderID }
		turns = append(turns, llm.Turn{
			Role: role,
			Content: fmt.Sprintf("[%s] %s (%s): %s", m.Timestamp, senderName, m.SenderType, m.Content),
		})
	}
	// Block 6: Reply instruction
	turns = append(turns, llm.Turn{
		Role: "user",
		Content: "Reply as the host. Respond naturally in the host's tone and style. If this is a group conversation, address appropriate people. Output ONLY the reply text. No meta-commentary. No quotation marks. Match the host's typical message length.",
	})
	return system, turns, nil
}

func getInt(m map[string]interface{}, key string, def int) int {
	if v, ok := m[key]; ok {
		if i, ok := v.(int); ok { return i }
	}
	return def
}

func NewProviderFromConfig(cfg *db.ModelConfig) (llm.Provider, error) {
	switch cfg.Provider {
	case "ollama":
		return llm.NewOllamaProvider(cfg.BaseURL, cfg.ModelName, cfg.ContextWindowTokens), nil
	default: // openai or any OpenAI-compatible
		return llm.NewOpenAICompatProvider(cfg.BaseURL, cfg.ModelName, cfg.APIKey, cfg.ContextWindowTokens), nil
	}
}
