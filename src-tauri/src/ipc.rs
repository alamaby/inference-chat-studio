//! Tauri IPC layer (Langkah 6).
//!
//! Rules:
//! - SQLite stores only `credential_reference`; secrets live in the OS store.
//! - `list_providers` / `export_provider` never return secrets (`api_key: null`).
//! - MVP-0 speaks OpenAI Chat Completions only (`api_mode == "chat_completions"`).
//! - No Actix server is started here; the stub stays disabled.

use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::Instant;

use chrono::Utc;
use conversation_store::{
    BookmarkRow, ConversationRow, Db, FolderRow, MessageRow, ModelRow, ProviderRow, StoreError,
    TagRow,
};
use provider_core::{
    ChatMessage, ConnectionStatus, ModelCapabilities, ModelInfo, NormalizedChatRequest,
    ProviderConfig, ProviderError, ReasoningConfig, ReasoningLevel,
};
use secret_store::{SecretStore, credential_reference_for_provider};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

pub struct SecretBackend {
    inner: Box<dyn SecretStore + Send + Sync>,
}

impl SecretBackend {
    pub fn os() -> Self {
        Self {
            inner: Box::new(secret_store::WindowsCredentialStore),
        }
    }

    // Test-only backend. Gated on `cfg(test)` (this crate's own test
    // builds); the `test-utils` feature is enabled on the secret-store
    // dependency in Cargo.toml so `InMemoryStore` is visible here.
    #[cfg(test)]
    pub fn in_memory_for_tests() -> Self {
        Self {
            inner: Box::new(secret_store::InMemoryStore::new()),
        }
    }
}

pub struct AppState {
    pub db: Arc<Db>,
    pub secrets: SecretBackend,
    pub streams: Mutex<HashMap<String, tokio::sync::watch::Sender<bool>>>,
}

impl AppState {
    pub fn with_db(db: Arc<Db>) -> Self {
        Self {
            db,
            secrets: SecretBackend::os(),
            streams: Mutex::new(HashMap::new()),
        }
    }
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

#[derive(Debug, Serialize)]
pub struct IpcError {
    pub code: String,
    pub message: String,
}

impl From<StoreError> for IpcError {
    fn from(e: StoreError) -> Self {
        Self {
            code: "store".to_string(),
            message: e.to_string(),
        }
    }
}

impl From<secret_store::SecretStoreError> for IpcError {
    fn from(e: secret_store::SecretStoreError) -> Self {
        Self {
            code: "secret".to_string(),
            // Never include secret values; messages only carry the key name.
            message: e.to_string(),
        }
    }
}

impl From<ProviderError> for IpcError {
    fn from(e: ProviderError) -> Self {
        let code = match e {
            ProviderError::Unauthorized(_) => "unauthorized",
            ProviderError::Timeout => "timeout",
            ProviderError::InvalidResponse(_) => "invalid_response",
            ProviderError::ModelNotFound(_) => "model_not_found",
            ProviderError::ReasoningNotSupported(_) => "reasoning_not_supported",
            ProviderError::StreamInterrupted(_) => "stream_interrupted",
            ProviderError::Network(_) => "network",
            ProviderError::Validation(_) => "validation",
        };
        Self {
            code: code.to_string(),
            message: e.to_string(),
        }
    }
}

// ---------------------------------------------------------------------------
// DTOs (secrets never leave the backend)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderDto {
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
    /// Always `None` over IPC. Present only so export schemas are explicit.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub api_key: Option<String>,
}

impl From<ProviderRow> for ProviderDto {
    fn from(row: ProviderRow) -> Self {
        Self {
            id: row.id,
            name: row.name,
            compatibility_type: row.compatibility_type,
            api_mode: row.api_mode,
            base_url: row.base_url,
            credential_reference: row.credential_reference,
            additional_headers_json: row.additional_headers_json,
            default_model_id: row.default_model_id,
            enabled: row.enabled,
            created_at: row.created_at,
            updated_at: row.updated_at,
            api_key: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateProviderInput {
    pub name: String,
    pub base_url: String,
    pub api_key: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub additional_headers_json: Option<String>,
    #[serde(default = "default_timeout")]
    pub timeout_ms: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub compatibility_type: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateProviderInput {
    pub name: Option<String>,
    pub base_url: Option<String>,
    pub api_key: Option<String>,
    pub additional_headers_json: Option<Option<String>>,
    pub timeout_ms: Option<u64>,
    pub default_model_id: Option<Option<String>>,
    pub enabled: Option<bool>,
}

fn default_timeout() -> u64 {
    30_000
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AddModelManualInput {
    pub provider_id: String,
    pub remote_model_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub display_name: Option<String>,
}

// Per-delta chunk events are deferred: MVP-0 collects the stream in Rust
// and emits a single `chat-done`. This type reserves the event shape for
// the Responses/Anthropic phase without changing the frontend contract.
#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatChunkEvent {
    pub stream_id: String,
    pub conversation_id: String,
    pub delta: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatDoneEvent {
    pub stream_id: String,
    pub conversation_id: String,
    pub message_id: String,
    pub text: String,
    pub finish_reason: Option<String>,
    pub usage: Option<serde_json::Value>,
    pub duration_ms: i64,
    pub ttft_ms: Option<i64>,
    pub model: String,
    pub request_url: String,
    pub status_code: u16,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatErrorEvent {
    pub stream_id: String,
    pub conversation_id: String,
    pub code: String,
    pub message: String,
    /// Request diagnostics so the Inspector can render even on failure.
    /// Never contains secret values (the body built here has no auth fields).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub request_url: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub request_body: Option<serde_json::Value>,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn now_rfc3339() -> String {
    Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}

fn validate_base_url(raw: &str) -> Result<String, IpcError> {
    let trimmed = raw.trim();
    if !(trimmed.starts_with("http://") || trimmed.starts_with("https://")) {
        return Err(IpcError {
            code: "validation".to_string(),
            message: "base_url must start with http:// or https://".to_string(),
        });
    }
    Ok(provider_openai::normalize_base_url(trimmed))
}

fn load_api_key(state: &AppState, reference: Option<&str>) -> Result<String, IpcError> {
    let reference = reference.ok_or_else(|| IpcError {
        code: "unauthorized".to_string(),
        message: "missing credential, re-enter API key".to_string(),
    })?;
    let key = reference
        .strip_prefix("keyring:")
        .map(|s| format!("keyring:{s}"))
        .unwrap_or_else(|| reference.to_string());
    match state.secrets.inner.get(&key)? {
        Some(secret) => Ok(secret),
        None => Err(IpcError {
            code: "unauthorized".to_string(),
            message: "missing credential, re-enter API key".to_string(),
        }),
    }
}

fn row_to_config(row: &ProviderRow, timeout_ms: u64) -> ProviderConfig {
    ProviderConfig {
        id: row.id.clone(),
        name: row.name.clone(),
        compatibility_type: row.compatibility_type.clone(),
        api_mode: row.api_mode.clone(),
        base_url: row.base_url.clone(),
        credential_reference: row.credential_reference.clone(),
        additional_headers_json: row.additional_headers_json.clone(),
        timeout_ms,
    }
}

fn model_caps_from_json(raw: Option<&str>) -> ModelCapabilities {
    match raw {
        Some(json) => serde_json::from_str(json).unwrap_or_default(),
        None => ModelCapabilities::default(),
    }
}

// Masked in production use when header capture lands (post-MVP-0);
// exercised today by the unit test below and mirrored in the TS inspector.
#[allow(dead_code)]
fn mask_headers(headers: &serde_json::Map<String, serde_json::Value>) -> serde_json::Value {
    let mut out = serde_json::Map::new();
    for (k, v) in headers {
        if k.eq_ignore_ascii_case("authorization") || k.to_lowercase().contains("secret") {
            out.insert(k.clone(), serde_json::Value::String("[REDACTED]".to_string()));
        } else {
            out.insert(k.clone(), v.clone());
        }
    }
    serde_json::Value::Object(out)
}

/// Public masking helper reused by the inspector tests (Langkah 8).
/// Production header capture lands post-MVP-0; until then this is
/// exercised by unit tests and mirrored in the TS inspector.
#[allow(dead_code)]
pub fn mask_request_headers_for_log(headers_json: Option<&str>) -> Option<serde_json::Value> {
    headers_json.and_then(|raw| {
        serde_json::from_str::<serde_json::Value>(raw).ok().map(|v| match v {
            serde_json::Value::Object(map) => mask_headers(&map),
            other => other,
        })
    })
}

async fn emit_error(
    app: &AppHandle,
    stream_id: &str,
    conversation_id: &str,
    err: IpcError,
    diagnostics: Option<(String, serde_json::Value)>,
) {
    let (request_url, request_body) = diagnostics
        .map(|(u, b)| (Some(u), Some(b)))
        .unwrap_or((None, None));
    let _ = app.emit(
        "chat-error",
        ChatErrorEvent {
            stream_id: stream_id.to_string(),
            conversation_id: conversation_id.to_string(),
            code: err.code,
            message: err.message,
            request_url,
            request_body,
        },
    );
}

/// Like [`emit_error`] but targets a specific window label.
async fn emit_error_to(
    app: &AppHandle,
    label: &str,
    stream_id: &str,
    conversation_id: &str,
    err: IpcError,
    diagnostics: Option<(String, serde_json::Value)>,
) {
    let (request_url, request_body) = diagnostics
        .map(|(u, b)| (Some(u), Some(b)))
        .unwrap_or((None, None));
    let _ = app.emit_to(
        label,
        "chat-error",
        ChatErrorEvent {
            stream_id: stream_id.to_string(),
            conversation_id: conversation_id.to_string(),
            code: err.code,
            message: err.message,
            request_url,
            request_body,
        },
    );
}

// ---------------------------------------------------------------------------
// Provider commands
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn create_provider(
    state: State<'_, AppState>,
    input: CreateProviderInput,
) -> Result<ProviderDto, IpcError> {
    if input.name.trim().is_empty() {
        return Err(IpcError {
            code: "validation".to_string(),
            message: "provider name must not be empty".to_string(),
        });
    }
    if input.api_key.is_empty() {
        return Err(IpcError {
            code: "validation".to_string(),
            message: "api key must not be empty".to_string(),
        });
    }
    let base_url = validate_base_url(&input.base_url)?;
    let compat = input.compatibility_type.unwrap_or_else(|| "openai".to_string());
    if compat != "openai" && compat != "anthropic" {
        return Err(IpcError {
            code: "validation".to_string(),
            message: format!("unsupported compatibility_type '{compat}'"),
        });
    }
    let api_mode = if compat == "anthropic" { "anthropic" } else { "chat_completions" };
    let now = now_rfc3339();
    let id = uuid::Uuid::new_v4().to_string();
    let credential_reference = credential_reference_for_provider(&id);
    state
        .secrets
        .inner
        .set(&credential_reference, &input.api_key)?;
    let row = ProviderRow {
        id: id.clone(),
        name: input.name.trim().to_string(),
        compatibility_type: compat.clone(),
        api_mode: api_mode.to_string(),
        base_url,
        credential_reference: Some(credential_reference),
        additional_headers_json: input.additional_headers_json,
        default_model_id: None,
        enabled: true,
        created_at: now.clone(),
        updated_at: now,
    };
    state.db.insert_provider(&row)?;
    Ok(ProviderDto::from(row))
}

#[tauri::command]
pub async fn list_providers(state: State<'_, AppState>) -> Result<Vec<ProviderDto>, IpcError> {
    Ok(state
        .db
        .list_providers()?
        .into_iter()
        .map(ProviderDto::from)
        .collect())
}

#[tauri::command]
pub async fn update_provider(
    state: State<'_, AppState>,
    id: String,
    input: UpdateProviderInput,
) -> Result<ProviderDto, IpcError> {
    let mut row = state.db.get_provider(&id)?.ok_or_else(|| IpcError {
        code: "model_not_found".to_string(),
        message: format!("provider not found: {id}"),
    })?;
    if let Some(name) = input.name {
        if name.trim().is_empty() {
            return Err(IpcError {
                code: "validation".to_string(),
                message: "provider name must not be empty".to_string(),
            });
        }
        row.name = name.trim().to_string();
    }
    if let Some(base_url) = input.base_url {
        row.base_url = validate_base_url(&base_url)?;
    }
    if let Some(api_key) = input.api_key {
        if api_key.is_empty() {
            return Err(IpcError {
                code: "validation".to_string(),
                message: "api key must not be empty".to_string(),
            });
        }
        let reference = row
            .credential_reference
            .clone()
            .unwrap_or_else(|| credential_reference_for_provider(&row.id));
        state.secrets.inner.set(&reference, &api_key)?;
        row.credential_reference = Some(reference);
    }
    if let Some(headers) = input.additional_headers_json {
        row.additional_headers_json = headers;
    }
    if let Some(default_model) = input.default_model_id {
        row.default_model_id = default_model;
    }
    if let Some(enabled) = input.enabled {
        row.enabled = enabled;
    }
    row.updated_at = now_rfc3339();
    // Re-insert via delete+insert is avoided: update in place through a fresh
    // row delete+insert would break FK; instead update fields directly.
    state.db.delete_provider(&row.id)?;
    state.db.insert_provider(&row)?;
    Ok(ProviderDto::from(row))
}

#[tauri::command]
pub async fn delete_provider(
    state: State<'_, AppState>,
    id: String,
) -> Result<(), IpcError> {
    let row = state.db.get_provider(&id)?.ok_or_else(|| IpcError {
        code: "model_not_found".to_string(),
        message: format!("provider not found: {id}"),
    })?;
    // Detach history first: conversations reference the provider row without
    // an ON DELETE action, and history must survive provider deletion.
    state.db.clear_conversation_provider(&id)?;
    state.db.delete_provider(&id)?;
    if let Some(reference) = row.credential_reference {
        let _ = state.secrets.inner.delete(&reference);
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Backup (export/import) — single-file, merge-only, secret-free
// ---------------------------------------------------------------------------

/// Provider entry inside a backup file.
///
/// Deliberately omits `credential_reference` and `api_key`: secrets never
/// leave the OS store, so an imported provider must get its key re-entered.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupProvider {
    /// Original id, needed so models/conversations can be re-pointed on import.
    pub id: String,
    pub name: String,
    pub base_url: String,
    pub compatibility_type: String,
    pub api_mode: String,
    pub additional_headers_json: Option<String>,
    pub default_model_id: Option<String>,
    pub enabled: bool,
    pub created_at: String,
    pub updated_at: String,
}

impl From<ProviderRow> for BackupProvider {
    fn from(row: ProviderRow) -> Self {
        Self {
            id: row.id,
            name: row.name,
            base_url: row.base_url,
            compatibility_type: row.compatibility_type,
            api_mode: row.api_mode,
            additional_headers_json: row.additional_headers_json,
            default_model_id: row.default_model_id,
            enabled: row.enabled,
            created_at: row.created_at,
            updated_at: row.updated_at,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupFolder {
    pub id: String,
    pub name: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupTag {
    pub id: String,
    pub name: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupConversation {
    pub conversation: ConversationRow,
    pub messages: Vec<MessageRow>,
    pub bookmarks: Vec<BookmarkRow>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub folder_id: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub tag_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupFile {
    pub format: String,
    pub version: u32,
    pub exported_at: String,
    pub app_version: String,
    pub providers: Vec<BackupProvider>,
    pub models: Vec<ModelRow>,
    pub conversations: Vec<BackupConversation>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub folders: Vec<BackupFolder>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub tags: Vec<BackupTag>,
}

/// Export a provider configuration. `api_key` is ALWAYS null.
#[tauri::command]
pub async fn export_provider(
    state: State<'_, AppState>,
    id: String,
) -> Result<serde_json::Value, IpcError> {
    let row = state.db.get_provider(&id)?.ok_or_else(|| IpcError {
        code: "model_not_found".to_string(),
        message: format!("provider not found: {id}"),
    })?;
    Ok(serde_json::json!({
        "name": row.name,
        "base_url": row.base_url,
        "compatibility": row.compatibility_type,
        "api_mode": row.api_mode,
        "api_key": null,
    }))
}

/// Export providers (without secrets), models, and full chat history as one
/// backup file.
///
/// Ordering is inherited from the store (providers `created_at ASC`,
/// conversations `updated_at DESC`, messages `created_at ASC`) — do not
/// re-sort here. An empty database yields a valid backup with empty arrays.
#[tauri::command]
pub async fn export_backup(state: State<'_, AppState>) -> Result<BackupFile, IpcError> {
    backup_from_db(&state.db)
}

/// `State`-free so tests can drive it with an in-memory `Db`; Tauri's
/// `State` wrapper has no public constructor.
fn backup_from_db(db: &Db) -> Result<BackupFile, IpcError> {
    let providers: Vec<BackupProvider> = db
        .list_providers()?
        .into_iter()
        .map(BackupProvider::from)
        .collect();
    let mut models: Vec<ModelRow> = Vec::new();
    for provider in &providers {
        models.extend(db.list_models_by_provider(&provider.id)?);
    }
    let folders: Vec<BackupFolder> = db
        .list_folders()?
        .into_iter()
        .map(|f| BackupFolder {
            id: f.id,
            name: f.name,
            created_at: f.created_at,
        })
        .collect();
    let tags: Vec<BackupTag> = db
        .list_tags()?
        .into_iter()
        .map(|t| BackupTag {
            id: t.id,
            name: t.name,
            created_at: t.created_at,
        })
        .collect();
    let conversations = db
        .list_conversations()?
        .into_iter()
        .map(|conversation| {
            let messages = db.list_messages_by_conversation(&conversation.id)?;
            let bookmarks = db.list_bookmarks_by_conversation(&conversation.id)?;
            let tag_ids = db
                .list_conversation_tags(&conversation.id)?
                .into_iter()
                .map(|t| t.id)
                .collect();
            Ok::<BackupConversation, IpcError>(BackupConversation {
                conversation,
                messages,
                bookmarks,
                folder_id: None,
                tag_ids,
            })
        })
        .collect::<Result<Vec<BackupConversation>, IpcError>>()?;
    Ok(BackupFile {
        format: BACKUP_FORMAT.to_string(),
        version: BACKUP_VERSION,
        exported_at: now_rfc3339(),
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        providers,
        models,
        conversations,
        folders,
        tags,
    })
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportSummary {
    pub providers: usize,
    pub models: usize,
    pub conversations: usize,
    pub messages: usize,
    pub bookmarks: usize,
}

pub const BACKUP_FORMAT: &str = "ics-backup";
pub const BACKUP_VERSION: u32 = 2;
const MAX_BACKUP_PROVIDERS: usize = 10_000;
const MAX_BACKUP_CONVERSATIONS: usize = 50_000;

/// Gate every rejection BEFORE any write, so a bad file cannot leave a
/// half-imported database behind.
fn validate_backup(backup: &BackupFile) -> Result<(), IpcError> {
    if backup.format != BACKUP_FORMAT {
        return Err(IpcError {
            code: "validation".to_string(),
            message: format!("unsupported backup format: {}", backup.format),
        });
    }
    if backup.version != 1 && backup.version != 2 {
        return Err(IpcError {
            code: "validation".to_string(),
            message: format!("unsupported backup version: {}", backup.version),
        });
    }
    if backup.providers.len() > MAX_BACKUP_PROVIDERS {
        return Err(backup_too_large("providers"));
    }
    if backup.conversations.len() > MAX_BACKUP_CONVERSATIONS {
        return Err(backup_too_large("conversations"));
    }
    for provider in &backup.providers {
        if provider.name.trim().is_empty() {
            return Err(IpcError {
                code: "validation".to_string(),
                message: "provider name must not be empty".to_string(),
            });
        }
        if provider.api_mode != "chat_completions" && provider.api_mode != "anthropic" {
            // Unknown api_mode: this provider is skipped during import
            // (counted as 0) instead of failing the whole file, so one
            // unsupported provider never wipes out the usable data.
            continue;
        }
    }
    for conversation in &backup.conversations {
        for bookmark in &conversation.bookmarks {
            if bookmark.label.trim().is_empty() || bookmark.anchor_text.trim().is_empty() {
                // Same precondition `Db::insert_bookmark` enforces; checking
                // it here keeps the import all-or-nothing.
                return Err(IpcError {
                    code: "validation".to_string(),
                    message: "bookmark label and anchor_text must not be empty".to_string(),
                });
            }
        }
    }
    for folder in &backup.folders {
        if folder.name.trim().is_empty() {
            return Err(IpcError {
                code: "validation".to_string(),
                message: "folder name must not be empty".to_string(),
            });
        }
    }
    for tag in &backup.tags {
        if tag.name.trim().is_empty() {
            return Err(IpcError {
                code: "validation".to_string(),
                message: "tag name must not be empty".to_string(),
            });
        }
    }
    Ok(())
}

fn backup_too_large(what: &str) -> IpcError {
    IpcError {
        code: "validation".to_string(),
        message: format!("backup too large: {what}"),
    }
}

/// Import a backup as NEW rows: every id is regenerated, so existing data is
/// never deleted or overwritten (pure merge).
///
/// The secret store is deliberately untouched — imported providers carry no
/// `credential_reference`, so the user must re-enter each API key.
/// `State`-free so tests can drive it with an in-memory `Db`.
fn import_backup_file(db: &Db, backup: &BackupFile) -> Result<ImportSummary, IpcError> {
    validate_backup(backup)?;
    let mut provider_map: HashMap<String, String> = HashMap::new();
    let mut providers = 0usize;
    for provider in &backup.providers {
        if provider.api_mode != "chat_completions" && provider.api_mode != "anthropic" {
            continue;
        }
        // Timestamps are preserved verbatim (history fidelity); ids are new.
        let new_id = uuid::Uuid::new_v4().to_string();
        db.insert_provider(&ProviderRow {
            id: new_id.clone(),
            name: provider.name.clone(),
            compatibility_type: provider.compatibility_type.clone(),
            api_mode: provider.api_mode.clone(),
            base_url: provider.base_url.clone(),
            credential_reference: None,
            additional_headers_json: provider.additional_headers_json.clone(),
            default_model_id: provider.default_model_id.clone(),
            enabled: provider.enabled,
            created_at: provider.created_at.clone(),
            updated_at: provider.updated_at.clone(),
        })?;
        provider_map.insert(provider.id.clone(), new_id);
        providers += 1;
    }
    let mut models = 0usize;
    for model in &backup.models {
        let Some(provider_id) = provider_map.get(&model.provider_id).cloned() else {
            continue;
        };
        let now = now_rfc3339();
        db.upsert_model(&ModelRow {
            id: uuid::Uuid::new_v4().to_string(),
            provider_id,
            remote_model_id: model.remote_model_id.clone(),
            display_name: model.display_name.clone(),
            capabilities_json: model.capabilities_json.clone(),
            manually_added: model.manually_added,
            available: model.available,
            first_seen_at: model.first_seen_at.clone(),
            last_seen_at: now,
        })?;
        models += 1;
    }
    // Import folders and tags (id remap for conversation references).
    let mut folder_map: HashMap<String, String> = HashMap::new();
    for folder in &backup.folders {
        let new_id = uuid::Uuid::new_v4().to_string();
        db.create_folder(&folder.name, &folder.created_at)?;
        folder_map.insert(folder.id.clone(), new_id);
    }
    let mut tag_map: HashMap<String, String> = HashMap::new();
    for tag in &backup.tags {
        let new_id = uuid::Uuid::new_v4().to_string();
        db.create_tag(&tag.name, &tag.created_at)?;
        tag_map.insert(tag.id.clone(), new_id);
    }
    let mut conversations = 0usize;
    let mut messages = 0usize;
    let mut bookmarks = 0usize;
    for entry in &backup.conversations {
        let provider_id = entry
            .conversation
            .provider_id
            .as_deref()
            .and_then(|old| provider_map.get(old).cloned());
        let new_conversation_id = uuid::Uuid::new_v4().to_string();
        let folder_id = entry
            .folder_id
            .as_deref()
            .and_then(|old| folder_map.get(old).cloned());
        let tag_ids: Vec<String> = entry
            .tag_ids
            .iter()
            .filter_map(|old| tag_map.get(old).cloned())
            .collect();
        db.insert_conversation(&ConversationRow {
            id: new_conversation_id.clone(),
            title: entry.conversation.title.clone(),
            provider_id,
            default_model_id: entry.conversation.default_model_id.clone(),
            system_prompt: entry.conversation.system_prompt.clone(),
            settings_json: entry.conversation.settings_json.clone(),
            pinned: entry.conversation.pinned,
            archived: entry.conversation.archived,
            folder_id,
            created_at: entry.conversation.created_at.clone(),
            updated_at: entry.conversation.updated_at.clone(),
        })?;
        db.set_conversation_tags(&new_conversation_id, &tag_ids)?;
        conversations += 1;
        let mut message_map: HashMap<String, String> = HashMap::new();
        for message in &entry.messages {
            let new_message_id = uuid::Uuid::new_v4().to_string();
            db.insert_message(&MessageRow {
                id: new_message_id.clone(),
                conversation_id: new_conversation_id.clone(),
                parent_message_id: None,
                role: message.role.clone(),
                // Payload kept verbatim (never parsed) — `messages.provider_id`
                // has no FK and is display-only, so the original id survives.
                content_json: message.content_json.clone(),
                raw_provider_data_json: message.raw_provider_data_json.clone(),
                provider_id: message.provider_id.clone(),
                model_id: message.model_id.clone(),
                reasoning_config_json: message.reasoning_config_json.clone(),
                usage_json: message.usage_json.clone(),
                duration_ms: message.duration_ms,
                ttft_ms: message.ttft_ms,
                finish_reason: message.finish_reason.clone(),
                status: message.status.clone(),
                created_at: message.created_at.clone(),
            })?;
            message_map.insert(message.id.clone(), new_message_id);
            messages += 1;
        }
        for bookmark in &entry.bookmarks {
            let Some(message_id) = message_map.get(&bookmark.message_id).cloned() else {
                continue;
            };
            db.insert_bookmark(&BookmarkRow {
                id: uuid::Uuid::new_v4().to_string(),
                conversation_id: new_conversation_id.clone(),
                message_id,
                label: bookmark.label.clone(),
                anchor_text: bookmark.anchor_text.clone(),
                created_at: bookmark.created_at.clone(),
            })?;
            bookmarks += 1;
        }
    }
    Ok(ImportSummary {
        providers,
        models,
        conversations,
        messages,
        bookmarks,
    })
}

#[tauri::command]
pub async fn import_backup(
    state: State<'_, AppState>,
    backup: BackupFile,
) -> Result<ImportSummary, IpcError> {
    import_backup_file(&state.db, &backup)
}

#[tauri::command]
pub async fn test_connection_cmd(
    state: State<'_, AppState>,
    id: String,
) -> Result<ConnectionStatus, IpcError> {
    let row = state.db.get_provider(&id)?.ok_or_else(|| IpcError {
        code: "model_not_found".to_string(),
        message: format!("provider not found: {id}"),
    })?;
    if row.api_mode != "chat_completions" && row.api_mode != "anthropic" {
        return Err(IpcError {
            code: "validation".to_string(),
            message: format!(
                "unsupported api_mode '{}': only 'chat_completions' and 'anthropic' are supported",
                row.api_mode
            ),
        });
    }
    let api_key = load_api_key(&state, row.credential_reference.as_deref())?;
    eprintln!("[ipc] test_connection provider={} url={}", id, row.base_url);
    let result = if row.api_mode == "anthropic" {
        provider_anthropic::test_anthropic_connection(&row.base_url, &api_key, 30_000).await
    } else {
        provider_openai::test_connection(&row.base_url, &api_key, 30_000).await
    };
    match &result {
        Ok(status) => eprintln!("[ipc] test_connection {id} -> {status:?}"),
        Err(e) => eprintln!("[ipc] test_connection {id} failed: {e}"),
    }
    Ok(result?)
}

// ---------------------------------------------------------------------------
// Model commands
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn refresh_models(
    state: State<'_, AppState>,
    provider_id: String,
) -> Result<Vec<ModelInfo>, IpcError> {
    let row = state
        .db
        .get_provider(&provider_id)?
        .ok_or_else(|| IpcError {
            code: "model_not_found".to_string(),
            message: format!("provider not found: {provider_id}"),
        })?;
    if row.api_mode != "chat_completions" && row.api_mode != "anthropic" {
        return Err(IpcError {
            code: "validation".to_string(),
            message: "only 'chat_completions' and 'anthropic' are supported".to_string(),
        });
    }
    let api_key = load_api_key(&state, row.credential_reference.as_deref())?;
    eprintln!(
        "[ipc] refresh_models provider={} url={}",
        provider_id, row.base_url
    );
    let models = if row.api_mode == "anthropic" {
        provider_anthropic::list_anthropic_models(&row.base_url, &api_key, 30_000)
            .await
            .map_err(|e| {
                eprintln!("[ipc] refresh_models {provider_id} failed: {e}");
                IpcError::from(e)
            })?
    } else {
        provider_openai::list_models(&row.base_url, &api_key, 30_000)
            .await
            .map_err(|e| {
                eprintln!("[ipc] refresh_models {provider_id} failed: {e}");
                IpcError::from(e)
            })?
    };
    let now = now_rfc3339();
    for model in &models {
        let existing: Option<ModelRow> = state
            .db
            .list_models_by_provider(&provider_id)?
            .into_iter()
            .find(|m| m.remote_model_id == model.remote_model_id);
        let (id, first_seen_at) = match existing {
            Some(m) => (m.id, m.first_seen_at),
            None => (uuid::Uuid::new_v4().to_string(), now.clone()),
        };
        state.db.upsert_model(&ModelRow {
            id,
            provider_id: provider_id.clone(),
            remote_model_id: model.remote_model_id.clone(),
            display_name: model.display_name.clone(),
            capabilities_json: Some(serde_json::to_string(&model.capabilities).unwrap_or_default()),
            manually_added: false,
            available: true,
            first_seen_at,
            last_seen_at: now.clone(),
        })?;
    }
    Ok(models)
}

#[tauri::command]
pub async fn list_models_cmd(
    state: State<'_, AppState>,
    provider_id: String,
) -> Result<Vec<ModelInfo>, IpcError> {
    let rows = state.db.list_models_by_provider(&provider_id)?;
    Ok(rows
        .into_iter()
        .map(|m| ModelInfo {
            remote_model_id: m.remote_model_id,
            display_name: m.display_name,
            capabilities: model_caps_from_json(m.capabilities_json.as_deref()),
        })
        .collect())
}

#[tauri::command]
pub async fn add_model_manual(
    state: State<'_, AppState>,
    input: AddModelManualInput,
) -> Result<ModelInfo, IpcError> {
    if input.remote_model_id.trim().is_empty() {
        return Err(IpcError {
            code: "validation".to_string(),
            message: "remote_model_id must not be empty".to_string(),
        });
    }
    let caps = ModelCapabilities::default();
    let now = now_rfc3339();
    state.db.upsert_model(&ModelRow {
        id: uuid::Uuid::new_v4().to_string(),
        provider_id: input.provider_id.clone(),
        remote_model_id: input.remote_model_id.trim().to_string(),
        display_name: input.display_name.clone().or_else(|| Some(input.remote_model_id.trim().to_string())),
        capabilities_json: Some(serde_json::to_string(&caps).unwrap_or_default()),
        manually_added: true,
        available: true,
        first_seen_at: now.clone(),
        last_seen_at: now,
    })?;
    Ok(ModelInfo {
        remote_model_id: input.remote_model_id.trim().to_string(),
        display_name: input.display_name,
        capabilities: caps,
    })
}

// ---------------------------------------------------------------------------
// Conversation commands
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn create_conversation(
    state: State<'_, AppState>,
    title: String,
    provider_id: Option<String>,
    default_model_id: Option<String>,
    system_prompt: Option<String>,
) -> Result<ConversationRow, IpcError> {
    let now = now_rfc3339();
    let row = ConversationRow {
        id: uuid::Uuid::new_v4().to_string(),
        title: if title.trim().is_empty() {
            "New conversation".to_string()
        } else {
            title.trim().to_string()
        },
        provider_id,
        default_model_id,
        system_prompt,
        settings_json: None,
        pinned: false,
        archived: false,
        folder_id: None,
        created_at: now.clone(),
        updated_at: now,
    };
    state.db.insert_conversation(&row)?;
    Ok(row)
}

#[tauri::command]
pub async fn list_conversations(
    state: State<'_, AppState>,
) -> Result<Vec<ConversationRow>, IpcError> {
    Ok(state.db.list_conversations()?)
}

#[tauri::command]
pub async fn rename_conversation(
    state: State<'_, AppState>,
    id: String,
    title: String,
) -> Result<(), IpcError> {
    Ok(state.db.rename_conversation(&id, &title, &now_rfc3339())?)
}

#[tauri::command]
pub async fn delete_conversation(
    state: State<'_, AppState>,
    id: String,
) -> Result<(), IpcError> {
    Ok(state.db.delete_conversation(&id)?)
}

#[tauri::command]
pub async fn update_conversation_settings(
    state: State<'_, AppState>,
    id: String,
    system_prompt: Option<String>,
    settings_json: Option<String>,
    default_model_id: Option<String>,
) -> Result<(), IpcError> {
    Ok(state.db.update_conversation_settings(
        &id,
        system_prompt.as_deref(),
        settings_json.as_deref(),
        default_model_id.as_deref(),
        &now_rfc3339(),
    )?)
}

#[tauri::command]
pub async fn list_messages_cmd(
    state: State<'_, AppState>,
    conversation_id: String,
) -> Result<Vec<MessageRow>, IpcError> {
    Ok(state.db.list_messages_by_conversation(&conversation_id)?)
}

#[tauri::command]
pub async fn create_bookmark(
    state: State<'_, AppState>,
    conversation_id: String,
    message_id: String,
    label: String,
    anchor_text: String,
) -> Result<BookmarkRow, IpcError> {
    let row = BookmarkRow {
        id: uuid::Uuid::new_v4().to_string(),
        conversation_id,
        message_id,
        label,
        anchor_text,
        created_at: now_rfc3339(),
    };
    state.db.insert_bookmark(&row)?;
    Ok(row)
}

#[tauri::command]
pub async fn list_bookmarks_cmd(
    state: State<'_, AppState>,
    conversation_id: String,
) -> Result<Vec<BookmarkRow>, IpcError> {
    Ok(state.db.list_bookmarks_by_conversation(&conversation_id)?)
}

#[tauri::command]
pub async fn delete_bookmark(
    state: State<'_, AppState>,
    id: String,
) -> Result<(), IpcError> {
    Ok(state.db.delete_bookmark(&id)?)
}

// ---------------------------------------------------------------------------
// Folder commands
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn create_folder(
    state: State<'_, AppState>,
    name: String,
) -> Result<FolderRow, IpcError> {
    if name.trim().is_empty() {
        return Err(IpcError {
            code: "validation".to_string(),
            message: "folder name must not be empty".to_string(),
        });
    }
    Ok(state.db.create_folder(&name, &now_rfc3339())?)
}

#[tauri::command]
pub async fn list_folders_cmd(state: State<'_, AppState>) -> Result<Vec<FolderRow>, IpcError> {
    Ok(state.db.list_folders()?)
}

#[tauri::command]
pub async fn rename_folder(
    state: State<'_, AppState>,
    id: String,
    name: String,
) -> Result<(), IpcError> {
    if name.trim().is_empty() {
        return Err(IpcError {
            code: "validation".to_string(),
            message: "folder name must not be empty".to_string(),
        });
    }
    Ok(state.db.rename_folder(&id, &name)?)
}

#[tauri::command]
pub async fn delete_folder(state: State<'_, AppState>, id: String) -> Result<(), IpcError> {
    Ok(state.db.delete_folder(&id)?)
}

// ---------------------------------------------------------------------------
// Tag commands
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn create_tag(
    state: State<'_, AppState>,
    name: String,
) -> Result<TagRow, IpcError> {
    if name.trim().is_empty() {
        return Err(IpcError {
            code: "validation".to_string(),
            message: "tag name must not be empty".to_string(),
        });
    }
    Ok(state.db.create_tag(&name, &now_rfc3339())?)
}

#[tauri::command]
pub async fn list_tags_cmd(state: State<'_, AppState>) -> Result<Vec<TagRow>, IpcError> {
    Ok(state.db.list_tags()?)
}

#[tauri::command]
pub async fn set_conversation_folder_cmd(
    state: State<'_, AppState>,
    conversation_id: String,
    folder_id: Option<String>,
) -> Result<(), IpcError> {
    Ok(state.db.set_conversation_folder(&conversation_id, folder_id.as_deref())?)
}

#[tauri::command]
pub async fn set_conversation_tags_cmd(
    state: State<'_, AppState>,
    conversation_id: String,
    tag_ids: Vec<String>,
) -> Result<(), IpcError> {
    Ok(state.db.set_conversation_tags(&conversation_id, &tag_ids)?)
}

// ---------------------------------------------------------------------------
// Chat commands
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StreamChatInput {
    pub conversation_id: String,
    pub provider_id: String,
    pub model: String,
    pub messages: Vec<ChatMessage>,
    pub system_prompt: Option<String>,
    pub temperature: Option<f32>,
    pub max_output_tokens: Option<u32>,
    pub reasoning_level: ReasoningLevel,
    pub reasoning_custom_json: Option<serde_json::Value>,
    pub timeout_ms: Option<u64>,
    pub origin_window: Option<String>,
}

#[tauri::command]
pub async fn stream_chat_cmd(
    app: AppHandle,
    state: State<'_, AppState>,
    input: StreamChatInput,
) -> Result<String, IpcError> {
    let row = state
        .db
        .get_provider(&input.provider_id)?
        .ok_or_else(|| IpcError {
            code: "model_not_found".to_string(),
            message: format!("provider not found: {}", input.provider_id),
        })?;
    if row.api_mode != "chat_completions" && row.api_mode != "anthropic" {
        return Err(IpcError {
            code: "validation".to_string(),
            message: "only 'chat_completions' and 'anthropic' are supported".to_string(),
        });
    }
    let is_anthropic = row.api_mode == "anthropic";
    let _ = row_to_config(&row, input.timeout_ms.unwrap_or(30_000));

    // Resolve model capabilities from the local cache (or manual defaults).
    let caps = state
        .db
        .list_models_by_provider(&row.id)?
        .into_iter()
        .find(|m| m.remote_model_id == input.model)
        .map(|m| model_caps_from_json(m.capabilities_json.as_deref()))
        .unwrap_or_default();

    // Fail fast BEFORE any HTTP when the reasoning level is not allowed.
    let reasoning = ReasoningConfig {
        level: input.reasoning_level,
        custom_json: input.reasoning_custom_json.clone(),
    };
    reasoning.validate().map_err(IpcError::from)?;
    let effort = if is_anthropic {
        // Anthropic reasoning: only None/Automatic/Custom are supported.
        // Concrete levels (Minimal..Maximum) are rejected until wire values
        // are confirmed against the real provider (plan Notes, blocker 1).
        match reasoning.level {
            ReasoningLevel::Automatic | ReasoningLevel::None => None,
            ReasoningLevel::Custom => {
                if reasoning.custom_json.is_none() {
                    return Err(IpcError {
                        code: "validation".to_string(),
                        message: "custom reasoning requires custom_json".to_string(),
                    });
                }
                Some(
                    reasoning
                        .custom_json
                        .as_ref()
                        .unwrap()
                        .to_string(),
                )
            }
            _ => {
                return Err(IpcError {
                    code: "reasoning_not_supported".to_string(),
                    message: format!(
                        "anthropic reasoning level '{}' is not yet supported",
                        reasoning.level.as_str()
                    ),
                });
            }
        }
    } else {
        provider_openai::map_reasoning(
            &reasoning.level,
            &caps,
            reasoning.custom_json.as_ref(),
        )
        .map_err(IpcError::from)?
    };

    let api_key = load_api_key(&state, row.credential_reference.as_deref())?;
    let stream_id = uuid::Uuid::new_v4().to_string();
    let (cancel_tx, cancel_rx) = tokio::sync::watch::channel(false);
    state
        .streams
        .lock()
        .expect("streams mutex poisoned")
        .insert(stream_id.clone(), cancel_tx);

    let request = NormalizedChatRequest {
        model: input.model.clone(),
        system_prompt: input.system_prompt.clone(),
        messages: input.messages.clone(),
        temperature: input.temperature,
        max_output_tokens: input.max_output_tokens,
        reasoning,
        timeout_ms: input.timeout_ms.unwrap_or(30_000),
    };
    let reasoning_config_json =
        serde_json::to_string(&request.reasoning).unwrap_or_else(|_| "{}".to_string());
    // Diagnostics body for the Inspector (also attached to chat-error).
    // Contains no secrets: auth travels in headers, never in this JSON.
    let (diag_url, diag_body) = if is_anthropic {
        let url = format!(
            "{}/messages",
            provider_anthropic::normalize_anthropic_base_url(&row.base_url)
        );
        let body = provider_anthropic::build_anthropic_body(&request)
            .unwrap_or(serde_json::Value::Null);
        (url, body)
    } else {
        let url = format!(
            "{}/chat/completions",
            provider_openai::normalize_base_url(&row.base_url)
        );
        let body = provider_openai::build_chat_body(
            &request,
            effort.clone(),
            caps.supports_temperature,
        )
        .unwrap_or(serde_json::Value::Null);
        (url, body)
    };

    // Persist the user message first (linear history, MVP-0).
    let now = now_rfc3339();
    let user_message = MessageRow {
        id: uuid::Uuid::new_v4().to_string(),
        conversation_id: input.conversation_id.clone(),
        parent_message_id: None,
        role: "user".to_string(),
        content_json: serde_json::to_string(&input.messages.last()).unwrap_or_default(),
        raw_provider_data_json: None,
        provider_id: Some(row.id.clone()),
        model_id: Some(input.model.clone()),
        reasoning_config_json: Some(reasoning_config_json.clone()),
        usage_json: None,
        duration_ms: None,
        ttft_ms: None,
        finish_reason: None,
        status: "done".to_string(),
        created_at: now,
    };
    state.db.insert_message(&user_message)?;

    let app_clone = app.clone();
    let db = state.db.clone();
    let stream_id_clone = stream_id.clone();
    let conversation_id = input.conversation_id.clone();
    let provider_id = row.id.clone();
    let model = input.model.clone();
    let base_url = row.base_url.clone();
    let supports_temperature = caps.supports_temperature;
    let origin_window = input.origin_window.clone();

    tokio::spawn(async move {
        let started = Instant::now();
        let mut cancel_rx = cancel_rx;
        let result = if is_anthropic {
            let timeout = request.timeout_ms;
            tokio::select! {
                res = provider_anthropic::stream_anthropic_chat(&base_url, &api_key, &request, timeout) => res.map_err(IpcError::from),
                _ = cancel_rx.changed() => Err(IpcError { code : "cancelled".to_string(), message : "stream cancelled by user".to_string() }),
            }
        } else {
            tokio::select! {
                res = provider_openai::stream_chat(&base_url, &api_key, &request, supports_temperature) => res.map_err(IpcError::from),
                _ = cancel_rx.changed() => Err(IpcError { code : "cancelled".to_string(), message : "stream cancelled by user".to_string() }),
            }
        };
        match result {
            Ok(stream) => {
                let duration_ms = started.elapsed().as_millis() as i64;
                let message_id = uuid::Uuid::new_v4().to_string();
                let now = now_rfc3339();
                let _ = db.insert_message(&MessageRow {
                    id: message_id.clone(),
                    conversation_id: conversation_id.clone(),
                    parent_message_id: None,
                    role: "assistant".to_string(),
                    content_json: serde_json::to_string(&stream.text).unwrap_or_default(),
                    raw_provider_data_json: Some(
                        serde_json::json!({
                            "request_url": stream.request_url,
                            "request_body": stream.request_body,
                            "status_code": stream.status_code,
                        })
                        .to_string(),
                    ),
                    provider_id: Some(provider_id.clone()),
                    model_id: Some(model.clone()),
                    reasoning_config_json: Some(reasoning_config_json.clone()),
                    usage_json: stream.usage.as_ref().map(|u| u.to_string()),
                    duration_ms: Some(duration_ms),
                    ttft_ms: stream.ttft_ms,
                    finish_reason: stream.finish_reason.clone(),
                    status: "done".to_string(),
                    created_at: now.clone(),
                });
                let _ = db.touch_conversation(&conversation_id, &now);
                let event = ChatDoneEvent {
                    stream_id: stream_id_clone.clone(),
                    conversation_id: conversation_id.clone(),
                    message_id,
                    text: stream.text,
                    finish_reason: stream.finish_reason,
                    usage: stream.usage,
                    duration_ms,
                    ttft_ms: stream.ttft_ms,
                    model,
                    request_url: stream.request_url,
                    status_code: stream.status_code,
                    created_at: now.clone(),
                };
                if let Some(ref label) = origin_window {
                    let _ = app_clone.emit_to(label, "chat-done", event);
                } else {
                    let _ = app_clone.emit("chat-done", event);
                }
            }
            Err(err) => {
                if err.code == "cancelled" {
                    let now = now_rfc3339();
                    let _ = db.insert_message(&MessageRow {
                        id: uuid::Uuid::new_v4().to_string(),
                        conversation_id: conversation_id.clone(),
                        parent_message_id: None,
                        role: "assistant".to_string(),
                        content_json: "\"\"".to_string(),
                        raw_provider_data_json: None,
                        provider_id: Some(provider_id.clone()),
                        model_id: Some(model.clone()),
                        reasoning_config_json: Some(reasoning_config_json.clone()),
                        usage_json: None,
                        duration_ms: Some(started.elapsed().as_millis() as i64),
                        ttft_ms: None,
                        finish_reason: None,
                        status: "cancelled".to_string(),
                        created_at: now,
                    });
                }
                let (diag_url, diag_body) = (diag_url.clone(), diag_body.clone());
                if let Some(ref label) = origin_window {
                    emit_error_to(
                        &app_clone,
                        label,
                        &stream_id_clone,
                        &conversation_id,
                        err,
                        Some((diag_url, diag_body)),
                    )
                    .await;
                } else {
                    emit_error(
                        &app_clone,
                        &stream_id_clone,
                        &conversation_id,
                        err,
                        Some((diag_url, diag_body)),
                    )
                    .await;
                }
            }
        }
    });

    Ok(stream_id)
}

#[tauri::command]
pub async fn cancel_stream(
    state: State<'_, AppState>,
    stream_id: String,
) -> Result<(), IpcError> {
    let senders = state.streams.lock().expect("streams mutex poisoned");
    if let Some(tx) = senders.get(&stream_id) {
        let _ = tx.send(true);
    }
    Ok(())
}

/// Open the WebView DevTools for the calling window.
///
/// MVP debugging aid: the desktop window has no default DevTools shortcut,
/// so this command is wired to an in-app button and the F12 key.
/// Only available in debug builds (`debug_assertions`); no-op in release.
#[tauri::command]
pub async fn open_devtools(window: tauri::Webview) -> Result<(), IpcError> {
    #[cfg(debug_assertions)]
    window.open_devtools();
    #[cfg(not(debug_assertions))]
    let _ = window;
    Ok(())
}

/// Open (or focus) the read-only Inspector window.
///
/// If the window already exists, it is shown and focused. Otherwise a new
/// window is created with the `#/inspector` hash route.
#[tauri::command]
pub async fn open_inspector_window(app: AppHandle) -> Result<(), IpcError> {
    use tauri::WebviewWindowBuilder;
    use tauri::WebviewUrl;
    if let Some(win) = app.get_webview_window("inspector") {
        let _ = win.show();
        let _ = win.set_focus();
    } else {
        WebviewWindowBuilder::new(
            &app,
            "inspector",
            WebviewUrl::App("/index.html#/inspector".into()),
        )
        .title("Inspector")
        .inner_size(600.0, 800.0)
        .build()
        .map_err(|e| IpcError {
            code: "validation".to_string(),
            message: format!("failed to create inspector window: {e}"),
        })?;
    }
    Ok(())
}

/// Hide the Inspector window (state is preserved for next open).
#[tauri::command]
pub async fn close_inspector_window(app: AppHandle) -> Result<(), IpcError> {
    if let Some(win) = app.get_webview_window("inspector") {
        let _ = win.hide();
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// App info (About dialog)
// ---------------------------------------------------------------------------

/// Build/metadata payload rendered by the About dialog.
///
/// `version` is the semantic version from `Cargo.toml` (`CARGO_PKG_VERSION`)
/// at compile time; `build_number` is the git commit count baked in by
/// `build.rs` (fallback `"0"` when git metadata is unavailable).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppInfo {
    pub name: String,
    pub version: String,
    pub build_number: String,
    pub git_sha: String,
    /// Epoch seconds (see `build.rs`: no date crate in build-dependencies);
    /// `"unknown"` when the timestamp could not be read.
    pub build_time: String,
    pub tauri_version: String,
}

/// Return the app name plus the version/build metadata baked in at build time.
///
/// Never returns an error in practice (every source has a fallback); the
/// `Result` exists so the frontend can keep its `formatIpcError` contract.
#[tauri::command]
pub async fn get_app_info() -> Result<AppInfo, IpcError> {
    Ok(AppInfo {
        name: "Inference Chat Studio".to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
        build_number: option_env!("ICS_BUILD_NUMBER")
            .unwrap_or("0")
            .to_string(),
        git_sha: option_env!("ICS_GIT_SHA").unwrap_or("unknown").to_string(),
        build_time: option_env!("ICS_BUILD_TIME").unwrap_or("unknown").to_string(),
        tauri_version: tauri::VERSION.to_string(),
    })
}

// Re-export for the app handle wiring in main.rs.
#[allow(unused_imports)]
pub use tauri as _tauri_reexport;

#[cfg(test)]
mod tests {
    use super::*;

    fn test_state() -> AppState {
        let db = Db::connect_in_memory().expect("db");
        AppState {
            db: Arc::new(db),
            secrets: SecretBackend::in_memory_for_tests(),
            streams: Mutex::new(HashMap::new()),
        }
    }

    #[test]
    fn base_url_validation_rejects_non_http() {
        assert!(validate_base_url("ftp://x").is_err());
        assert!(validate_base_url("  https://api.example.com/v1/  ").is_ok());
    }

    #[test]
    fn missing_credential_maps_to_unauthorized() {
        let state = test_state();
        let err = load_api_key(&state, None).expect_err("must fail");
        assert_eq!(err.code, "unauthorized");
    }

    #[test]
    fn header_masking_redacts_authorization() {
        let mut map = serde_json::Map::new();
        map.insert(
            "Authorization".to_string(),
            serde_json::Value::String("Bearer secret".to_string()),
        );
        map.insert(
            "Content-Type".to_string(),
            serde_json::Value::String("application/json".to_string()),
        );
        let masked = mask_headers(&map);
        assert_eq!(masked["Authorization"], "[REDACTED]");
        assert_eq!(masked["Content-Type"], "application/json");
    }

    #[tokio::test]
    async fn app_info_version_is_semver() {
        let info = get_app_info().await.expect("app info");
        assert!(!info.name.is_empty());
        let parts: Vec<&str> = info.version.split('.').collect();
        assert_eq!(parts.len(), 3, "version must be major.minor.patch");
        assert!(
            parts
                .iter()
                .all(|p| !p.is_empty() && p.chars().all(|c| c.is_ascii_digit())),
            "every semver part must be numeric"
        );
        assert!(
            info.build_number == "0" || info.build_number.chars().all(|c| c.is_ascii_digit()),
            "build_number must be numeric or the \"0\" fallback"
        );
    }

    fn provider_row(id: &str) -> ProviderRow {
        ProviderRow {
            id: id.to_string(),
            name: format!("Provider {id}"),
            compatibility_type: "openai".to_string(),
            api_mode: "chat_completions".to_string(),
            base_url: "https://api.example.com/v1".to_string(),
            credential_reference: Some("keyring:test".to_string()),
            additional_headers_json: None,
            default_model_id: None,
            enabled: true,
            created_at: "2026-01-01T00:00:00.000Z".to_string(),
            updated_at: "2026-01-01T00:00:00.000Z".to_string(),
        }
    }

    fn model_row(id: &str, provider_id: &str) -> ModelRow {
        ModelRow {
            id: id.to_string(),
            provider_id: provider_id.to_string(),
            remote_model_id: format!("model-{id}"),
            display_name: Some(format!("Model {id}")),
            capabilities_json: Some("{}".to_string()),
            manually_added: true,
            available: true,
            first_seen_at: "2026-01-01T00:00:00.000Z".to_string(),
            last_seen_at: "2026-01-01T00:00:00.000Z".to_string(),
        }
    }

    fn conversation_row(id: &str) -> ConversationRow {
        ConversationRow {
            id: id.to_string(),
            title: format!("Chat {id}"),
            provider_id: Some("p-seed".to_string()),
            default_model_id: None,
            system_prompt: None,
            settings_json: None,
            pinned: false,
            archived: false,
            folder_id: None,
            created_at: "2026-01-01T00:00:00.000Z".to_string(),
            updated_at: "2026-01-01T00:00:01.000Z".to_string(),
        }
    }

    fn message_row(id: &str, conversation_id: &str, content: &str) -> MessageRow {
        MessageRow {
            id: id.to_string(),
            conversation_id: conversation_id.to_string(),
            parent_message_id: None,
            role: if id.ends_with("-assistant") {
                "assistant".to_string()
            } else {
                "user".to_string()
            },
            content_json: serde_json::to_string(content).unwrap_or_default(),
            raw_provider_data_json: None,
            provider_id: Some("p-seed".to_string()),
            model_id: Some("model-1".to_string()),
            reasoning_config_json: None,
            usage_json: None,
            duration_ms: None,
            ttft_ms: None,
            finish_reason: None,
            status: "done".to_string(),
            created_at: "2026-01-01T00:00:00.000Z".to_string(),
        }
    }

    fn bookmark_row(id: &str, conversation_id: &str, message_id: &str) -> BookmarkRow {
        BookmarkRow {
            id: id.to_string(),
            conversation_id: conversation_id.to_string(),
            message_id: message_id.to_string(),
            label: format!("Label {id}"),
            anchor_text: "anchor".to_string(),
            created_at: "2026-01-01T00:00:00.000Z".to_string(),
        }
    }

    fn seed_db(db: &Db) {
        db.insert_provider(&provider_row("p-seed")).expect("provider");
        db.upsert_model(&model_row("m-seed", "p-seed")).expect("model");
        db.insert_conversation(&conversation_row("c-seed")).expect("conversation");
        db.insert_message(&message_row("msg-seed-user", "c-seed", "hi"))
            .expect("message");
        db.insert_bookmark(&bookmark_row("b-seed", "c-seed", "msg-seed-user"))
            .expect("bookmark");
    }

    #[test]
    fn export_backup_excludes_secrets() {
        let db = Db::connect_in_memory().expect("db");
        seed_db(&db);
        let backup = backup_from_db(&db).expect("backup");
        assert_eq!(backup.format, BACKUP_FORMAT);
        assert_eq!(backup.version, BACKUP_VERSION);
        assert_eq!(backup.providers.len(), 1);
        assert_eq!(backup.models.len(), 1);
        assert_eq!(backup.conversations.len(), 1);
        assert_eq!(backup.conversations[0].messages.len(), 1);
        assert_eq!(backup.conversations[0].bookmarks.len(), 1);
        let json = serde_json::to_string(&backup).expect("json");
        assert!(!json.contains("keyring"), "credential reference leaked");
        assert!(!json.contains("credential_reference"), "secret field leaked");
        assert!(!json.contains("api_key"), "secret field leaked");
    }

    #[test]
    fn export_backup_on_empty_db_returns_empty_arrays() {
        let db = Db::connect_in_memory().expect("db");
        let backup = backup_from_db(&db).expect("backup");
        assert!(backup.providers.is_empty());
        assert!(backup.models.is_empty());
        assert!(backup.conversations.is_empty());
    }

    fn sample_backup() -> BackupFile {
        BackupFile {
            format: BACKUP_FORMAT.to_string(),
            version: BACKUP_VERSION,
            exported_at: "2026-01-01T00:00:00.000Z".to_string(),
            app_version: "0.1.0".to_string(),
            providers: vec![BackupProvider {
                id: "old-p".to_string(),
                name: "Imported".to_string(),
                base_url: "https://imported.example.com/v1".to_string(),
                compatibility_type: "openai".to_string(),
                api_mode: "chat_completions".to_string(),
                additional_headers_json: None,
                default_model_id: None,
                enabled: true,
                created_at: "2026-01-01T00:00:00.000Z".to_string(),
                updated_at: "2026-01-01T00:00:01.000Z".to_string(),
            }],
            models: vec![model_row("old-m", "old-p")],
            conversations: vec![BackupConversation {
                conversation: conversation_row("old-c"),
                messages: vec![
                    message_row("old-msg-user", "old-c", "hi"),
                    message_row("old-msg-assistant", "old-c", "yo"),
                ],
                bookmarks: vec![bookmark_row("old-b", "old-c", "old-msg-user")],
                folder_id: None,
                tag_ids: vec![],
            }],
            folders: vec![],
            tags: vec![],
        }
    }

    #[test]
    fn import_backup_merges_with_new_ids() {
        let db = Db::connect_in_memory().expect("db");
        seed_db(&db);
        let summary = import_backup_file(&db, &sample_backup()).expect("import");
        assert_eq!(summary.providers, 1);
        assert_eq!(summary.models, 1);
        assert_eq!(summary.conversations, 1);
        assert_eq!(summary.messages, 2);
        assert_eq!(summary.bookmarks, 1);

        let providers = db.list_providers().expect("providers");
        assert_eq!(providers.len(), 2, "existing provider must survive");
        let imported = providers
            .iter()
            .find(|p| p.name == "Imported")
            .expect("imported provider");
        assert_ne!(imported.id, "old-p", "ids must be regenerated");
        assert!(imported.credential_reference.is_none(), "secret must stay empty");

        let conversations = db.list_conversations().expect("conversations");
        assert_eq!(conversations.len(), 2, "existing conversation must survive");
        let imported_conversation = conversations
            .iter()
            .find(|c| c.title == "Chat old-c")
            .expect("imported conversation");
        let conversation_id = imported_conversation.id.clone();
        assert_ne!(
            conversations[0].provider_id.as_deref(),
            Some("old-p"),
            "conversation must point at the new provider id"
        );
        let messages = db
            .list_messages_by_conversation(&conversation_id)
            .expect("messages");
        assert_eq!(messages.len(), 2);
        assert_eq!(messages[0].content_json, "\"hi\"");
        assert_eq!(messages[1].content_json, "\"yo\"");
        let bookmarks = db
            .list_bookmarks_by_conversation(&conversation_id)
            .expect("bookmarks");
        assert_eq!(bookmarks.len(), 1);
        assert!(
            messages.iter().any(|m| m.id == bookmarks[0].message_id),
            "bookmark must point at an imported message id"
        );
    }

    #[test]
    fn import_backup_rejects_bad_format() {
        let db = Db::connect_in_memory().expect("db");
        let mut backup = sample_backup();
        backup.format = "other".to_string();
        let err = import_backup_file(&db, &backup).expect_err("must reject");
        assert_eq!(err.code, "validation");
        assert!(err.message.contains("unsupported backup format"));
        assert_eq!(db.list_providers().expect("providers").len(), 0);
    }

    #[test]
    fn import_backup_rejects_unsupported_version() {
        let db = Db::connect_in_memory().expect("db");
        let mut backup = sample_backup();
        backup.version = 3;
        let err = import_backup_file(&db, &backup).expect_err("must reject");
        assert_eq!(err.code, "validation");
        assert!(err.message.contains("unsupported backup version"));
    }

    #[test]
    fn import_backup_skips_dangling_bookmark() {
        let db = Db::connect_in_memory().expect("db");
        let mut backup = sample_backup();
        backup.conversations[0].bookmarks[0].message_id = "missing".to_string();
        let summary = import_backup_file(&db, &backup).expect("import");
        assert_eq!(summary.messages, 2);
        assert_eq!(summary.bookmarks, 0, "dangling bookmark must be skipped");
        let rows = db
            .list_bookmarks_by_conversation(
                &db.list_conversations().expect("conversations")[0].id,
            )
            .expect("bookmarks");
        assert!(rows.is_empty());
    }

    #[test]
    fn import_backup_skips_unsupported_provider_without_failing() {
        let db = Db::connect_in_memory().expect("db");
        let mut backup = sample_backup();
        backup.providers[0].api_mode = "responses".to_string();
        let summary = import_backup_file(&db, &backup).expect("import");
        assert_eq!(summary.providers, 0);
        assert_eq!(summary.models, 0, "model of a skipped provider must be skipped");
        assert_eq!(summary.conversations, 1, "history must still import");
        assert_eq!(summary.messages, 2);
    }
}
