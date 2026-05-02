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
			prevContext += "\n\n" + sm.Text
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

	prompt := `You are building a memory summary that will be injected into a chat AI's system prompt to help it reply naturally as a specific person.

Your job is NOT to write a story recap. Instead, produce a structured summary that the AI can use to:
1. Sound exactly like the same person who wrote the previous messages
2. Remember what the other person shared and bring it up naturally
3. Continue the emotional tone and relationship dynamic

Format your summary like this:

**My speaking style:** [Describe how "me" texts — sentence length, vocabulary, use of humor, level of formality, any recurring phrases or quirks]

**Relationship dynamic:** [How do we talk to each other? Flirty, friendly, playful, guarded, warm? What's the vibe?]

**What they've shared about themselves:** [List any personal details, feelings, stories or facts the other person mentioned]

**What I've shared about myself:** [List any personal details, feelings, or stories I mentioned — be vague if nothing concrete was said]

**Recent conversation thread:** [2-3 sentence description of what we were just talking about and the emotional direction of the conversation]

**Active topics / things to follow up on:** [Anything left open, questions that weren't answered, things that felt important]`

	if prevContext != "" {
		prompt += "\n\n---\nPrevious memory (keep this, update it with new info):\n" + prevContext
	}
	prompt += "\n\n---\nNew messages to incorporate:\n" + body

	model := w.Store.ResolveModel(conversationID, conv.IntegrationID, chat.DefaultModel)
	baseURL := w.Store.GetConfigValue("llm_url", w.Engine.LLMURL)
	apiKey := w.Store.GetConfigValue("llm_key", "")
	client := w.Engine.NewLLM(baseURL, apiKey)
	reply, err := client.Chat(ctx, model, []llm.Message{
		{Role: "system", Content: "You are a conversation memory writer. Your output will be injected directly into a chat AI's system prompt to help it impersonate a real person accurately. Be specific, structured, and useful — not generic. Preserve all prior memory and update it with new information."},
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
