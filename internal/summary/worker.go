package summary

import (
	"context"
	"fmt"
	"log"
	"strconv"
	"time"

	"github.com/varmakarthik12/ghostreply/internal/chat"
	"github.com/varmakarthik12/ghostreply/internal/db"
	"github.com/varmakarthik12/ghostreply/internal/llm"
)

type Worker struct {
	Store    *db.Store
	Engine   *chat.Engine
	Interval time.Duration
	stop     chan struct{}
}

func NewWorker(store *db.Store, engine *chat.Engine, interval time.Duration) *Worker {
	if interval <= 0 {
		interval = 5 * time.Minute
	}
	return &Worker{Store: store, Engine: engine, Interval: interval, stop: make(chan struct{})}
}

func (w *Worker) Start() {
	go w.loop()
}

func (w *Worker) Stop() { close(w.stop) }

func (w *Worker) loop() {
	t := time.NewTicker(w.Interval)
	defer t.Stop()
	for {
		select {
		case <-w.stop:
			return
		case <-t.C:
			w.RunOnce(context.Background())
		}
	}
}

func (w *Worker) RunOnce(ctx context.Context) {
	convs, err := w.Store.ListConversations("")
	if err != nil {
		return
	}
	msgThresh := atoi(w.Store.GetConfigValue("summary_threshold", "50"), 50)
	tokThresh := atoi(w.Store.GetConfigValue("token_threshold", "4000"), 4000)
	for _, c := range convs {
		if err := w.SummarizeIfNeeded(ctx, c.ID, msgThresh, tokThresh); err != nil {
			log.Printf("summary worker: %s: %v", c.ID, err)
		}
	}
}

// SummarizeIfNeeded returns nil if no summary needed.
func (w *Worker) SummarizeIfNeeded(ctx context.Context, conversationID string, msgThresh, tokThresh int) error {
	count, err := w.Store.CountMessages(conversationID)
	if err != nil {
		return err
	}
	if count == 0 {
		return nil
	}
	tokens := estimateTokensFor(w.Store, conversationID, count)
	if count < msgThresh && tokens < tokThresh {
		return nil
	}
	return w.Summarize(ctx, conversationID)
}

// Summarize forces an immediate summarization of a conversation.
// It always chains all previous summaries to build a complete picture,
// then deletes all summarized messages and all old summaries, leaving
// exactly one up-to-date summary.
func (w *Worker) Summarize(ctx context.Context, conversationID string) error {
	conv, err := w.Store.FindConversationByID(conversationID)
	if err != nil {
		return err
	}
	msgs, err := w.Store.RecentMessages(conversationID, 1000)
	if err != nil {
		return err
	}
	if len(msgs) == 0 {
		return nil
	}

	// Collect ALL previous summaries oldest-first to build a cumulative context.
	prevSummaries, _ := w.Store.ListSummaries(conversationID)
	// ListSummaries returns newest-first; reverse so oldest is first.
	for i, j := 0, len(prevSummaries)-1; i < j; i, j = i+1, j-1 {
		prevSummaries[i], prevSummaries[j] = prevSummaries[j], prevSummaries[i]
	}
	var prevContext string
	for i, sm := range prevSummaries {
		if i == 0 {
			prevContext = sm.Text
		} else {
			prevContext += "\n" + sm.Text
		}
	}

	var body string
	for _, m := range msgs {
		label := "them"
		if m.IsOutbound == 1 {
			label = "me"
		}
		if m.SenderName != "" && m.IsOutbound == 0 {
			label = m.SenderName
		}
		body += fmt.Sprintf("%s: %s\n", label, m.Content)
	}

	prompt := "You are building a memory summary that will be injected into a chat AI system prompt to help it reply naturally as a specific person." + "\n"
	prompt += "Your job is NOT to write a story recap and NOT to create a list of topics to redirect the conversation to." + "\n"
	prompt += "Produce a structured snapshot the AI uses to: sound like the same person, remember what the other person shared, and match the emotional tone." + "\n\n"
	prompt += "Format your output using exactly these section headers:" + "\n\n"
	prompt += "**My speaking style:** How does 'me' text? Sentence length, vocabulary, humor level, formality, recurring words or phrases, quirks." + "\n\n"
	prompt += "**Relationship dynamic:** How do we talk to each other? Flirty, friendly, playful, guarded? What is the vibe and push-pull between us?" + "\n\n"
	prompt += "**What they've shared about themselves:** Personal details, feelings, stories, preferences the other person mentioned." + "\n\n"
	prompt += "**What I've shared about myself:** Personal details or stories I mentioned. Be vague where nothing concrete was said." + "\n\n"
	prompt += "**Recent conversation thread:** 2-3 sentences on what we were just talking about and the emotional direction." + "\n\n"
	prompt += "**Active context:** Background things to be aware of — NOT topics to redirect to. Just things that might come up naturally." + "\n"

	if prevContext != "" {
		prompt += "---" + "\n" + "Previous memory (keep this, update it with new info):" + "\n" + prevContext + "\n"
	}
	prompt += "---" + "\n" + "New messages to incorporate:" + "\n" + body

	modelValue := w.Store.ResolveModel(conversationID, conv.IntegrationID, chat.DefaultModel)
	modelName, _ := chat.ParseModelConfig(modelValue, chat.DefaultModel)
	baseURL := w.Store.GetConfigValue("llm_url", w.Engine.LLMURL)
	apiKey := w.Store.GetConfigValue("llm_key", "")
	client := w.Engine.NewLLM(baseURL, apiKey)
	reply, err := client.Chat(ctx, modelName, []llm.Message{
		{Role: "system", Content: "You are a conversation memory writer. Your output is injected into a chat AI system prompt to help it impersonate a real person. Be specific and structured. Never create a topic redirect list. Never suggest what the AI should steer the conversation toward. Just capture voice, relationship, facts, and recent thread accurately."},
		{Role: "user", Content: prompt},
	})
	if err != nil {
		log.Printf("[ERROR] Summarization failed for conversation %s: %v", conversationID, err)
		return err
	}

	// Delete old summaries before inserting the new all-inclusive one.
	if err := w.Store.DeleteAllSummariesForConversation(conversationID); err != nil {
		return fmt.Errorf("delete old summaries: %w", err)
	}
	if err := w.Store.InsertSummary(&db.Summary{ConversationID: conversationID, Text: reply}); err != nil {
		return err
	}
	// Delete ALL messages that were just summarized.
	if err := w.Store.DeleteAllMessages(conversationID); err != nil {
		return fmt.Errorf("delete summarized messages: %w", err)
	}
	return nil
}

func estimateTokensFor(store *db.Store, conversationID string, count int) int {
	msgs, err := store.RecentMessages(conversationID, count)
	if err != nil {
		return 0
	}
	total := 0
	for _, m := range msgs {
		total += len(m.Content) / 4
	}
	return total
}

func atoi(s string, def int) int {
	n, err := strconv.Atoi(s)
	if err != nil {
		return def
	}
	return n
}
