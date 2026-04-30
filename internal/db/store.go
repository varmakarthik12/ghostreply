package db

import (
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"fmt"
	"time"

	"github.com/google/uuid"
	_ "github.com/mattn/go-sqlite3"
)

type Store struct {
	DB *sql.DB
}

func NewStore(path string) (*Store, error) {
	dsn := path
	if path != ":memory:" {
		dsn = path + "?_foreign_keys=on"
	}
	d, err := sql.Open("sqlite3", dsn)
	if err != nil {
		return nil, err
	}
	if _, err := d.Exec(Schema); err != nil {
		return nil, fmt.Errorf("schema: %w", err)
	}
	return &Store{DB: d}, nil
}

func (s *Store) Close() error { return s.DB.Close() }

func DedupHash(conversationID, content string) string {
	h := sha256.Sum256([]byte(conversationID + "|" + content))
	return hex.EncodeToString(h[:])
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
	CreatedAt     string `json:"created_at"`
}

type Message struct {
	ID             string `json:"id"`
	ConversationID string `json:"conversation_id"`
	IsOutbound     int    `json:"is_outbound"`
	Content        string `json:"content"`
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
	q := `SELECT id, integration_id, external_id, COALESCE(title,''), created_at FROM conversations`
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
		if err := rows.Scan(&c.ID, &c.IntegrationID, &c.ExternalID, &c.Title, &c.CreatedAt); err != nil {
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
	_, err := s.DB.Exec(`INSERT INTO conversations (id, integration_id, external_id, title) VALUES (?,?,?,?)`,
		c.ID, c.IntegrationID, c.ExternalID, c.Title)
	return err
}

func (s *Store) FindConversationByID(id string) (*Conversation, error) {
	row := s.DB.QueryRow(`SELECT id, integration_id, external_id, COALESCE(title,''), created_at FROM conversations WHERE id=?`, id)
	var c Conversation
	if err := row.Scan(&c.ID, &c.IntegrationID, &c.ExternalID, &c.Title, &c.CreatedAt); err != nil {
		return nil, err
	}
	return &c, nil
}

func (s *Store) FindConversation(integrationID, externalID string) (*Conversation, error) {
	row := s.DB.QueryRow(`SELECT id, integration_id, external_id, COALESCE(title,''), created_at FROM conversations WHERE integration_id=? AND external_id=?`,
		integrationID, externalID)
	var c Conversation
	if err := row.Scan(&c.ID, &c.IntegrationID, &c.ExternalID, &c.Title, &c.CreatedAt); err != nil {
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
		limit = 50
	}
	rows, err := s.DB.Query(`SELECT id, conversation_id, is_outbound, content, COALESCE(dedup_hash,''), timestamp FROM messages WHERE conversation_id=? ORDER BY timestamp DESC LIMIT ?`, conversationID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Message{}
	for rows.Next() {
		var m Message
		if err := rows.Scan(&m.ID, &m.ConversationID, &m.IsOutbound, &m.Content, &m.DedupHash, &m.Timestamp); err != nil {
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
	err := s.DB.QueryRow(`SELECT COUNT(*) FROM messages WHERE conversation_id=?`, conversationID).Scan(&n)
	return n, err
}

func (s *Store) InsertMessage(m *Message) error {
	if m.ID == "" {
		m.ID = uuid.NewString()
	}
	if m.Timestamp == "" {
		m.Timestamp = time.Now().UTC().Format(time.RFC3339Nano)
	}
	_, err := s.DB.Exec(`INSERT INTO messages (id, conversation_id, is_outbound, content, dedup_hash, timestamp) VALUES (?,?,?,?,?,?)`,
		m.ID, m.ConversationID, m.IsOutbound, m.Content, nullable(m.DedupHash), m.Timestamp)
	return err
}

func (s *Store) FindMessageByDedup(hash string) (*Message, error) {
	if hash == "" {
		return nil, sql.ErrNoRows
	}
	row := s.DB.QueryRow(`SELECT id, conversation_id, is_outbound, content, COALESCE(dedup_hash,''), timestamp FROM messages WHERE dedup_hash=?`, hash)
	var m Message
	if err := row.Scan(&m.ID, &m.ConversationID, &m.IsOutbound, &m.Content, &m.DedupHash, &m.Timestamp); err != nil {
		return nil, err
	}
	return &m, nil
}

func (s *Store) LastOutboundMessage(conversationID string) (*Message, error) {
	row := s.DB.QueryRow(`SELECT id, conversation_id, is_outbound, content, COALESCE(dedup_hash,''), timestamp FROM messages WHERE conversation_id=? AND is_outbound=1 ORDER BY timestamp DESC LIMIT 1`, conversationID)
	var m Message
	if err := row.Scan(&m.ID, &m.ConversationID, &m.IsOutbound, &m.Content, &m.DedupHash, &m.Timestamp); err != nil {
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
	rows, err := s.DB.Query(q+where+` ORDER BY scope, key`, args...)
	if err != nil {
		return nil, err
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
	_, err := s.DB.Exec(`INSERT INTO configs (id, scope, scope_id, key, value) VALUES (?,?,?,?,?)
		ON CONFLICT(scope, key) DO UPDATE SET value=excluded.value, scope_id=excluded.scope_id`,
		c.ID, c.Scope, nullable(c.ScopeID), c.Key, c.Value)
	return err
}

func (s *Store) UpdateConfig(id, key, value string) error {
	_, err := s.DB.Exec(`UPDATE configs SET key=?, value=? WHERE id=?`, key, value, id)
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

// ----- Model configs -----

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

func nullable(s string) interface{} {
	if s == "" {
		return nil
	}
	return s
}
