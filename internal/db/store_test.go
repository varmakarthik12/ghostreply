package db

import (
	"os"
	"testing"
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
