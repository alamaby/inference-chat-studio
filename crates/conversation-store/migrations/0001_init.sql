CREATE TABLE providers(
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    compatibility_type TEXT NOT NULL DEFAULT 'openai',
    api_mode TEXT NOT NULL DEFAULT 'chat_completions',
    base_url TEXT NOT NULL,
    credential_reference TEXT,
    additional_headers_json TEXT,
    default_model_id TEXT,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE TABLE models(
    id TEXT PRIMARY KEY,
    provider_id TEXT NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    remote_model_id TEXT NOT NULL,
    display_name TEXT,
    capabilities_json TEXT,
    manually_added INTEGER NOT NULL DEFAULT 0,
    available INTEGER NOT NULL DEFAULT 1,
    first_seen_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    UNIQUE(provider_id, remote_model_id)
);
CREATE TABLE conversations(
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    provider_id TEXT REFERENCES providers(id),
    default_model_id TEXT,
    system_prompt TEXT,
    settings_json TEXT,
    pinned INTEGER NOT NULL DEFAULT 0,
    archived INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE TABLE messages(
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    parent_message_id TEXT,
    role TEXT NOT NULL,
    content_json TEXT NOT NULL,
    raw_provider_data_json TEXT,
    provider_id TEXT,
    model_id TEXT,
    reasoning_config_json TEXT,
    usage_json TEXT,
    duration_ms INTEGER,
    ttft_ms INTEGER,
    finish_reason TEXT,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE INDEX idx_models_provider ON models(provider_id);
CREATE INDEX idx_messages_conv_created ON messages(conversation_id, created_at);
CREATE INDEX idx_conv_updated ON conversations(updated_at);
