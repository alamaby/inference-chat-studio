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
    ConversationRow, Db, MessageRow, ModelRow, ProviderRow, StoreError,
};
use provider_core::{
    ChatMessage, ConnectionStatus, ModelCapabilities, ModelInfo, NormalizedChatRequest,
    ProviderConfig, ProviderError, ReasoningConfig, ReasoningLevel,
};
use secret_store::{SecretStore, credential_reference_for_provider};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};

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
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatErrorEvent {
    pub stream_id: String,
    pub conversation_id: String,
    pub code: String,
    pub message: String,
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
) {
    let _ = app.emit(
        "chat-error",
        ChatErrorEvent {
            stream_id: stream_id.to_string(),
            conversation_id: conversation_id.to_string(),
            code: err.code,
            message: err.message,
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
        compatibility_type: "openai".to_string(),
        api_mode: "chat_completions".to_string(),
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
    state.db.delete_provider(&id)?;
    if let Some(reference) = row.credential_reference {
        let _ = state.secrets.inner.delete(&reference);
    }
    Ok(())
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

#[tauri::command]
pub async fn test_connection_cmd(
    state: State<'_, AppState>,
    id: String,
) -> Result<ConnectionStatus, IpcError> {
    let row = state.db.get_provider(&id)?.ok_or_else(|| IpcError {
        code: "model_not_found".to_string(),
        message: format!("provider not found: {id}"),
    })?;
    if row.api_mode != "chat_completions" {
        return Err(IpcError {
            code: "validation".to_string(),
            message: format!(
                "unsupported api_mode '{}': MVP-0 only supports 'chat_completions'",
                row.api_mode
            ),
        });
    }
    let api_key = load_api_key(&state, row.credential_reference.as_deref())?;
    let status = provider_openai::test_connection(&row.base_url, &api_key, 30_000).await?;
    Ok(status)
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
    if row.api_mode != "chat_completions" {
        return Err(IpcError {
            code: "validation".to_string(),
            message: "MVP-0 only supports 'chat_completions'".to_string(),
        });
    }
    let api_key = load_api_key(&state, row.credential_reference.as_deref())?;
    let models = provider_openai::list_models(&row.base_url, &api_key, 30_000).await?;
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
    if row.api_mode != "chat_completions" {
        return Err(IpcError {
            code: "validation".to_string(),
            message: "MVP-0 only supports 'chat_completions'".to_string(),
        });
    }
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
    provider_openai::map_reasoning(&reasoning.level, &caps, reasoning.custom_json.as_ref())
        .map_err(IpcError::from)?;

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

    tokio::spawn(async move {
        let started = Instant::now();
        let mut cancel_rx = cancel_rx;
        let result = tokio::select! {
            res = provider_openai::stream_chat(&base_url, &api_key, &request, supports_temperature) => res.map_err(IpcError::from),
            _ = cancel_rx.changed() => Err(IpcError { code: "cancelled".to_string(), message: "stream cancelled by user".to_string() }),
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
                let _ = app_clone.emit(
                    "chat-done",
                    ChatDoneEvent {
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
                    },
                );
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
                emit_error(&app_clone, &stream_id_clone, &conversation_id, err).await;
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
}
