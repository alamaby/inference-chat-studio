use provider_core::{
    ConnectionStatus, ModelCapabilities, ModelInfo, ProviderError, ReasoningLevel,
};
use serde::Deserialize;
use std::time::Duration;

/// Normalize a user-entered base URL to the API root.
///
/// - trims whitespace and trailing `/`
/// - strips a trailing `/chat/completions` suffix when present
/// - collapses a duplicated `/v1/v1` suffix
/// - preserves an existing `/v1` suffix
///
/// Unlike `POST /chat/completions`, trailing-slash normalization happens
/// here, not in the DB layer.
pub fn normalize_base_url(raw: &str) -> String {
    let mut url = raw.trim().to_string();
    while url.ends_with('/') && url.len() > 1 {
        url.pop();
    }
    if let Some(stripped) = url.strip_suffix("/chat/completions") {
        url = stripped.to_string();
        while url.ends_with('/') && url.len() > 1 {
            url.pop();
        }
    }
    if let Some(stripped) = url.strip_suffix("/v1/v1") {
        url = format!("{stripped}/v1");
    }
    url
}

#[derive(Debug, Deserialize)]
struct ModelsResponse {
    #[serde(default)]
    data: Vec<ModelEntry>,
}

#[derive(Debug, Deserialize)]
struct ModelEntry {
    id: String,
}

/// Preset capability override. `GET /models` on OpenAI-compatible servers
/// usually returns only `id` — no capability fields — so auto-detection is
/// unreliable (finding F1). Reasoning defaults to off except for known
/// reasoning model families; users can still override via manual models.
fn preset_capabilities(remote_model_id: &str) -> ModelCapabilities {
    let lower = remote_model_id.to_lowercase();
    let reasoning_family = lower.contains("o1")
        || lower.contains("o3")
        || lower.contains("o4")
        || lower.contains("gpt-5")
        || lower.contains("reasoning")
        || lower.contains("deepseek-r1")
        || lower.contains("qwq");
    if reasoning_family {
        ModelCapabilities {
            supports_streaming: true,
            supports_reasoning: true,
            allowed_reasoning: vec![
                ReasoningLevel::Minimal,
                ReasoningLevel::Low,
                ReasoningLevel::Medium,
                ReasoningLevel::High,
                ReasoningLevel::ExtraHigh,
                ReasoningLevel::Maximum,
            ],
            supports_temperature: false,
            supports_system_prompt: true,
            max_output_tokens: None,
        }
    } else {
        ModelCapabilities::default()
    }
}

fn client(timeout_ms: u64) -> Result<reqwest::Client, ProviderError> {
    reqwest::Client::builder()
        .timeout(Duration::from_millis(timeout_ms.max(1_000)))
        .build()
        .map_err(|e| ProviderError::Network(e.to_string()))
}

/// Fetch the model list. Used by both `refresh_models` and `test_connection`
/// so a connection test never spends inference tokens.
pub async fn list_models(
    base_url: &str,
    api_key: &str,
    timeout_ms: u64,
) -> Result<Vec<ModelInfo>, ProviderError> {
    let base = normalize_base_url(base_url);
    let url = format!("{base}/models");
    let response = client(timeout_ms)?
        .get(&url)
        .header("Authorization", format!("Bearer {api_key}"))
        .send()
        .await
        .map_err(map_request_error)?;

    let status = response.status();
    if status == reqwest::StatusCode::UNAUTHORIZED || status == reqwest::StatusCode::FORBIDDEN {
        return Err(ProviderError::Unauthorized(format!(
            "GET /models returned {status}"
        )));
    }
    if status == reqwest::StatusCode::NOT_FOUND {
        return Err(ProviderError::ModelNotFound(format!(
            "GET /models returned 404 at {url}"
        )));
    }
    if !status.is_success() {
        return Err(ProviderError::InvalidResponse(format!(
            "GET /models returned {status}"
        )));
    }
    let body: ModelsResponse = response
        .json()
        .await
        .map_err(|e| ProviderError::InvalidResponse(format!("invalid /models JSON: {e}")))?;
    Ok(body
        .data
        .into_iter()
        .map(|entry| ModelInfo {
            display_name: Some(entry.id.clone()),
            capabilities: preset_capabilities(&entry.id),
            remote_model_id: entry.id,
        })
        .collect())
}

/// Connection test that never triggers inference generation.
pub async fn test_connection(
    base_url: &str,
    api_key: &str,
    timeout_ms: u64,
) -> Result<ConnectionStatus, ProviderError> {
    if normalize_base_url(base_url).is_empty() {
        return Err(ProviderError::Validation(
            "base_url must not be empty".to_string(),
        ));
    }
    match list_models(base_url, api_key, timeout_ms).await {
        Ok(_) => Ok(ConnectionStatus::Connected),
        Err(e) => match e {
            ProviderError::Unauthorized(_) => Ok(ConnectionStatus::Unauthorized),
            ProviderError::Timeout => Ok(ConnectionStatus::Timeout),
            ProviderError::InvalidResponse(_)
            | ProviderError::ModelNotFound(_)
            | ProviderError::Validation(_) => Ok(ConnectionStatus::InvalidResponse),
            ProviderError::Network(msg) if is_timeout_message(&msg) => {
                Ok(ConnectionStatus::Timeout)
            }
            ProviderError::Network(_) => Ok(ConnectionStatus::ConnectionFailed),
            other => Err(other),
        },
    }
}

fn map_request_error(e: reqwest::Error) -> ProviderError {
    if e.is_timeout() {
        ProviderError::Timeout
    } else {
        ProviderError::Network(e.to_string())
    }
}

fn is_timeout_message(msg: &str) -> bool {
    let lower = msg.to_lowercase();
    lower.contains("timed out") || lower.contains("timeout") || lower.contains("deadline")
}

#[cfg(test)]
mod tests {
    use super::*;
    use wiremock::matchers::{header, method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    #[test]
    fn normalize_trims_and_preserves_v1() {
        assert_eq!(
            normalize_base_url("http://127.0.0.1:8000/v1/"),
            "http://127.0.0.1:8000/v1"
        );
        assert_eq!(
            normalize_base_url("https://api.example.com/v1/chat/completions"),
            "https://api.example.com/v1"
        );
        assert_eq!(
            normalize_base_url("https://x.example.com/v1/v1"),
            "https://x.example.com/v1"
        );
        assert_eq!(
            normalize_base_url("https://x.example.com/"),
            "https://x.example.com"
        );
    }

    #[tokio::test]
    async fn list_models_parses_data_array() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/v1/models"))
            .and(header("Authorization", "Bearer k"))
            .respond_with(ResponseTemplate::new(200).set_body_json(
                serde_json::json!({ "data": [{ "id": "m1" }, { "id": "m2" }] }),
            ))
            .mount(&server)
            .await;
        let models = list_models(&format!("{}/v1", server.uri()), "k", 5_000)
            .await
            .expect("list");
        assert_eq!(models.len(), 2);
        assert_eq!(models[0].remote_model_id, "m1");
        assert_eq!(models[1].remote_model_id, "m2");
    }

    #[tokio::test]
    async fn test_connection_maps_401_to_unauthorized() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/models"))
            .respond_with(ResponseTemplate::new(401))
            .mount(&server)
            .await;
        let status = test_connection(&server.uri(), "bad", 5_000)
            .await
            .expect("status");
        assert_eq!(status, ConnectionStatus::Unauthorized);
    }
}
