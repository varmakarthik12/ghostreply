package summary

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"strconv"
	"time"

	"github.com/google/uuid"
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
	// Auto-purge old activity logs
	keepDaysStr := w.Store.GetConfigValue("activity_log_keep_days", "7")
	if keepDays, err := strconv.Atoi(keepDaysStr); err == nil && keepDays > 0 {
		if rows, err := w.Store.PurgeActivityLogs(keepDays); err == nil {
			if rows > 0 {
				log.Printf("summary worker: purged %d old activity log entries", rows)
			}
		} else {
			log.Printf("summary worker: failed to purge activity logs: %v", err)
		}
	}

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
	// Spec: summarize if count >= msgThresh OR tokens >= tokThresh
	// Logic: skip if count < msgThresh AND tokens < tokThresh
	if count < msgThresh && tokens < tokThresh {
		return nil
	}
	return w.Summarize(ctx, conversationID, "auto_summary")
}

// Summarize forces an immediate summarization of a conversation.
func (w *Worker) Summarize(ctx context.Context, conversationID string, requestType string) error {
	maxPreviousSummaries := 5
	conv, err := w.Store.FindConversationByID(conversationID)
	if err != nil {
		return err
	}

	// Create Activity Log
	logID := uuid.NewString()
	activityLog := &db.ActivityLog{
		ID:                logID,
		Type:              "summary",
		ConversationID:    conv.ID,
		ConversationTitle: conv.Title,
		RequestType:       requestType,
		Status:            "pending",
	}
	_ = w.Store.CreateActivityLog(activityLog)

	msgs, err := w.Store.RecentMessages(conversationID, 0)
	if err != nil {
		_ = w.Store.UpdateActivityLog(logID, "failure", err.Error(), "")
		return err
	}
	if len(msgs) == 0 {
		_ = w.Store.UpdateActivityLog(logID, "cancelled", "No messages to summarize", "")
		return nil
	}

	_ = w.Store.UpdateActivityLog(logID, "in_progress", "Preparing context...", "")

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
		if i >= maxPreviousSummaries-1 {
			break
		}
	}

	var body string
	for _, m := range msgs {
		label := "USER"
		if m.IsOutbound == 1 {
			label = "HOST"
		}
		body += fmt.Sprintf("[%s]: %s\n", label, m.Content)
	}

	prompt := `
You are a conversation memory assistant. Read the previous summary (if any) and the recent conversation, then produce a comprehensive, structured memory summary.

Organize the summary into these clear sections:

### 1. User Profile & Disclosed Facts
- Core Identity: Name, age/birthdate, location/hometown/timezone, occupation/school/field of study.
- Personal Background: Family, friends, pets, relationship status, living situation.
- Lifestyle & Preferences: Hobbies, daily routine, favorite things, dislikes, quirks.
- Specific Details: Any personal stories, plans, secrets, or specific facts the user has ever shared.

### 2. Host Persona & Disclosed Facts
- Everything the HOST has claimed or shared about themselves (age, location, job, routine, opinions). The host must NEVER contradict these facts in future chats.

### 3. Relationship Dynamic & Tone
- Stage of relationship (e.g. strangers, friends, close friends, flirting, banter).
- Established tone, nicknames, inside jokes, topics they bond over, boundaries.

### 4. Recent Context & Ongoing Threads
- Latest topics discussed in the most recent messages.
- Active storylines, open questions, plans mentioned, current mood/vibe.

CRITICAL RULES:
- PERMANENT MEMORY: NEVER drop, forget, or contradict facts from the Previous Summary (especially User age, location, occupation, family, background, preferences, and Host facts). Always carry them forward and append/update with any new information.
- Use concrete details and exact names/places/facts rather than vague generalizations.
- If a detail is unknown, simply omit it — never guess or invent facts.
- Keep the overall summary clean, structured, and easy for an AI to parse (2,000 to 2,500 words max).
	`

	if prevContext != "" {
		prompt += "\n" + "## Previous Summary (if any)" + "\n" + prevContext + "\n"
	}
	prompt += "\n" + "## Conversation to Summarize" + "\n" + body

	modelValue := w.Store.ResolveModel(conversationID, conv.IntegrationID, chat.DefaultModel)
	cfg := chat.ParseModelConfig(modelValue, chat.DefaultModel)

	summaryClient, summaryModel, summaryCtxSize, summaryParams := w.Engine.ResolveLLMClient(conversationID, conv.IntegrationID, cfg.Summary, cfg.Chat.Model, cfg.RequestTimeout)

	_ = w.Store.UpdateActivityLog(logID, "in_progress", "Generating summary with "+summaryModel, "")

	reply, stats, err := summaryClient.Chat(ctx, summaryModel, []llm.Message{
		{Role: "system", Content: "You are a meticulous conversation memory archivist. Your output is injected directly into a chat AI system prompt. Produce a structured, durable memory document with distinct sections for User Profile, Host Persona Facts, Relationship Dynamic, and Recent Threads. Always preserve all known personal facts (age, location, background, preferences) so the AI never forgets them across conversations. Never invent facts."},
		{Role: "user", Content: prompt},
	}, summaryCtxSize, summaryParams)
	if err != nil {
		log.Printf("[ERROR] Summarization failed for conversation %s: %v", conversationID, err)
		_ = w.Store.UpdateActivityLog(logID, "failure", err.Error(), "")
		return err
	}

	log.Printf("[DEBUG] Summarization Usage for conv %s: Input=%d, Output=%d, Total=%d", conversationID, stats.PromptTokens, stats.CompletionTokens, stats.TotalTokens)

	// Delete old summaries before inserting the new all-inclusive one.
	if err := w.Store.DeleteAllSummariesForConversation(conversationID); err != nil {
		_ = w.Store.UpdateActivityLog(logID, "failure", "delete old summaries: "+err.Error(), "")
		return fmt.Errorf("delete old summaries: %w", err)
	}
	if err := w.Store.InsertSummary(&db.Summary{ConversationID: conversationID, Text: reply}); err != nil {
		_ = w.Store.UpdateActivityLog(logID, "failure", "insert summary: "+err.Error(), "")
		return err
	}
	// Delete ALL messages that were just summarized.
	if err := w.Store.DeleteAllMessages(conversationID); err != nil {
		_ = w.Store.UpdateActivityLog(logID, "failure", "delete summarized messages: "+err.Error(), "")
		return fmt.Errorf("delete summarized messages: %w", err)
	}

	meta, _ := json.Marshal(stats)
	_ = w.Store.UpdateActivityLog(logID, "success", "", string(meta))
	return nil
}

func estimateTokensFor(store *db.Store, conversationID string, count int) int {
	msgs, err := store.RecentMessages(conversationID, count)
	if err != nil {
		return 0
	}
	llmMsgs := make([]llm.Message, len(msgs))
	for i, m := range msgs {
		role := "user"
		if m.IsOutbound == 1 {
			role = "assistant"
		}
		llmMsgs[i] = llm.Message{Role: role, Content: m.Content}
	}
	return llm.EstimateTokens(llmMsgs)
}

func atoi(s string, def int) int {
	n, err := strconv.Atoi(s)
	if err != nil {
		return def
	}
	return n
}
