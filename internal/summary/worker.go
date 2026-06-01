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
	You are a memory compression assistant for a chat agent.

	## Your Job
	Read the conversation history below and produce a compact summary that captures everything the agent needs to stay consistent and human in future replies.

	## What to Capture (if present)
	- The other person's name, age, location, language, and any personal details they shared
	- Their current emotional state and how the conversation feels (cold, warm, flirty, trusting, etc.)
	- Key stories, problems, or life events they mentioned
	- How far the relationship has progressed (just met / building trust / emotionally close / flirting / intimate)
	- Anything the agent ("HOST") revealed about himself — even vague things
	- Any topics that were sensitive, avoided, or deflected
	- The last message sent and the current mood/vibe of the conversation

	## Output Format
	Write in plain paragraphs. No bullet points, no headers. Write it like briefing notes — dense, factual, third-person.

	## Hard Rules
	- Never invent or assume facts not present in the conversation
	- If something is unclear, omit it rather than guess
	- Do not include filler phrases like "the conversation went well" — only concrete facts and observed signals
	- Do not summarize what "[HOST]" is — only what happened in THIS conversation
	`

	if prevContext != "" {
		prompt += "\n" + "## Previous Summary (if any)" + "\n" + prevContext + "\n"
	}
	prompt += "\n" + "## Conversation to Summarize" + "\n" + body

	modelValue := w.Store.ResolveModel(conversationID, conv.IntegrationID, chat.DefaultModel)
	modelName, _, summaryModel, contextSize, requestTimeout := chat.ParseModelConfig(modelValue, chat.DefaultModel)

	if contextSize <= 0 {
		contextSize = 30000
	}

	// Use summary_model if explicitly configured, otherwise fallback to summary_model from modelValue, otherwise the general model
	finalModel := w.Store.ResolveConfig(conversationID, conv.IntegrationID, "summary_model", "")
	if finalModel == "" {
		finalModel = summaryModel
	}
	if finalModel == "" {
		finalModel = modelName
	}

	_ = w.Store.UpdateActivityLog(logID, "in_progress", "Generating summary with "+finalModel, "")

	baseURL := w.Store.GetConfigValue("llm_url", w.Engine.LLMURL)
	apiKey := w.Store.GetConfigValue("llm_key", "")
	client := w.Engine.NewLLM(baseURL, apiKey, time.Duration(requestTimeout)*time.Second)
	reply, stats, err := client.Chat(ctx, finalModel, []llm.Message{
		{Role: "system", Content: "You are a conversation memory writer. Your output is injected into a chat AI system prompt to help it impersonate a real person. Be specific and structured. Never create a topic redirect list. Never suggest what the AI should steer the conversation toward. Just capture voice, relationship, facts, and recent thread accurately."},
		{Role: "user", Content: prompt},
	}, contextSize)
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
