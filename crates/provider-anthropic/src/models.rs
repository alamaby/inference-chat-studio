use provider_core::{ConnectionStatus, ModelCapabilities, ModelInfo, ProviderError};
use serde::Deserialize;
use std::time::Duration;

/// Normalize a user-entered Anthropic base URL.
///
/// Anthropic's API root is `https://api.anthropic.com/v1`.
/// Trims whitespace and trailing slashes. Does NOT strip `/v1` —
/// the Messages endpoint is always `/v1/messages`.
pub fn normalize_anthropic_base_url(raw : &str) -> String {
    let mut url = raw.trim().to_string();
    while url.ends_with('/') && url.len() > 1 {
        url.pop();
    }
    url
}

#[derive(Debug, Deserialize)]
struct AnthropicModelsResponse {
    #[serde(default)]
    data : Vec<AnthropicModelEntry>,
}

#[derive(Debug, Deserialize)]
struct AnthropicModelEntry {
    id : String,
}

/// Preset capability override for Anthropic models.
///
/// Anthropic's `GET /models` returns only `id` — no capability fields.
/// Reasoning defaults to off except for known Claude model families.
fn preset_capabilities(remote_model_id : &str) -> ModelCapabilities {
    let lower = remote_model_id.to_lowercase();
    let reasoning_family = lower.contains("claude-3-5")
        || lower.contains("claude-3-7")
        || lower.contains("claude-4")
        || lower.contains("claude-sonnet")
        || lower.contains("claude-opus")
        || lower.contains("claude-haiku");
    if reasoning_family {
        ModelCapabilities {
            supports_streaming : true,
            supports_reasoning : true,
            allowed_reasoning : vec![
                provider_core::ReasoningLevel::Minimal,
                provider_core::ReasoningLevel::Low,
                provider_core::ReasoningLevel::Medium,
                provider_core::ReasoningLevel::High,
            ],
            supports_temperature : true,
            supports_system_prompt : true,
            max_output_tokens : None,
        }
    } else {
        ModelCapabilities::default()
    }
}

fn client(timeout_ms : u64) -> Result<reqwest::Client, ProviderError> {
    reqwest::Client::builder()
        .timeout(Duration::from_millis(timeout_ms.max(1_000)))
        .build()
        .map_err(|e| ProviderError::Network(e.to_string()))
}

/// Fetch the Anthropic model list.
pub async fn list_anthropic_models(
    base_url : &str,
    api_key : &str,
    timeout_ms : u64,
) -> Result<Vec<ModelInfo>, ProviderError> {
    let base = normalize_anthropic_base_url(base_url);
    let url = format!("{base}/models");
    let response = client(timeout_ms)?
        .get(&url)
        .header("x-api-key", api_key)
        .header("anthropic-version", "2023-06-01")
        .send()
        .await
        .map_err(map_request_error)?;

    let status = response.status();
    if status == reqwest::StatusCode::UNAUTHORIZED || status == reqwest::StatusCode::FORBIDDEN {
        return Err(ProviderError::Unauthorized(format!(
            "GET /models returned {status}"
        )));
    }
    if !status.is_success() {
        return Err(ProviderError::InvalidResponse(format!(
            "GET /models returned {status}"
        )));
    }
    let body : AnthropicModelsResponse = response
        .json()
        .await
        .map_err(|e| ProviderError::InvalidResponse(format!("invalid /models JSON: {e}")))?;
    Ok(body
        .data
        .into_iter()
        .map(|entry| ModelInfo {
            display_name : Some(entry.id.clone()),
            capabilities : preset_capabilities(&entry.id),
            remote_model_id : entry.id,
        })
        .collect())
}

/// Connection test that never triggers inference generation.
///
/// B1 stub: returns `NotTested` until the real implementation lands in B3.
pub async fn test_anthropic_connection(
    _base_url : &str,
    _api_key : &str,
    _timeout_ms : u64,
) -> Result<ConnectionStatus, ProviderError> {
    Ok(ConnectionStatus::NotTested)
}

fn map_request_error(e : reqwest::Error) -> ProviderError {
    if e.is_timeout() {
        ProviderError::Timeout
    } else {
        ProviderError::Network(e.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_trims_trailing_slash() {
        assert_eq!(
            normalize_anthropic_base_url("https://api.anthropic.com/v1/"),
            "https://api.anthropic.com/v1"
        );
        assert_eq!(
            normalize_anthropic_base_url("  https://api.anthropic.com/v1  "),
            "https://api.anthropic.com/v1"
        );
    }

    #[test]
    fn test_connection_returns_not_tested() {
        // Stub: no network call, just verifies the return type.
        let rt = tokio::runtime::Runtime::new().unwrap();
        let result = rt.block_on(test_anthropic_connection(
            "https://api.anthropic.com/v1",
            "key",
            5000
        ));
        assert_eq!(result.unwrap(), ConnectionStatus::NotTested);
    }
}
