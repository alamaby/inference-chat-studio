use rusqlite::{Connection, OptionalExtension, params};
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::sync::Mutex;

const INIT_SQL: &str = include_str!("../migrations/0001_init.sql");
const BOOKMARKS_SQL: &str = include_str!("../migrations/0002_bookmarks.sql");
const FOLDERS_TAGS_SQL: &str = include_str!("../migrations/0003_folders_tags.sql");
const SCHEMA_VERSION: i64 = 3;

#[derive(Debug)]
pub enum StoreError {
    Sql(rusqlite::Error),
    Validation(String),
    Io(std::io::Error),
}

impl std::fmt::Display for StoreError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            StoreError::Sql(e) => write!(f, "database error: {e}"),
            StoreError::Validation(msg) => write!(f, "validation error: {msg}"),
            StoreError::Io(e) => write!(f, "io error: {e}"),
        }
    }
}

impl std::error::Error for StoreError {}

impl From<rusqlite::Error> for StoreError {
    fn from(e: rusqlite::Error) -> Self {
        StoreError::Sql(e)
    }
}

impl From<std::io::Error> for StoreError {
    fn from(e: std::io::Error) -> Self {
        StoreError::Io(e)
    }
}

pub type Result<T> = std::result::Result<T, StoreError>;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ProviderRow {
    pub id: String,
    pub name: String,
    pub compatibility_type: String,
    pub api_mode: String,
    pub base_url: String,
    pub credential_reference: Option<String>,
    pub additional_headers_json: Option<String>,
    pub default_model_id: Option<String>,
    pub enabled: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ModelRow {
    pub id: String,
    pub provider_id: String,
    pub remote_model_id: String,
    pub display_name: Option<String>,
    pub capabilities_json: Option<String>,
    pub manually_added: bool,
    pub available: bool,
    pub first_seen_at: String,
    pub last_seen_at: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ConversationRow {
    pub id: String,
    pub title: String,
    pub provider_id: Option<String>,
    pub default_model_id: Option<String>,
    pub system_prompt: Option<String>,
    pub settings_json: Option<String>,
    pub pinned: bool,
    pub archived: bool,
    pub folder_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct MessageRow {
    pub id: String,
    pub conversation_id: String,
    pub parent_message_id: Option<String>,
    pub role: String,
    pub content_json: String,
    pub raw_provider_data_json: Option<String>,
    pub provider_id: Option<String>,
    pub model_id: Option<String>,
    pub reasoning_config_json: Option<String>,
    pub usage_json: Option<String>,
    pub duration_ms: Option<i64>,
    pub ttft_ms: Option<i64>,
    pub finish_reason: Option<String>,
    pub status: String,
    pub created_at: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct BookmarkRow {
    pub id: String,
    pub conversation_id: String,
    pub message_id: String,
    pub label: String,
    pub anchor_text: String,
    pub created_at: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct FolderRow {
    pub id: String,
    pub name: String,
    pub created_at: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct TagRow {
    pub id: String,
    pub name: String,
    pub created_at: String,
}

pub struct Db {
    conn: Mutex<Connection>,
}

impl Db {
    pub fn connect(path: &str) -> Result<Self> {
        if let Some(parent) = Path::new(path).parent() {
            if !parent.as_os_str().is_empty() {
                std::fs::create_dir_all(parent)?;
            }
        }
        let conn = Connection::open(path)?;
        conn.pragma_update(None, "foreign_keys", "ON")?;
        let db = Self {
            conn: Mutex::new(conn),
        };
        db.migrate()?;
        Ok(db)
    }

    pub fn connect_in_memory() -> Result<Self> {
        let conn = Connection::open_in_memory()?;
        conn.pragma_update(None, "foreign_keys", "ON")?;
        let db = Self {
            conn: Mutex::new(conn),
        };
        db.migrate()?;
        Ok(db)
    }

    pub fn migrate(&self) -> Result<()> {
        let conn = self.conn.lock().expect("db mutex poisoned");
        let mut version: i64 =
            conn.pragma_query_value(None, "user_version", |row| row.get(0))?;
        // Incremental: fresh DBs apply every step, existing DBs only the new ones.
        while version < SCHEMA_VERSION {
            match version {
                0 => conn.execute_batch(INIT_SQL)?,
                1 => conn.execute_batch(BOOKMARKS_SQL)?,
                2 => conn.execute_batch(FOLDERS_TAGS_SQL)?,
                _ => break,
            }
            version += 1;
            conn.pragma_update(None, "user_version", version)?;
        }
        Ok(())
    }

    fn validate_provider(row: &ProviderRow) -> Result<()> {
        let compat = row.compatibility_type.as_str();
        match compat {
            "openai" => {
                if row.api_mode != "chat_completions" {
                    return Err(StoreError::Validation(format!(
                        "unsupported api_mode '{}': openai requires 'chat_completions'",
                        row.api_mode
                    )));
                }
            }
            "anthropic" => {
                if row.api_mode != "anthropic" {
                    return Err(StoreError::Validation(format!(
                        "unsupported api_mode '{}': anthropic requires 'anthropic'",
                        row.api_mode
                    )));
                }
            }
            other => {
                return Err(StoreError::Validation(format!(
                    "unsupported compatibility_type '{other}'"
                )));
            }
        }
        if row.name.trim().is_empty() {
            return Err(StoreError::Validation("provider name must not be empty".to_string()));
        }
        if row.base_url.trim().is_empty() {
            return Err(StoreError::Validation("base_url must not be empty".to_string()));
        }
        Ok(())
    }

    pub fn insert_provider(&self, row: &ProviderRow) -> Result<()> {
        Self::validate_provider(row)?;
        let conn = self.conn.lock().expect("db mutex poisoned");
        conn.execute(
            "INSERT INTO providers(id, name, compatibility_type, api_mode, base_url, credential_reference, additional_headers_json, default_model_id, enabled, created_at, updated_at) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)",
            params![
                row.id,
                row.name,
                row.compatibility_type,
                row.api_mode,
                row.base_url,
                row.credential_reference,
                row.additional_headers_json,
                row.default_model_id,
                i64::from(row.enabled),
                row.created_at,
                row.updated_at,
            ],
        )?;
        Ok(())
    }

    pub fn get_provider(&self, id: &str) -> Result<Option<ProviderRow>> {
        let conn = self.conn.lock().expect("db mutex poisoned");
        let row = conn
            .query_row(
                "SELECT id, name, compatibility_type, api_mode, base_url, credential_reference, additional_headers_json, default_model_id, enabled, created_at, updated_at FROM providers WHERE id = ?1",
                params![id],
                map_provider_row,
            )
            .optional()?;
        Ok(row)
    }

    pub fn list_providers(&self) -> Result<Vec<ProviderRow>> {
        let conn = self.conn.lock().expect("db mutex poisoned");
        let mut stmt = conn.prepare(
            "SELECT id, name, compatibility_type, api_mode, base_url, credential_reference, additional_headers_json, default_model_id, enabled, created_at, updated_at FROM providers ORDER BY created_at ASC",
        )?;
        let rows = stmt
            .query_map([], map_provider_row)?
            .collect::<std::result::Result<Vec<_>, _>>()?;
        Ok(rows)
    }

    pub fn delete_provider(&self, id: &str) -> Result<()> {
        let conn = self.conn.lock().expect("db mutex poisoned");
        conn.execute("DELETE FROM providers WHERE id = ?1", params![id])?;
        Ok(())
    }

    pub fn upsert_model(&self, row: &ModelRow) -> Result<()> {
        let conn = self.conn.lock().expect("db mutex poisoned");
        conn.execute(
            "INSERT INTO models(id, provider_id, remote_model_id, display_name, capabilities_json, manually_added, available, first_seen_at, last_seen_at) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9)
             ON CONFLICT(provider_id, remote_model_id) DO UPDATE SET display_name=excluded.display_name, capabilities_json=excluded.capabilities_json, available=excluded.available, last_seen_at=excluded.last_seen_at",
            params![
                row.id,
                row.provider_id,
                row.remote_model_id,
                row.display_name,
                row.capabilities_json,
                i64::from(row.manually_added),
                i64::from(row.available),
                row.first_seen_at,
                row.last_seen_at,
            ],
        )?;
        Ok(())
    }

    pub fn list_models_by_provider(&self, provider_id: &str) -> Result<Vec<ModelRow>> {
        let conn = self.conn.lock().expect("db mutex poisoned");
        let mut stmt = conn.prepare(
            "SELECT id, provider_id, remote_model_id, display_name, capabilities_json, manually_added, available, first_seen_at, last_seen_at FROM models WHERE provider_id = ?1 ORDER BY remote_model_id ASC",
        )?;
        let rows = stmt
            .query_map(params![provider_id], map_model_row)?
            .collect::<std::result::Result<Vec<_>, _>>()?;
        Ok(rows)
    }

    pub fn insert_conversation(&self, row: &ConversationRow) -> Result<()> {
        let conn = self.conn.lock().expect("db mutex poisoned");
        conn.execute(
            "INSERT INTO conversations(id, title, provider_id, default_model_id, system_prompt, settings_json, pinned, archived, folder_id, created_at, updated_at) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)",
            params![
                row.id,
                row.title,
                row.provider_id,
                row.default_model_id,
                row.system_prompt,
                row.settings_json,
                i64::from(row.pinned),
                i64::from(row.archived),
                row.folder_id,
                row.created_at,
                row.updated_at,
            ],
        )?;
        Ok(())
    }

    pub fn touch_conversation(&self, id: &str, updated_at: &str) -> Result<()> {
        let conn = self.conn.lock().expect("db mutex poisoned");
        conn.execute(
            "UPDATE conversations SET updated_at = ?1 WHERE id = ?2",
            params![updated_at, id],
        )?;
        Ok(())
    }

    pub fn list_conversations(&self) -> Result<Vec<ConversationRow>> {
        let conn = self.conn.lock().expect("db mutex poisoned");
        let mut stmt = conn.prepare(
            "SELECT id, title, provider_id, default_model_id, system_prompt, settings_json, pinned, archived, folder_id, created_at, updated_at FROM conversations ORDER BY updated_at DESC",
        )?;
        let rows = stmt
            .query_map([], map_conversation_row)?
            .collect::<std::result::Result<Vec<_>, _>>()?;
        Ok(rows)
    }

    pub fn rename_conversation(&self, id: &str, title: &str, updated_at: &str) -> Result<()> {
        if title.trim().is_empty() {
            return Err(StoreError::Validation(
                "conversation title must not be empty".to_string(),
            ));
        }
        let conn = self.conn.lock().expect("db mutex poisoned");
        conn.execute(
            "UPDATE conversations SET title = ?1, updated_at = ?2 WHERE id = ?3",
            params![title.trim(), updated_at, id],
        )?;
        Ok(())
    }

    pub fn delete_conversation(&self, id: &str) -> Result<()> {
        let conn = self.conn.lock().expect("db mutex poisoned");
        conn.execute("DELETE FROM conversations WHERE id = ?1", params![id])?;
        Ok(())
    }

    /// Persist per-conversation settings (system prompt, reasoning, sampling,
    /// default model). Called by the frontend on send and on conversation
    /// switch so UI state survives restarts.
    pub fn update_conversation_settings(
        &self,
        id: &str,
        system_prompt: Option<&str>,
        settings_json: Option<&str>,
        default_model_id: Option<&str>,
        updated_at: &str,
    ) -> Result<()> {
        let conn = self.conn.lock().expect("db mutex poisoned");
        conn.execute(
            "UPDATE conversations SET system_prompt = ?1, settings_json = ?2, default_model_id = ?3, updated_at = ?4 WHERE id = ?5",
            params![system_prompt, settings_json, default_model_id, updated_at, id],
        )?;
        Ok(())
    }

    /// Detach conversations from a provider before the provider row is
    /// deleted. `conversations.provider_id` has no `ON DELETE` action, so
    /// deleting a referenced provider would otherwise fail with an FK error.
    /// History itself is preserved.
    pub fn clear_conversation_provider(&self, provider_id: &str) -> Result<()> {
        let conn = self.conn.lock().expect("db mutex poisoned");
        conn.execute(
            "UPDATE conversations SET provider_id = NULL WHERE provider_id = ?1",
            params![provider_id],
        )?;
        Ok(())
    }

    pub fn insert_message(&self, row: &MessageRow) -> Result<()> {
        let conn = self.conn.lock().expect("db mutex poisoned");
        conn.execute(
            "INSERT INTO messages(id, conversation_id, parent_message_id, role, content_json, raw_provider_data_json, provider_id, model_id, reasoning_config_json, usage_json, duration_ms, ttft_ms, finish_reason, status, created_at) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15)",
            params![
                row.id,
                row.conversation_id,
                row.parent_message_id,
                row.role,
                row.content_json,
                row.raw_provider_data_json,
                row.provider_id,
                row.model_id,
                row.reasoning_config_json,
                row.usage_json,
                row.duration_ms,
                row.ttft_ms,
                row.finish_reason,
                row.status,
                row.created_at,
            ],
        )?;
        Ok(())
    }

    pub fn list_messages_by_conversation(&self, conversation_id: &str) -> Result<Vec<MessageRow>> {
        let conn = self.conn.lock().expect("db mutex poisoned");
        let mut stmt = conn.prepare(
            "SELECT id, conversation_id, parent_message_id, role, content_json, raw_provider_data_json, provider_id, model_id, reasoning_config_json, usage_json, duration_ms, ttft_ms, finish_reason, status, created_at FROM messages WHERE conversation_id = ?1 ORDER BY created_at ASC",
        )?;
        let rows = stmt
            .query_map(params![conversation_id], map_message_row)?
            .collect::<std::result::Result<Vec<_>, _>>()?;
        Ok(rows)
    }

    pub fn insert_bookmark(&self, row: &BookmarkRow) -> Result<()> {
        if row.label.trim().is_empty() {
            return Err(StoreError::Validation(
                "bookmark label must not be empty".to_string(),
            ));
        }
        if row.anchor_text.trim().is_empty() {
            return Err(StoreError::Validation(
                "bookmark anchor_text must not be empty".to_string(),
            ));
        }
        let conn = self.conn.lock().expect("db mutex poisoned");
        conn.execute(
            "INSERT INTO bookmarks(id, conversation_id, message_id, label, anchor_text, created_at) VALUES(?1,?2,?3,?4,?5,?6)",
            params![
                row.id,
                row.conversation_id,
                row.message_id,
                row.label,
                row.anchor_text,
                row.created_at,
            ],
        )?;
        Ok(())
    }

    pub fn list_bookmarks_by_conversation(
        &self,
        conversation_id: &str,
    ) -> Result<Vec<BookmarkRow>> {
        let conn = self.conn.lock().expect("db mutex poisoned");
        let mut stmt = conn.prepare(
            "SELECT id, conversation_id, message_id, label, anchor_text, created_at FROM bookmarks WHERE conversation_id = ?1 ORDER BY created_at ASC",
        )?;
        let rows = stmt
            .query_map(params![conversation_id], map_bookmark_row)?
            .collect::<std::result::Result<Vec<_>, _>>()?;
        Ok(rows)
    }

    pub fn delete_bookmark(&self, id: &str) -> Result<()> {
        let conn = self.conn.lock().expect("db mutex poisoned");
        conn.execute("DELETE FROM bookmarks WHERE id = ?1", params![id])?;
        Ok(())
    }

    // -----------------------------------------------------------------------
    // Folders
    // -----------------------------------------------------------------------

    pub fn create_folder(&self, name: &str, created_at: &str) -> Result<FolderRow> {
        if name.trim().is_empty() {
            return Err(StoreError::Validation(
                "folder name must not be empty".to_string(),
            ));
        }
        let conn = self.conn.lock().expect("db mutex poisoned");
        let id = uuid::Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO folders(id, name, created_at) VALUES(?1,?2,?3)",
            params![id, name.trim(), created_at],
        )?;
        Ok(FolderRow {
            id,
            name: name.trim().to_string(),
            created_at: created_at.to_string(),
        })
    }

    pub fn list_folders(&self) -> Result<Vec<FolderRow>> {
        let conn = self.conn.lock().expect("db mutex poisoned");
        let mut stmt = conn.prepare(
            "SELECT id, name, created_at FROM folders ORDER BY created_at ASC",
        )?;
        let rows = stmt
            .query_map([], |row| {
                Ok(FolderRow {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    created_at: row.get(2)?,
                })
            })?
            .collect::<std::result::Result<Vec<_>, _>>()?;
        Ok(rows)
    }

    pub fn rename_folder(&self, id: &str, name: &str) -> Result<()> {
        if name.trim().is_empty() {
            return Err(StoreError::Validation(
                "folder name must not be empty".to_string(),
            ));
        }
        let conn = self.conn.lock().expect("db mutex poisoned");
        conn.execute(
            "UPDATE folders SET name = ?1 WHERE id = ?2",
            params![name.trim(), id],
        )?;
        Ok(())
    }

    pub fn delete_folder(&self, id: &str) -> Result<()> {
        let conn = self.conn.lock().expect("db mutex poisoned");
        // Set folder_id to NULL on conversations before deleting the folder.
        conn.execute(
            "UPDATE conversations SET folder_id = NULL WHERE folder_id = ?1",
            params![id],
        )?;
        conn.execute("DELETE FROM folders WHERE id = ?1", params![id])?;
        Ok(())
    }

    pub fn set_conversation_folder(
        &self,
        conversation_id: &str,
        folder_id: Option<&str>,
    ) -> Result<()> {
        let conn = self.conn.lock().expect("db mutex poisoned");
        conn.execute(
            "UPDATE conversations SET folder_id = ?1 WHERE id = ?2",
            params![folder_id, conversation_id],
        )?;
        Ok(())
    }

    // -----------------------------------------------------------------------
    // Tags
    // -----------------------------------------------------------------------

    pub fn create_tag(&self, name: &str, created_at: &str) -> Result<TagRow> {
        if name.trim().is_empty() {
            return Err(StoreError::Validation(
                "tag name must not be empty".to_string(),
            ));
        }
        let conn = self.conn.lock().expect("db mutex poisoned");
        // Idempotent: return existing tag if name already exists.
        let existing: Option<String> = conn
            .query_row(
                "SELECT id FROM tags WHERE name = ?1",
                params![name.trim()],
                |row| row.get(0),
            )
            .optional()?;
        if let Some(id) = existing {
            return Ok(TagRow {
                id,
                name: name.trim().to_string(),
                created_at: created_at.to_string(),
            });
        }
        let id = uuid::Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO tags(id, name, created_at) VALUES(?1,?2,?3)",
            params![id, name.trim(), created_at],
        )?;
        Ok(TagRow {
            id,
            name: name.trim().to_string(),
            created_at: created_at.to_string(),
        })
    }

    pub fn list_tags(&self) -> Result<Vec<TagRow>> {
        let conn = self.conn.lock().expect("db mutex poisoned");
        let mut stmt = conn.prepare(
            "SELECT id, name, created_at FROM tags ORDER BY name ASC",
        )?;
        let rows = stmt
            .query_map([], |row| {
                Ok(TagRow {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    created_at: row.get(2)?,
                })
            })?
            .collect::<std::result::Result<Vec<_>, _>>()?;
        Ok(rows)
    }

    pub fn set_conversation_tags(
        &self,
        conversation_id: &str,
        tag_ids: &[String],
    ) -> Result<()> {
        let conn = self.conn.lock().expect("db mutex poisoned");
        conn.execute(
            "DELETE FROM conversation_tags WHERE conversation_id = ?1",
            params![conversation_id],
        )?;
        for tag_id in tag_ids {
            conn.execute(
                "INSERT INTO conversation_tags(conversation_id, tag_id) VALUES(?1,?2)",
                params![conversation_id, tag_id],
            )?;
        }
        Ok(())
    }

    pub fn list_conversation_tags(&self, conversation_id: &str) -> Result<Vec<TagRow>> {
        let conn = self.conn.lock().expect("db mutex poisoned");
        let mut stmt = conn.prepare(
            "SELECT t.id, t.name, t.created_at FROM tags t INNER JOIN conversation_tags ct ON t.id = ct.tag_id WHERE ct.conversation_id = ?1 ORDER BY t.name ASC",
        )?;
        let rows = stmt
            .query_map(params![conversation_id], |row| {
                Ok(TagRow {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    created_at: row.get(2)?,
                })
            })?
            .collect::<std::result::Result<Vec<_>, _>>()?;
        Ok(rows)
    }

    pub fn schema_version(&self) -> Result<i64> {
        let conn = self.conn.lock().expect("db mutex poisoned");
        let version: i64 = conn.pragma_query_value(None, "user_version", |row| row.get(0))?;
        Ok(version)
    }

    pub fn index_names(&self) -> Result<Vec<String>> {
        let conn = self.conn.lock().expect("db mutex poisoned");
        let mut stmt = conn.prepare(
            "SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'idx_%'",
        )?;
        let rows = stmt
            .query_map([], |row| row.get(0))?
            .collect::<std::result::Result<Vec<String>, _>>()?;
        Ok(rows)
    }
}

fn bool_from_i64(v: i64) -> bool {
    v != 0
}

fn map_provider_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<ProviderRow> {
    Ok(ProviderRow {
        id: row.get(0)?,
        name: row.get(1)?,
        compatibility_type: row.get(2)?,
        api_mode: row.get(3)?,
        base_url: row.get(4)?,
        credential_reference: row.get(5)?,
        additional_headers_json: row.get(6)?,
        default_model_id: row.get(7)?,
        enabled: bool_from_i64(row.get::<_, i64>(8)?),
        created_at: row.get(9)?,
        updated_at: row.get(10)?,
    })
}

fn map_model_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<ModelRow> {
    Ok(ModelRow {
        id: row.get(0)?,
        provider_id: row.get(1)?,
        remote_model_id: row.get(2)?,
        display_name: row.get(3)?,
        capabilities_json: row.get(4)?,
        manually_added: bool_from_i64(row.get::<_, i64>(5)?),
        available: bool_from_i64(row.get::<_, i64>(6)?),
        first_seen_at: row.get(7)?,
        last_seen_at: row.get(8)?,
    })
}

fn map_conversation_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<ConversationRow> {
    Ok(ConversationRow {
        id: row.get(0)?,
        title: row.get(1)?,
        provider_id: row.get(2)?,
        default_model_id: row.get(3)?,
        system_prompt: row.get(4)?,
        settings_json: row.get(5)?,
        pinned: bool_from_i64(row.get::<_, i64>(6)?),
        archived: bool_from_i64(row.get::<_, i64>(7)?),
        folder_id: row.get(8)?,
        created_at: row.get(9)?,
        updated_at: row.get(10)?,
    })
}

#[allow(dead_code)]
fn map_message_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<MessageRow> {
    Ok(MessageRow {
        id: row.get(0)?,
        conversation_id: row.get(1)?,
        parent_message_id: row.get(2)?,
        role: row.get(3)?,
        content_json: row.get(4)?,
        raw_provider_data_json: row.get(5)?,
        provider_id: row.get(6)?,
        model_id: row.get(7)?,
        reasoning_config_json: row.get(8)?,
        usage_json: row.get(9)?,
        duration_ms: row.get(10)?,
        ttft_ms: row.get(11)?,
        finish_reason: row.get(12)?,
        status: row.get(13)?,
        created_at: row.get(14)?,
    })
}

fn map_bookmark_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<BookmarkRow> {
    Ok(BookmarkRow {
        id: row.get(0)?,
        conversation_id: row.get(1)?,
        message_id: row.get(2)?,
        label: row.get(3)?,
        anchor_text: row.get(4)?,
        created_at: row.get(5)?,
    })
}
