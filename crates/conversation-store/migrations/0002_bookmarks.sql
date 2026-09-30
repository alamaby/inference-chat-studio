CREATE TABLE bookmarks(
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    message_id TEXT NOT NULL,
    label TEXT NOT NULL,
    anchor_text TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE INDEX idx_bookmarks_conv ON bookmarks(conversation_id);
