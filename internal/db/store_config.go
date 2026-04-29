package db

import (
	"database/sql"
	"encoding/json"
	"github.com/google/uuid"
)

type ConfigValue struct {
	Key   string      `json:"key"`
	Value interface{} `json:"value"`
}

func (s *Store) SetConfig(scope, scopeID, key string, value interface{}) error {
	v, _ := json.Marshal(value)
	_, err := s.db.Exec(
		`INSERT INTO configs (id, scope, scope_id, key, value) VALUES (?, ?, COALESCE(?, ''), ?, ?)
		 ON CONFLICT(scope, COALESCE(scope_id,''), key) DO UPDATE SET value = excluded.value`,
		uuid.NewString(), scope, scopeID, key, string(v))
	return err
}

func (s *Store) GetConfig(scope, scopeID, key string) (interface{}, error) {
	var val string
	err := s.db.QueryRow(
		`SELECT value FROM configs WHERE scope = ? AND COALESCE(scope_id,'') = COALESCE(?, '') AND key = ?`,
		scope, scopeID, key).Scan(&val)
	if err == sql.ErrNoRows { return nil, nil }
	if err != nil { return nil, err }
	var result interface{}
	json.Unmarshal([]byte(val), &result)
	return result, nil
}

func (s *Store) GetMergedConfig(convID string) map[string]interface{} {
	result := make(map[string]interface{})
	rows, _ := s.db.Query(
		`SELECT key, value, scope, COALESCE(scope_id,'') FROM configs
		 WHERE scope = 'global' OR scope = 'integration' OR scope = 'conversation'
		 ORDER BY CASE scope WHEN 'global' THEN 1 WHEN 'integration' THEN 2 WHEN 'conversation' THEN 3 END`)
	if rows != nil {
		defer rows.Close()
		for rows.Next() {
			var k, v, scope, scopeID string
			rows.Scan(&k, &v, &scope, &scopeID)
			// Override if more specific scope
			result[k] = v
		}
	}
	return result
}

type SystemPrompt struct {
	ID        string `json:"id"`
	Scope     string `json:"scope"` // global|integration|conversation
	ScopeID   string `json:"scope_id"`
	Label     string `json:"label"`
	Content   string `json:"content"`
	IsActive  bool   `json:"is_active"`
	Priority  int    `json:"priority"`
	CreatedAt string `json:"created_at"`
}

func (s *Store) SaveSystemPrompt(p *SystemPrompt) error {
	_, err := s.db.Exec(
		`INSERT INTO system_prompts (id, scope, scope_id, label, content, is_active, priority)
		 VALUES (?, ?, COALESCE(?, ''), ?, ?, ?, ?)
		 ON CONFLICT(id) DO UPDATE SET label=excluded.label, content=excluded.content, is_active=excluded.is_active, priority=excluded.priority`,
		p.ID, p.Scope, p.ScopeID, p.Label, p.Content, p.IsActive, p.Priority)
	return err
}

func (s *Store) GetSystemPrompts(scope, scopeID string, isActiveOnly bool) ([]*SystemPrompt, error) {
	query := `SELECT id, scope, COALESCE(scope_id,''), label, content, is_active, priority, created_at FROM system_prompts WHERE 1=1`
	args := []interface{}{}
	if scope != "" {
		if scopeID == "" {
			query += ` AND scope = ? AND (scope_id = '' OR scope_id IS NULL)`
			args = append(args, scope)
		} else {
			query += ` AND scope = ? AND scope_id = ?`
			args = append(args, scope, scopeID)
		}
	}
	if isActiveOnly {
		query += ` AND is_active = 1`
	}
	query += ` ORDER BY priority ASC`
	rows, err := s.db.Query(query, args...)
	if err != nil { return nil, err }
	defer rows.Close()
	var result []*SystemPrompt
	for rows.Next() {
		p := &SystemPrompt{}
		if err := rows.Scan(&p.ID, &p.Scope, &p.ScopeID, &p.Label, &p.Content, &p.IsActive, &p.Priority, &p.CreatedAt); err != nil {
			return nil, err
		}
		result = append(result, p)
	}
	return result, rows.Err()
}

func (s *Store) DeleteSystemPrompt(id string) error {
	_, err := s.db.Exec("DELETE FROM system_prompts WHERE id = ?", id)
	return err
}

func (s *Store) GetSummary(convID string) (*Summary, error) {
	sm := &Summary{}
	err := s.db.QueryRow(
		`SELECT id, conversation_id, summary_text, COALESCE(covers_up_to_message_id,''), estimated_token_count, created_at
		 FROM summaries WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 1`,
		convID).Scan(&sm.ID, &sm.ConversationID, &sm.SummaryText, &sm.CoversUpToMessageID, &sm.EstimatedTokenCount, &sm.CreatedAt)
	if err == sql.ErrNoRows { return nil, nil }
	return sm, err
}

func (s *Store) SaveSummary(sm *Summary) error {
	_, err := s.db.Exec(
		`INSERT INTO summaries (id, conversation_id, summary_text, covers_up_to_message_id, estimated_token_count)
		 VALUES (?, ?, ?, COALESCE(?, ''), ?)`,
		sm.ID, sm.ConversationID, sm.SummaryText, sm.CoversUpToMessageID, sm.EstimatedTokenCount)
	return err
}

type Summary struct {
	ID                    string `json:"id"`
	ConversationID        string `json:"conversation_id"`
	SummaryText           string `json:"summary_text"`
	CoversUpToMessageID   string `json:"covers_up_to_message_id"`
	EstimatedTokenCount   int    `json:"estimated_token_count"`
	CreatedAt             string `json:"created_at"`
}
