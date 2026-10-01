CREATE TABLE folders(id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE tags(id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL);
ALTER TABLE conversations ADD COLUMN folder_id TEXT REFERENCES folders(id);
CREATE TABLE conversation_tags(conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE, tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE, PRIMARY KEY(conversation_id,tag_id));
CREATE INDEX idx_conv_folder ON conversations(folder_id);
CREATE INDEX idx_ctag_conv ON conversation_tags(conversation_id);
