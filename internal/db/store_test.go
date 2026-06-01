package db

import (
	"os"
	"testing"
	"time"
)

func TestNewStore(t *testing.T) {
	dbPath := "test_newstore.db"
	os.Remove(dbPath)
	defer os.Remove(dbPath)

	store, err := NewStore(dbPath)
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()

	if store.DB == nil {
		t.Fatal("expected DB to be initialized")
	}
}

func TestPurgeActivityLogs(t *testing.T) {
	store, err := NewStore(":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()

	// Create a server session first (needed because of foreign key constraints on activity_logs)
	sessionID, err := store.CreateServerSession()
	if err != nil {
		t.Fatal(err)
	}

	// Insert old activity log (10 days old)
	oldLog := &ActivityLog{
		ID:             "old-log",
		SessionID:      sessionID,
		Type:           "engine",
		ConversationID: "conv1",
		RequestType:    "auto_reply",
		Status:         "success",
		CreatedAt:      time.Now().UTC().AddDate(0, 0, -10).Format(time.RFC3339Nano),
	}
	if err := store.CreateActivityLog(oldLog); err != nil {
		t.Fatal(err)
	}

	// Insert new activity log (2 days old)
	newLog := &ActivityLog{
		ID:             "new-log",
		SessionID:      sessionID,
		Type:           "engine",
		ConversationID: "conv2",
		RequestType:    "auto_reply",
		Status:         "success",
		CreatedAt:      time.Now().UTC().AddDate(0, 0, -2).Format(time.RFC3339Nano),
	}
	if err := store.CreateActivityLog(newLog); err != nil {
		t.Fatal(err)
	}

	// Purge logs older than 7 days
	purged, err := store.PurgeActivityLogs(7)
	if err != nil {
		t.Fatal(err)
	}
	if purged != 1 {
		t.Errorf("expected 1 purged row, got %d", purged)
	}

	// Verify old log is gone and new log is present
	_, err = store.GetActivityLogByID("old-log")
	if err == nil {
		t.Error("expected old-log to be deleted")
	}
	_, err = store.GetActivityLogByID("new-log")
	if err != nil {
		t.Errorf("expected new-log to exist, got error: %v", err)
	}

	// Purge with 0 days should do nothing
	purged, err = store.PurgeActivityLogs(0)
	if err != nil {
		t.Fatal(err)
	}
	if purged != 0 {
		t.Errorf("expected 0 purged rows with keepDays=0, got %d", purged)
	}
}
