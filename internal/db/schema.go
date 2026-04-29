package db

var Schema = `
PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS integrations (
  id           TEXT PRIMARY KEY,
  app_type     TEXT NOT NULL,
  display_name TEXT NOT NULL,
  created_at   DATETIME DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS conversations (
  id                   TEXT PRIMARY KEY,
  integration_id       TEXT NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
  conv_type            TEXT NOT NULL DEFAULT 'individual',
  target_display_name  TEXT,
  created_at           DATETIME DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS messages (
  id                   TEXT PRIMARY KEY,
  conversation_id      TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  dedup_hash           TEXT UNIQUE,
  timestamp            DATETIME NOT NULL,
  content              TEXT NOT NULL,
  sender_type          TEXT NOT NULL,
  sender_id            TEXT NOT NULL,
  sender_username      TEXT,
  sender_display_name  TEXT,
  sender_gender        TEXT,
  created_at           DATETIME DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, timestamp DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_dedup ON messages(dedup_hash);

CREATE TABLE IF NOT EXISTS summaries (
  id                       TEXT PRIMARY KEY,
  conversation_id          TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  summary_text             TEXT NOT NULL,
  covers_up_to_message_id  TEXT,
  estimated_token_count    INTEGER,
  created_at               DATETIME DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS system_prompts (
  id         TEXT PRIMARY KEY,
  scope      TEXT NOT NULL,
  scope_id   TEXT,
  label      TEXT NOT NULL,
  content    TEXT NOT NULL,
  is_active  BOOLEAN DEFAULT TRUE,
  priority   INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS configs (
  id        TEXT PRIMARY KEY,
  scope     TEXT NOT NULL,
  scope_id  TEXT,
  key       TEXT NOT NULL,
  value     TEXT NOT NULL,
  UNIQUE(scope, key)
);

CREATE TABLE IF NOT EXISTS model_configs (
  id                     TEXT PRIMARY KEY,
  scope                  TEXT NOT NULL,
  scope_id               TEXT,
  provider               TEXT NOT NULL DEFAULT 'ollama',
  model_name             TEXT NOT NULL DEFAULT 'gemma3:4b',
  base_url               TEXT NOT NULL DEFAULT 'http://localhost:11434',
  api_key                TEXT,
  context_window_tokens  INTEGER DEFAULT 8192,
  UNIQUE(scope)
);

CREATE TABLE IF NOT EXISTS identity_links (
  id                      TEXT PRIMARY KEY,
  primary_integration_id  TEXT NOT NULL,
  primary_sender_id       TEXT NOT NULL,
  linked_integration_id   TEXT NOT NULL,
  linked_sender_id        TEXT NOT NULL,
  unified_display_name    TEXT,
  notes                   TEXT,
  created_at              DATETIME DEFAULT (datetime('now'))
);
`
