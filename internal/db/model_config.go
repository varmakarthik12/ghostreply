package db

import (
	"database/sql"

	"github.com/google/uuid"
)

type ModelConfig struct {
	ID                    string `json:"id"`
	Scope                 string `json:"scope"`  // global|integration|conversation
	ScopeID               string `json:"scope_id"`
	Provider              string `json:"provider"`          // ollama|openai
	ModelName             string `json:"model_name"`        // e.g. gemma3:4b
	BaseURL               string `json:"base_url"`          // e.g. http://localhost:11434
	APIKey                string `json:"api_key,omitempty"` // for openai/anthropic
	ContextWindowTokens   int    `json:"context_window_tokens"`
}

func (s *Store) SaveModelConfig(c *ModelConfig) error {
	_, err := s.db.Exec(
		`INSERT INTO model_configs (id, scope, scope_id, provider, model_name, base_url, api_key, context_window_tokens)
		 VALUES (?, ?, COALESCE(?, ''), ?, ?, COALESCE(?, ''), ?, ?)
		 ON CONFLICT(scope, COALESCE(scope_id,'')) DO UPDATE SET provider=excluded.provider, model_name=excluded.model_name, base_url=excluded.base_url, api_key=excluded.api_key, context_window_tokens=excluded.context_window_tokens`,
		uuid.NewString(), c.Scope, c.ScopeID, c.Provider, c.ModelName, c.BaseURL, c.APIKey, c.ContextWindowTokens)
	return err
}

func (s *Store) GetModelConfig(scope, scopeID string) (*ModelConfig, error) {
	c := &ModelConfig{}
	err := s.db.QueryRow(
		`SELECT id, scope, COALESCE(scope_id,''), provider, model_name, base_url, COALESCE(api_key,''), context_window_tokens
		 FROM model_configs WHERE scope = ? AND COALESCE(scope_id,'') = COALESCE(?, '')`,
		scope, scopeID).Scan(&c.ID, &c.Scope, &c.ScopeID, &c.Provider, &c.ModelName, &c.BaseURL, &c.APIKey, &c.ContextWindowTokens)
	if err == sql.ErrNoRows { return nil, nil }
	return c, err
}

func (s *Store) GetEffectiveModelConfig(convID, integrationID string) *ModelConfig {
	// Try conversation first, then integration, then global, then default
	scopes := []struct{ scope, scopeID string }{
		{"conversation", convID},
		{"integration", integrationID},
		{"global", ""},
	}
	for _, sc := range scopes {
		c, _ := s.GetModelConfig(sc.scope, sc.scopeID)
		if c != nil {
			return c
		}
	}
	return &ModelConfig{Provider: "ollama", ModelName: "gemma3:4b", BaseURL: "http://localhost:11434", ContextWindowTokens: 8192}
}
