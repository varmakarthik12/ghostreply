package db

const Schema = `
PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS integrations (
    id          TEXT PRIMARY KEY,
    platform    TEXT NOT NULL,
    account     TEXT NOT NULL,
    token       TEXT,
    endpoint_url TEXT,
    active      INTEGER DEFAULT 1,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS conversations (
    id             TEXT PRIMARY KEY,
    integration_id TEXT NOT NULL,
    external_id    TEXT NOT NULL,
    title          TEXT,
    chat_type      TEXT, -- group or individual
    created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(integration_id, external_id)
);

CREATE TABLE IF NOT EXISTS messages (
    id              TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    is_outbound     INTEGER NOT NULL,
    content         TEXT NOT NULL,
    sender_id       TEXT,
    sender_name     TEXT,
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
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(scope, scope_id, key)
);

CREATE TABLE IF NOT EXISTS model_configs (
    id       TEXT PRIMARY KEY,
    scope    TEXT NOT NULL,
    scope_id TEXT,
    value    TEXT NOT NULL,
    UNIQUE(scope)
);

CREATE TABLE IF NOT EXISTS identity_links (
    id              TEXT PRIMARY KEY,
    identity_id     TEXT NOT NULL,
    conversation_id TEXT NOT NULL,
    UNIQUE(identity_id, conversation_id)
);

CREATE TABLE IF NOT EXISTS system_prompts (
    id       TEXT PRIMARY KEY,
    scope    TEXT NOT NULL,
    scope_id TEXT,
    text     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS server_sessions (
    id         TEXT PRIMARY KEY,
    started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    stopped_at DATETIME
);

CREATE TABLE IF NOT EXISTS activity_logs (
    id                 TEXT PRIMARY KEY,
    session_id         TEXT NOT NULL,
    type               TEXT NOT NULL, -- 'engine' or 'summary'
    conversation_id    TEXT NOT NULL,
    conversation_title TEXT,
    request_type       TEXT NOT NULL, -- 'auto_reply', 'manual_summary', 'auto_summary'
    status             TEXT NOT NULL, -- 'pending', 'success', 'failure', 'cancelled'
    error_msg          TEXT,
    metadata           TEXT, -- JSON
    created_at         DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at       DATETIME,
    FOREIGN KEY(session_id) REFERENCES server_sessions(id)
);

CREATE TABLE IF NOT EXISTS operation_stats (
    session_id TEXT NOT NULL,
    type       TEXT NOT NULL, -- 'engine' or 'summary'
    status     TEXT NOT NULL,
    count      INTEGER DEFAULT 0,
    PRIMARY KEY(session_id, type, status),
    FOREIGN KEY(session_id) REFERENCES server_sessions(id)
);

CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_activity_session ON activity_logs(session_id);
`
