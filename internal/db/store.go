package db

import (
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/google/uuid"
	_ "modernc.org/sqlite"
)

type Store struct {
	DB *sql.DB
}

func NewStore(path string) (*Store, error) {
	dsn := path
	if path != ":memory:" {
		// Use pragma via DSN for modernc.org/sqlite
		// WAL mode for concurrency, busy_timeout to avoid lock errors
		dsn = path + "?_pragma=foreign_keys(1)&_pragma=journal_mode(WAL)&_pragma=busy_timeout(50000)&_pragma=synchronous(NORMAL)"
	}
	d, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, err
	}

	if _, err := d.Exec(Schema); err != nil {
		return nil, fmt.Errorf("schema: %w", err)
	}
	s := &Store{DB: d}
	if err := s.Migrate(); err != nil {
		return nil, fmt.Errorf("migrate: %w", err)
	}
	if err := s.Seed(); err != nil {
		return nil, fmt.Errorf("seed: %w", err)
	}
	return s, nil
}

func (s *Store) Close() error { return s.DB.Close() }

func (s *Store) Migrate() error {
	// SQLite doesn't support "IF NOT EXISTS" for ADD COLUMN directly in a simple way
	// We'll just try to add and ignore errors if they already exist,
	// or check manually. Checking manually is cleaner.

	addColumn := func(table, column, spec string) {
		_, err := s.DB.Exec(fmt.Sprintf("ALTER TABLE %s ADD COLUMN %s %s", table, column, spec))
		if err != nil {
			if strings.Contains(err.Error(), "duplicate column") {
				return
			}
			log.Printf("[DB] Migrate error on %s.%s: %v", table, column, err)
		} else {
			log.Printf("[DB] Successfully added column %s to table %s", column, table)
		}
	}

	addColumn("conversations", "chat_type", "TEXT")
	addColumn("messages", "sender_id", "TEXT")
	addColumn("messages", "sender_name", "TEXT")
	addColumn("configs", "updated_at", "DATETIME DEFAULT CURRENT_TIMESTAMP")

	// Migration for configs table UNIQUE constraint
	var configsSchema string
	s.DB.QueryRow("SELECT sql FROM sqlite_master WHERE type='table' AND name='configs'").Scan(&configsSchema)
	if !strings.Contains(configsSchema, "UNIQUE(scope, scope_id, key)") {
		log.Printf("[DB] Migrating configs table to new UNIQUE constraint...")
		tx, err := s.DB.Begin()
		if err == nil {
			_, _ = tx.Exec("ALTER TABLE configs RENAME TO configs_old")
			_, _ = tx.Exec(`CREATE TABLE configs (
				id       TEXT PRIMARY KEY,
				scope    TEXT NOT NULL,
				scope_id TEXT,
				key      TEXT NOT NULL,
				value    TEXT NOT NULL,
				updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
				UNIQUE(scope, scope_id, key)
			)`)
			_, _ = tx.Exec("INSERT INTO configs (id, scope, scope_id, key, value, updated_at) SELECT id, scope, scope_id, key, value, COALESCE(updated_at, CURRENT_TIMESTAMP) FROM configs_old")
			_, _ = tx.Exec("DROP TABLE configs_old")
			if err := tx.Commit(); err != nil {
				log.Printf("[DB] Failed to migrate configs table: %v", err)
			} else {
				log.Printf("[DB] Configs table migration successful")
			}
		}
	}

	return nil
}

func DedupHash(conversationID, messageID, content, timestamp string) string {
	normalizedTime := timestamp
	if timestamp != "" {
		// Try parsing as RFC3339 (standard ISO format with Z or offset)
		t, err := time.Parse(time.RFC3339, timestamp)
		if err != nil {
			// Try without Z/offset (common in some logs)
			t, err = time.Parse("2006-01-02T15:04:05", timestamp)
		}
		if err == nil {
			// Round to the second to ignore millisecond jitter
			normalizedTime = t.Truncate(time.Second).Format(time.RFC3339)
		}
	}

	// Use just conversationID, content and normalized timestamp for deduplication
	data := fmt.Sprintf("%s|%s|%s|%s", conversationID, content, normalizedTime, messageID)
	h := sha256.Sum256([]byte(data))
	return hex.EncodeToString(h[:])
}

func (s *Store) Seed() error {
	defaults := map[string]string{
		"llm_url":                            "http://localhost:11434",
		"summary_threshold":                  "50",
		"token_threshold":                    "4000",
		"max_context_messages":               "20",
		"reply_style":                        "brief",
		"max_consecutive_assistant_messages": "2",
		"debug_auto_reply":                   "false",
		"summary_model":                      "",
	}

	for k, v := range defaults {
		// Use INSERT OR IGNORE to only add if not present
		_, err := s.DB.Exec(`INSERT OR IGNORE INTO configs (id, scope, scope_id, key, value) VALUES (?, 'global', '', ?, ?)`,
			uuid.NewString(), k, v)
		if err != nil {
			return err
		}
	}
	return nil
}

// ----- types -----

type Integration struct {
	ID         string `json:"id"`
	Platform   string `json:"platform"`
	Account    string `json:"account"`
	Token      string `json:"token"`
	WebhookURL string `json:"webhook_url"`
	Active     int    `json:"active"`
	CreatedAt  string `json:"created_at"`
}

type Conversation struct {
	ID            string `json:"id"`
	IntegrationID string `json:"integration_id"`
	ExternalID    string `json:"external_id"`
	Title         string `json:"title"`
	ChatType      string `json:"chat_type"`
	CreatedAt     string `json:"created_at"`
}

type Message struct {
	ID             string `json:"id"`
	ConversationID string `json:"conversation_id"`
	IsOutbound     int    `json:"is_outbound"`
	Content        string `json:"content"`
	SenderID       string `json:"sender_id"`
	SenderName     string `json:"sender_name"`
	DedupHash      string `json:"dedup_hash"`
	Timestamp      string `json:"timestamp"`
}

type Summary struct {
	ID             string `json:"id"`
	ConversationID string `json:"conversation_id"`
	Text           string `json:"text"`
	CreatedAt      string `json:"created_at"`
}

type Config struct {
	ID      string `json:"id"`
	Scope   string `json:"scope"`
	ScopeID string `json:"scope_id"`
	Key     string `json:"key"`
	Value   string `json:"value"`
}

type ModelConfig struct {
	ID      string `json:"id"`
	Scope   string `json:"scope"`
	ScopeID string `json:"scope_id"`
	Value   string `json:"value"`
}

type IdentityLink struct {
	ID             string `json:"id"`
	HostUserID     string `json:"host_user_id"`
	Platform       string `json:"platform"`
	PlatformUserID string `json:"platform_user_id"`
}

type SystemPrompt struct {
	ID      string `json:"id"`
	Scope   string `json:"scope"`
	ScopeID string `json:"scope_id"`
	Text    string `json:"text"`
}

type ServerSession struct {
	ID        string `json:"id"`
	StartedAt string `json:"started_at"`
	StoppedAt string `json:"stopped_at,omitempty"`
}

type ActivityLog struct {
	ID                string `json:"id"`
	SessionID         string `json:"session_id"`
	Type              string `json:"type"`
	ConversationID    string `json:"conversation_id"`
	ConversationTitle string `json:"conversation_title"`
	RequestType       string `json:"request_type"`
	Status            string `json:"status"`
	ErrorMsg          string `json:"error_msg,omitempty"`
	Metadata          string `json:"metadata,omitempty"`
	CreatedAt         string `json:"created_at"`
	CompletedAt       string `json:"completed_at,omitempty"`
}

type OperationStats struct {
	SessionID string `json:"session_id"`
	Type      string `json:"type"`
	Status    string `json:"status"`
	Count     int    `json:"count"`
}

// ----- Integrations -----

func (s *Store) ListIntegrations() ([]Integration, error) {
	rows, err := s.DB.Query(`SELECT id, platform, account, COALESCE(token,''), COALESCE(webhook_url,''), active, created_at FROM integrations ORDER BY created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Integration{}
	for rows.Next() {
		var i Integration
		if err := rows.Scan(&i.ID, &i.Platform, &i.Account, &i.Token, &i.WebhookURL, &i.Active, &i.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, i)
	}
	return out, nil
}

func (s *Store) CreateIntegration(i *Integration) error {
	if i.ID == "" {
		i.ID = uuid.NewString()
	}
	if i.Active == 0 {
		i.Active = 1
	}
	_, err := s.DB.Exec(`INSERT INTO integrations (id, platform, account, token, webhook_url, active) VALUES (?,?,?,?,?,?)`,
		i.ID, i.Platform, i.Account, i.Token, i.WebhookURL, i.Active)
	return err
}

func (s *Store) UpdateIntegration(i *Integration) error {
	_, err := s.DB.Exec(`UPDATE integrations SET platform=?, account=?, token=?, webhook_url=?, active=? WHERE id=?`,
		i.Platform, i.Account, i.Token, i.WebhookURL, i.Active, i.ID)
	return err
}

func (s *Store) DeleteIntegration(id string) error {
	_, err := s.DB.Exec(`DELETE FROM integrations WHERE id=?`, id)
	return err
}

func (s *Store) GetActiveIntegrationByPlatform(platform string) (*Integration, error) {
	row := s.DB.QueryRow(`SELECT id, platform, account, COALESCE(token,''), COALESCE(webhook_url,''), active, created_at FROM integrations WHERE platform=? AND active=1 LIMIT 1`, platform)
	var i Integration
	if err := row.Scan(&i.ID, &i.Platform, &i.Account, &i.Token, &i.WebhookURL, &i.Active, &i.CreatedAt); err != nil {
		return nil, err
	}
	return &i, nil
}

// ----- Conversations -----

func (s *Store) ListConversations(integrationID string) ([]Conversation, error) {
	q := `SELECT id, integration_id, external_id, COALESCE(title,''), COALESCE(chat_type,''), created_at FROM conversations`
	args := []interface{}{}
	if integrationID != "" {
		q += ` WHERE integration_id=?`
		args = append(args, integrationID)
	}
	q += ` ORDER BY created_at DESC`
	rows, err := s.DB.Query(q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Conversation{}
	for rows.Next() {
		var c Conversation
		if err := rows.Scan(&c.ID, &c.IntegrationID, &c.ExternalID, &c.Title, &c.ChatType, &c.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, nil
}

func (s *Store) CreateConversation(c *Conversation) error {
	if c.ID == "" {
		c.ID = uuid.NewString()
	}
	_, err := s.DB.Exec(`INSERT INTO conversations (id, integration_id, external_id, title, chat_type) VALUES (?,?,?,?,?)`,
		c.ID, c.IntegrationID, c.ExternalID, c.Title, c.ChatType)
	return err
}

func (s *Store) FindConversationByID(id string) (*Conversation, error) {
	row := s.DB.QueryRow(`SELECT id, integration_id, external_id, COALESCE(title,''), COALESCE(chat_type,''), created_at FROM conversations WHERE id=?`, id)
	var c Conversation
	if err := row.Scan(&c.ID, &c.IntegrationID, &c.ExternalID, &c.Title, &c.ChatType, &c.CreatedAt); err != nil {
		return nil, err
	}
	return &c, nil
}

func (s *Store) FindConversation(integrationID, externalID string) (*Conversation, error) {
	row := s.DB.QueryRow(`SELECT id, integration_id, external_id, COALESCE(title,''), COALESCE(chat_type,''), created_at FROM conversations WHERE integration_id=? AND external_id=?`,
		integrationID, externalID)
	var c Conversation
	if err := row.Scan(&c.ID, &c.IntegrationID, &c.ExternalID, &c.Title, &c.ChatType, &c.CreatedAt); err != nil {
		return nil, err
	}
	return &c, nil
}

func (s *Store) DeleteConversation(id string) error {
	tx, err := s.DB.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err := tx.Exec(`DELETE FROM messages WHERE conversation_id=?`, id); err != nil {
		return err
	}
	if _, err := tx.Exec(`DELETE FROM summaries WHERE conversation_id=?`, id); err != nil {
		return err
	}
	if _, err := tx.Exec(`DELETE FROM conversations WHERE id=?`, id); err != nil {
		return err
	}
	return tx.Commit()
}

// ----- Messages -----

func (s *Store) ListMessages(conversationID string, limit int) ([]Message, error) {
	if limit <= 0 {
		limit = -1
	}
	// Use ROW_NUMBER() to deduplicate.
	// This handles cases where duplicates might exist due to race conditions or sync issues.
	q := `
		SELECT id, conversation_id, is_outbound, content, sender_id, sender_name, dedup_hash, timestamp
		FROM (
			SELECT id, conversation_id, is_outbound, content, 
			       COALESCE(sender_id,'') as sender_id, 
			       COALESCE(sender_name,'') as sender_name, 
			       COALESCE(dedup_hash,'') as dedup_hash, 
			       timestamp,
			       ROW_NUMBER() OVER (
			           PARTITION BY conversation_id, is_outbound, content, timestamp 
			           ORDER BY id
			       ) as rn
			FROM messages
			WHERE conversation_id=?
		)
		WHERE rn = 1
		ORDER BY timestamp DESC
		LIMIT ?`
	rows, err := s.DB.Query(q, conversationID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Message{}
	for rows.Next() {
		var m Message
		if err := rows.Scan(&m.ID, &m.ConversationID, &m.IsOutbound, &m.Content, &m.SenderID, &m.SenderName, &m.DedupHash, &m.Timestamp); err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, nil
}

// RecentMessages returns up to N messages for a conversation in oldest-first order.
func (s *Store) RecentMessages(conversationID string, limit int) ([]Message, error) {
	msgs, err := s.ListMessages(conversationID, limit)
	if err != nil {
		return nil, err
	}
	// reverse to oldest-first
	for i, j := 0, len(msgs)-1; i < j; i, j = i+1, j-1 {
		msgs[i], msgs[j] = msgs[j], msgs[i]
	}
	return msgs, nil
}

func (s *Store) CountMessages(conversationID string) (int, error) {
	var n int
	q := `
		SELECT COUNT(*) FROM (
			SELECT 1 FROM messages 
			WHERE conversation_id=? 
			GROUP BY conversation_id, is_outbound, content, timestamp
		)`
	err := s.DB.QueryRow(q, conversationID).Scan(&n)
	return n, err
}

func (s *Store) InsertMessage(m *Message) error {
	if m.ID == "" {
		m.ID = uuid.NewString()
	}
	if m.Timestamp == "" {
		m.Timestamp = time.Now().UTC().Format(time.RFC3339Nano)
	}
	_, err := s.DB.Exec(`INSERT INTO messages (id, conversation_id, is_outbound, content, sender_id, sender_name, dedup_hash, timestamp) VALUES (?,?,?,?,?,?,?,?)`,
		m.ID, m.ConversationID, m.IsOutbound, m.Content, m.SenderID, m.SenderName, nullable(m.DedupHash), m.Timestamp)
	return err
}

func (s *Store) FindMessageByDedup(hash string) (*Message, error) {
	if hash == "" {
		return nil, sql.ErrNoRows
	}
	row := s.DB.QueryRow(`SELECT id, conversation_id, is_outbound, content, COALESCE(sender_id,''), COALESCE(sender_name,''), COALESCE(dedup_hash,''), timestamp FROM messages WHERE dedup_hash=?`, hash)
	var m Message
	if err := row.Scan(&m.ID, &m.ConversationID, &m.IsOutbound, &m.Content, &m.SenderID, &m.SenderName, &m.DedupHash, &m.Timestamp); err != nil {
		return nil, err
	}
	return &m, nil
}

func (s *Store) DeleteMessage(id string) error {
	_, err := s.DB.Exec(`DELETE FROM messages WHERE id=?`, id)
	return err
}

func (s *Store) DeleteMessagesBefore(conversationID, beforeID string) error {
	// Delete messages in conversation that were created before/equal to the cutoff message timestamp.
	row := s.DB.QueryRow(`SELECT timestamp FROM messages WHERE id=?`, beforeID)
	var ts string
	if err := row.Scan(&ts); err != nil {
		return err
	}
	_, err := s.DB.Exec(`DELETE FROM messages WHERE conversation_id=? AND timestamp<=?`, conversationID, ts)
	return err
}

// DeleteAllMessages removes every message for a conversation.
func (s *Store) DeleteAllMessages(conversationID string) error {
	_, err := s.DB.Exec(`DELETE FROM messages WHERE conversation_id=?`, conversationID)
	return err
}

// DeleteAllSummariesForConversation removes all summaries for a conversation.
func (s *Store) DeleteAllSummariesForConversation(conversationID string) error {
	_, err := s.DB.Exec(`DELETE FROM summaries WHERE conversation_id=?`, conversationID)
	return err
}

// ----- Summaries -----

func (s *Store) ListSummaries(conversationID string) ([]Summary, error) {
	q := `SELECT id, conversation_id, text, created_at FROM summaries`
	args := []interface{}{}
	if conversationID != "" {
		q += ` WHERE conversation_id=?`
		args = append(args, conversationID)
	}
	q += ` ORDER BY created_at DESC`
	rows, err := s.DB.Query(q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Summary{}
	for rows.Next() {
		var sm Summary
		if err := rows.Scan(&sm.ID, &sm.ConversationID, &sm.Text, &sm.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, sm)
	}
	return out, nil
}

func (s *Store) LatestSummary(conversationID string) (*Summary, error) {
	row := s.DB.QueryRow(`SELECT id, conversation_id, text, created_at FROM summaries WHERE conversation_id=? ORDER BY created_at DESC LIMIT 1`, conversationID)
	var sm Summary
	if err := row.Scan(&sm.ID, &sm.ConversationID, &sm.Text, &sm.CreatedAt); err != nil {
		return nil, err
	}
	return &sm, nil
}

func (s *Store) InsertSummary(sm *Summary) error {
	if sm.ID == "" {
		sm.ID = uuid.NewString()
	}
	_, err := s.DB.Exec(`INSERT INTO summaries (id, conversation_id, text) VALUES (?,?,?)`, sm.ID, sm.ConversationID, sm.Text)
	return err
}

func (s *Store) DeleteSummary(id string) error {
	_, err := s.DB.Exec(`DELETE FROM summaries WHERE id=?`, id)
	return err
}

// ----- Configs -----

func (s *Store) ListConfigs(scope, scopeID string) ([]Config, error) {
	q := `SELECT id, scope, COALESCE(scope_id,''), key, value FROM configs`
	args := []interface{}{}
	where := ""
	if scope != "" {
		where = ` WHERE scope=?`
		args = append(args, scope)
		if scopeID != "" {
			where += ` AND scope_id=?`
			args = append(args, scopeID)
		}
	}
	rows, err := s.DB.Query(q+where+` ORDER BY updated_at DESC`, args...)
	if err != nil {
		// Fallback if migration hasn't run yet
		rows, err = s.DB.Query(q+where+` ORDER BY scope, key`, args...)
		if err != nil {
			return nil, err
		}
	}
	defer rows.Close()
	out := []Config{}
	for rows.Next() {
		var c Config
		if err := rows.Scan(&c.ID, &c.Scope, &c.ScopeID, &c.Key, &c.Value); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, nil
}

func (s *Store) UpsertConfig(c *Config) error {
	if c.ID == "" {
		c.ID = uuid.NewString()
	}
	_, err := s.DB.Exec(`INSERT INTO configs (id, scope, scope_id, key, value, updated_at) VALUES (?,?,?,?,?, CURRENT_TIMESTAMP)
		ON CONFLICT(scope, scope_id, key) DO UPDATE SET value=excluded.value, updated_at=CURRENT_TIMESTAMP`,
		c.ID, c.Scope, nullable(c.ScopeID), c.Key, c.Value)
	return err
}

func (s *Store) UpdateConfig(id, key, value string) error {
	_, err := s.DB.Exec(`UPDATE configs SET key=?, value=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`, key, value, id)
	return err
}

func (s *Store) DeleteConfig(id string) error {
	_, err := s.DB.Exec(`DELETE FROM configs WHERE id=?`, id)
	return err
}

func (s *Store) GetConfigValue(key string, def string) string {
	var v string
	err := s.DB.QueryRow(`SELECT value FROM configs WHERE scope='global' AND key=?`, key).Scan(&v)
	if err != nil {
		return def
	}
	return v
}

func (s *Store) ResolveConfig(conversationID, integrationID, key, def string) string {
	scopes := []struct {
		scope    string
		scope_id string
	}{
		{"conversation", conversationID},
		{"integration", integrationID},
		{"global", ""},
	}
	for _, sc := range scopes {
		if sc.scope != "global" && sc.scope_id == "" {
			continue
		}
		var v string
		var err error
		if sc.scope == "global" {
			err = s.DB.QueryRow(`SELECT value FROM configs WHERE scope='global' AND key=?`, key).Scan(&v)
		} else {
			err = s.DB.QueryRow(`SELECT value FROM configs WHERE scope=? AND scope_id=? AND key=?`, sc.scope, sc.scope_id, key).Scan(&v)
		}
		if err == nil && v != "" {
			return v
		}
	}
	return def
}

func (s *Store) ListModelConfigs() ([]ModelConfig, error) {
	rows, err := s.DB.Query(`SELECT id, scope, COALESCE(scope_id,''), value FROM model_configs ORDER BY scope`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []ModelConfig{}
	for rows.Next() {
		var m ModelConfig
		if err := rows.Scan(&m.ID, &m.Scope, &m.ScopeID, &m.Value); err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, nil
}

func (s *Store) UpsertModelConfig(m *ModelConfig) error {
	if m.ID == "" {
		m.ID = uuid.NewString()
	}
	_, err := s.DB.Exec(`INSERT INTO model_configs (id, scope, scope_id, value) VALUES (?,?,?,?)
		ON CONFLICT(scope) DO UPDATE SET scope_id=excluded.scope_id, value=excluded.value`,
		m.ID, m.Scope, nullable(m.ScopeID), m.Value)
	return err
}

func (s *Store) UpdateModelConfig(id, value string) error {
	_, err := s.DB.Exec(`UPDATE model_configs SET value=? WHERE id=?`, value, id)
	return err
}

func (s *Store) DeleteModelConfig(id string) error {
	_, err := s.DB.Exec(`DELETE FROM model_configs WHERE id=?`, id)
	return err
}

// ResolveModel applies the inheritance: conversation > integration > global > default.
func (s *Store) ResolveModel(conversationID, integrationID, defaultModel string) string {
	scopes := []struct {
		scope   string
		scopeID string
	}{
		{"conversation", conversationID},
		{"integration", integrationID},
		{"global", ""},
	}
	for _, sc := range scopes {
		if sc.scope != "global" && sc.scopeID == "" {
			continue
		}
		var v string
		var err error
		if sc.scope == "global" {
			err = s.DB.QueryRow(`SELECT value FROM model_configs WHERE scope='global'`).Scan(&v)
		} else {
			err = s.DB.QueryRow(`SELECT value FROM model_configs WHERE scope=? AND scope_id=?`, sc.scope, sc.scopeID).Scan(&v)
		}
		if err == nil && v != "" {
			return v
		}
	}
	return defaultModel
}

// ----- Identity Links -----

func (s *Store) ListIdentityLinks() ([]IdentityLink, error) {
	rows, err := s.DB.Query(`SELECT id, host_user_id, platform, platform_user_id FROM identity_links ORDER BY host_user_id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []IdentityLink{}
	for rows.Next() {
		var l IdentityLink
		if err := rows.Scan(&l.ID, &l.HostUserID, &l.Platform, &l.PlatformUserID); err != nil {
			return nil, err
		}
		out = append(out, l)
	}
	return out, nil
}

func (s *Store) CreateIdentityLink(l *IdentityLink) error {
	if l.ID == "" {
		l.ID = uuid.NewString()
	}
	_, err := s.DB.Exec(`INSERT INTO identity_links (id, host_user_id, platform, platform_user_id) VALUES (?,?,?,?)`,
		l.ID, l.HostUserID, l.Platform, l.PlatformUserID)
	return err
}

func (s *Store) DeleteIdentityLink(id string) error {
	_, err := s.DB.Exec(`DELETE FROM identity_links WHERE id=?`, id)
	return err
}

// ----- System prompts -----

func (s *Store) ListSystemPrompts() ([]SystemPrompt, error) {
	rows, err := s.DB.Query(`SELECT id, scope, COALESCE(scope_id,''), text FROM system_prompts ORDER BY scope`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []SystemPrompt{}
	for rows.Next() {
		var p SystemPrompt
		if err := rows.Scan(&p.ID, &p.Scope, &p.ScopeID, &p.Text); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, nil
}

func (s *Store) CreateSystemPrompt(p *SystemPrompt) error {
	if p.ID == "" {
		p.ID = uuid.NewString()
	}
	_, err := s.DB.Exec(`INSERT INTO system_prompts (id, scope, scope_id, text) VALUES (?,?,?,?)`,
		p.ID, p.Scope, nullable(p.ScopeID), p.Text)
	return err
}

func (s *Store) UpdateSystemPrompt(id, text string) error {
	_, err := s.DB.Exec(`UPDATE system_prompts SET text=? WHERE id=?`, text, id)
	return err
}

func (s *Store) DeleteSystemPrompt(id string) error {
	_, err := s.DB.Exec(`DELETE FROM system_prompts WHERE id=?`, id)
	return err
}

// ResolvePersona returns the most-specific persona text: conversation > integration > global > "".
func (s *Store) ResolvePersona(conversationID, integrationID string) string {
	scopes := []struct {
		scope   string
		scopeID string
	}{
		{"conversation", conversationID},
		{"integration", integrationID},
		{"global", ""},
	}
	for _, sc := range scopes {
		if sc.scope != "global" && sc.scopeID == "" {
			continue
		}
		var v string
		var err error
		if sc.scope == "global" {
			err = s.DB.QueryRow(`SELECT text FROM system_prompts WHERE scope='global' ORDER BY rowid LIMIT 1`).Scan(&v)
		} else {
			err = s.DB.QueryRow(`SELECT text FROM system_prompts WHERE scope=? AND scope_id=? ORDER BY rowid LIMIT 1`, sc.scope, sc.scopeID).Scan(&v)
		}
		if err == nil && v != "" {
			return v
		}
	}
	return ""
}

// Stats returns simple counts for the dashboard.
func (s *Store) Stats() (integrations, conversations, messages int) {
	s.DB.QueryRow(`SELECT COUNT(*) FROM integrations`).Scan(&integrations)
	s.DB.QueryRow(`SELECT COUNT(*) FROM conversations`).Scan(&conversations)
	s.DB.QueryRow(`SELECT COUNT(*) FROM messages`).Scan(&messages)
	return
}

func (s *Store) Ping() error { return s.DB.Ping() }

// ----- Sessions & Activity Logs -----
var CurrentSessionID string

func (s *Store) CreateServerSession() (string, error) {
	id := uuid.NewString()
	_, err := s.DB.Exec(`INSERT INTO server_sessions (id, started_at) VALUES (?, CURRENT_TIMESTAMP)`, id)
	if err != nil {
		return "", err
	}
	CurrentSessionID = id
	return id, nil
}

func (s *Store) UpdateServerSession(id string) error {
	_, err := s.DB.Exec(`UPDATE server_sessions SET stopped_at=CURRENT_TIMESTAMP WHERE id=?`, id)
	return err
}

func (s *Store) GetCurrentSession() (*ServerSession, error) {
	if CurrentSessionID == "" {
		return nil, sql.ErrNoRows
	}
	row := s.DB.QueryRow(`SELECT id, started_at, COALESCE(stopped_at,'') FROM server_sessions WHERE id=?`, CurrentSessionID)
	var ss ServerSession
	if err := row.Scan(&ss.ID, &ss.StartedAt, &ss.StoppedAt); err != nil {
		return nil, err
	}
	return &ss, nil
}

func (s *Store) CreateActivityLog(log *ActivityLog) error {
	if log.ID == "" {
		log.ID = uuid.NewString()
	}
	if log.SessionID == "" {
		log.SessionID = CurrentSessionID
	}
	_, err := s.DB.Exec(`INSERT INTO activity_logs (id, session_id, type, conversation_id, conversation_title, request_type, status, error_msg, metadata) VALUES (?,?,?,?,?,?,?,?,?)`,
		log.ID, log.SessionID, log.Type, log.ConversationID, log.ConversationTitle, log.RequestType, log.Status, nullable(log.ErrorMsg), nullable(log.Metadata))
	if err == nil {
		s.incrementStat(log.SessionID, log.Type, log.Status)
	}
	return err
}

func (s *Store) UpdateActivityLog(id, status, errorMsg, metadata string) error {
	// Get old status to update stats
	var oldStatus, sessionID, logType string
	err := s.DB.QueryRow(`SELECT status, session_id, type FROM activity_logs WHERE id=?`, id).Scan(&oldStatus, &sessionID, &logType)
	if err != nil {
		return err
	}

	_, err = s.DB.Exec(`UPDATE activity_logs SET status=?, error_msg=?, metadata=?, completed_at=CURRENT_TIMESTAMP WHERE id=?`,
		status, nullable(errorMsg), nullable(metadata), id)
	if err == nil && oldStatus != status {
		s.decrementStat(sessionID, logType, oldStatus)
		s.incrementStat(sessionID, logType, status)
	}
	return err
}

func (s *Store) incrementStat(sessionID, logType, status string) {
	_, _ = s.DB.Exec(`INSERT INTO operation_stats (session_id, type, status, count) VALUES (?,?,?,1)
		ON CONFLICT(session_id, type, status) DO UPDATE SET count=count+1`,
		sessionID, logType, status)
}

func (s *Store) decrementStat(sessionID, logType, status string) {
	_, _ = s.DB.Exec(`UPDATE operation_stats SET count=MAX(0, count-1) WHERE session_id=? AND type=? AND status=?`,
		sessionID, logType, status)
}

func (s *Store) GetActivityLogs(convID, status, logType string, limit int) ([]ActivityLog, error) {
	if limit <= 0 {
		limit = 100
	}
	q := `SELECT id, session_id, type, conversation_id, COALESCE(conversation_title,''), request_type, status, COALESCE(error_msg,''), COALESCE(metadata,''), created_at, COALESCE(completed_at,'') FROM activity_logs`
	where := []string{}
	args := []interface{}{}
	if convID != "" {
		where = append(where, "conversation_id=?")
		args = append(args, convID)
	}
	if status != "" {
		where = append(where, "status=?")
		args = append(args, status)
	}
	if logType != "" {
		where = append(where, "type=?")
		args = append(args, logType)
	}
	if len(where) > 0 {
		q += " WHERE " + strings.Join(where, " AND ")
	}
	q += " ORDER BY created_at DESC LIMIT ?"
	args = append(args, limit)

	rows, err := s.DB.Query(q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []ActivityLog{}
	for rows.Next() {
		var l ActivityLog
		if err := rows.Scan(&l.ID, &l.SessionID, &l.Type, &l.ConversationID, &l.ConversationTitle, &l.RequestType, &l.Status, &l.ErrorMsg, &l.Metadata, &l.CreatedAt, &l.CompletedAt); err != nil {
			return nil, err
		}
		out = append(out, l)
	}
	return out, nil
}

func (s *Store) GetActivityLogByID(id string) (*ActivityLog, error) {
	row := s.DB.QueryRow(`SELECT id, session_id, type, conversation_id, COALESCE(conversation_title,''), request_type, status, COALESCE(error_msg,''), COALESCE(metadata,''), created_at, COALESCE(completed_at,'') FROM activity_logs WHERE id=?`, id)
	var l ActivityLog
	if err := row.Scan(&l.ID, &l.SessionID, &l.Type, &l.ConversationID, &l.ConversationTitle, &l.RequestType, &l.Status, &l.ErrorMsg, &l.Metadata, &l.CreatedAt, &l.CompletedAt); err != nil {
		return nil, err
	}
	return &l, nil
}

func (s *Store) GetSessionStats(allTime bool) ([]OperationStats, error) {
	q := `SELECT type, status, SUM(count) FROM operation_stats`
	args := []interface{}{}
	if !allTime && CurrentSessionID != "" {
		q += ` WHERE session_id=?`
		args = append(args, CurrentSessionID)
	}
	q += ` GROUP BY type, status`
	rows, err := s.DB.Query(q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []OperationStats{}
	for rows.Next() {
		var st OperationStats
		if err := rows.Scan(&st.Type, &st.Status, &st.Count); err != nil {
			return nil, err
		}
		if !allTime {
			st.SessionID = CurrentSessionID
		}
		out = append(out, st)
	}
	return out, nil
}

func nullable(s string) interface{} {
	if s == "" {
		return nil
	}
	return s
}
