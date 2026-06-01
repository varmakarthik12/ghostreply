package summary

import (
	"context"
	"testing"
	"time"

	"github.com/varmakarthik12/ghostreply/internal/chat"
	"github.com/varmakarthik12/ghostreply/internal/db"
)

func TestNewWorker(t *testing.T) {
	store, _ := db.NewStore(":memory:")
	engine := chat.NewEngine(store, "", nil)
	worker := NewWorker(store, engine, 1*time.Minute)
	if worker.Interval != 1*time.Minute {
		t.Errorf("expected 1m, got %v", worker.Interval)
	}
}

func TestWorkerRunOncePurge(t *testing.T) {
	store, _ := db.NewStore(":memory:")
	
	// Create server session
	sessionID, _ := store.CreateServerSession()
	
	// Insert 10 days old activity log
	oldLog := &db.ActivityLog{
		ID:             "old-log",
		SessionID:      sessionID,
		Type:           "engine",
		ConversationID: "conv1",
		RequestType:    "auto_reply",
		Status:         "success",
		CreatedAt:      time.Now().UTC().AddDate(0, 0, -10).Format(time.RFC3339Nano),
	}
	_ = store.CreateActivityLog(oldLog)
	
	// Configure activity_log_keep_days to 7
	_ = store.UpsertConfig(&db.Config{
		Scope: "global",
		Key:   "activity_log_keep_days",
		Value: "7",
	})
	
	engine := chat.NewEngine(store, "", nil)
	worker := NewWorker(store, engine, 1*time.Minute)
	
	// Call RunOnce
	worker.RunOnce(context.Background())
	
	// Verify that "old-log" is purged
	_, err := store.GetActivityLogByID("old-log")
	if err == nil {
		t.Error("expected old-log to be purged by worker RunOnce")
	}
}
