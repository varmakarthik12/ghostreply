package db

const Schema = `
PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS integrations (
    id          TEXT PRIMARY KEY,
    platform    TEXT NOT NULL,
    account     TEXT NOT NULL,
    token       TEXT,
    webhook_url TEXT,
    active      INTEGER DEFAULT 1,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS conversations (
    id             TEXT PRIMARY KEY,
    integration_id TEXT NOT NULL,
    external_id    TEXT NOT NULL,
    title          TEXT,
    created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(integration_id, external_id)
);

CREATE TABLE IF NOT EXISTS messages (
    id              TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    is_outbound     INTEGER NOT NULL,
    content         TEXT NOT NULL,
    dedup_hash      TEXT UNIQUE,
    timestamp       DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS summaries (
    id              TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    text            TEXT NOT NULL,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS configs (
    id       TEXT PRIMARY KEY,
    scope    TEXT NOT NULL,
    scope_id TEXT,
    key      TEXT NOT NULL,
    value    TEXT NOT NULL,
    UNIQUE(scope, key)
);

CREATE TABLE IF NOT EXISTS model_configs (
    id       TEXT PRIMARY KEY,
    scope    TEXT NOT NULL,
    scope_id TEXT,
    value    TEXT NOT NULL,
    UNIQUE(scope)
);

CREATE TABLE IF NOT EXISTS identity_links (
    id               TEXT PRIMARY KEY,
    host_user_id     TEXT NOT NULL,
    platform         TEXT NOT NULL,
    platform_user_id TEXT NOT NULL,
    UNIQUE(platform, platform_user_id)
);

CREATE TABLE IF NOT EXISTS system_prompts (
    id       TEXT PRIMARY KEY,
    scope    TEXT NOT NULL,
    scope_id TEXT,
    text     TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, timestamp);
`
