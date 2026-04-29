package db

import (
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"fmt"
	"strings"
	"sync"

	_ "github.com/mattn/go-sqlite3"
)

type Store struct {
	db *sql.DB
	mu sync.RWMutex
}

func NewStore(path string) (*Store, error) {
	db, err := sql.Open("sqlite3", path+"?_foreign_keys=on&_journal_mode=WAL")
	if err != nil {
		return nil, err
	}
	if _, err := db.Exec(Schema); err != nil {
		db.Close()
		return nil, fmt.Errorf("schema migration failed: %w", err)
	}
	return &Store{db: db}, nil
}

func (s *Store) Close() error { return s.db.Close() }

// Dedup hash: SHA256(lower(trimmed(content))|sender_id|unix_ts/60)
func DedupHash(content, senderID string, unixSec int64) string {
	key := fmt.Sprintf("%s|%s|%d",
		strings.ToLower(strings.TrimSpace(content)),
		senderID,
		unixSec/60)
	h := sha256.Sum256([]byte(key))
	return hex.EncodeToString(h[:])
}

// Integrations
func (s *Store) CreateIntegration(id, appType, displayName string) error {
	_, err := s.db.Exec(
		"INSERT OR REPLACE INTO integrations (id, app_type, display_name) VALUES (?, ?, ?)",
		id, appType, displayName)
	return err
}

func (s *Store) GetIntegration(id string) (*Integration, error) {
	i := &Integration{}
	err := s.db.QueryRow(
		"SELECT id, app_type, display_name, created_at FROM integrations WHERE id = ?",
		id).Scan(&i.ID, &i.AppType, &i.DisplayName, &i.CreatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return i, err
}

func (s *Store) ListIntegrations() ([]*Integration, error) {
	rows, err := s.db.Query("SELECT id, app_type, display_name, created_at FROM integrations ORDER BY created_at DESC")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var result []*Integration
	for rows.Next() {
		i := &Integration{}
		if err := rows.Scan(&i.ID, &i.AppType, &i.DisplayName, &i.CreatedAt); err != nil {
			return nil, err
		}
		result = append(result, i)
	}
	return result, rows.Err()
}

func (s *Store) DeleteIntegration(id string) error {
	_, err := s.db.Exec("DELETE FROM integrations WHERE id = ?", id)
	return err
}

type Integration struct {
	ID          string `json:"id"`
	AppType     string `json:"app_type"`
	DisplayName string `json:"display_name"`
	CreatedAt   string `json:"created_at"`
}
