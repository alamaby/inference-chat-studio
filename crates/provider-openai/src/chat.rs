use provider_core::{ChatMessage, NormalizedChatRequest, ProviderError};
use serde::{Deserialize, Serialize};
use std::time::Duration;

use crate::models::normalize_base_url;
use crate::reasoning_map::wire_value;

/// A single normalized stream event emitted to the frontend.
#[derive(Debug, Clone, PartialEq)]
pub struct StreamChunk {
    pub delta: String,
    pub finish_reason: Option<String>,
}

/// Final result of a streaming chat request.
#[derive(Debug, Clone, PartialEq)]
pub struct StreamResult {
    pub text: String,
    pub finish_reason: Option<String>,
    pub usage: Option<serde_json::Value>,
    pub request_url: String,
    pub request_body: serde_json::Value,
    pub status_code: u16,
    /// Milliseconds from request send to the first content delta.
    /// `None` when the stream produced no content (e.g. immediate `[DONE]`).
    pub ttft_ms: Option<i64>,
}

/// Build the exact JSON body sent to `POST /chat/completions`.
///
/// Only `Some` fields are included — compatible servers often reject
/// explicit `null`s — via `skip_serializing_if`.
pub fn build_chat_body(
    req: &NormalizedChatRequest,
    reasoning_effort: Option<String>,
    supports_temperature: bool,
) -> Result<serde_json::Value, ProviderError> {
    let mut messages: Vec<ChatMessage> = Vec::with_capacity(req.messages.len() + 1);
    if let Some(system) = req.system_prompt.as_deref().filter(|s| !s.trim().is_empty()) {
        messages.push(ChatMessage {
            role: "system".to_string(),
            content: system.to_string(),
        });
    }
    messages.extend(req.messages.iter().cloned());

    #[derive(Serialize)]
    struct Body<'a> {
        model: &'a str,
        messages: &'a [ChatMessage],
        stream: bool,
        #[serde(skip_serializing_if = "Option::is_none")]
        temperature: Option<f32>,
        #[serde(skip_serializing_if = "Option::is_none")]
        max_tokens: Option<u32>,
        #[serde(skip_serializing_if = "Option::is_none")]
        reasoning_effort: Option<String>,
    }

    let body = Body {
        model: &req.model,
        messages: &messages,
        stream: true,
        temperature: if supports_temperature {
            req.temperature
        } else {
            None
        },
        max_tokens: req.max_output_tokens,
        reasoning_effort,
    };
    serde_json::to_value(&body).map_err(|e| ProviderError::Validation(e.to_string()))
}

/// Resolve the reasoning wire value leniently.
///
/// `Automatic`/`None` omit the field. `Custom` passes through from
/// `custom_json`. Concrete levels map via [`wire_value`].
/// Full allowlist enforcement happens in the IPC layer with the real model
/// capabilities, so manual models are not blocked at the adapter boundary.
fn map_reasoning_lenient(req: &NormalizedChatRequest) -> Result<Option<String>, ProviderError> {
    req.reasoning.validate()?;
    match req.reasoning.level {
        provider_core::ReasoningLevel::Automatic | provider_core::ReasoningLevel::None => Ok(None),
        provider_core::ReasoningLevel::Custom => match req.reasoning.custom_json.as_ref() {
            Some(serde_json::Value::String(s)) => Ok(Some(s.clone())),
            Some(serde_json::Value::Object(map)) => match map.get("reasoning_effort") {
                Some(serde_json::Value::String(s)) => Ok(Some(s.clone())),
                Some(other) => Ok(Some(other.to_string())),
                None => Err(ProviderError::Validation(
                    "custom reasoning object must contain 'reasoning_effort'".to_string(),
                )),
            },
            _ => Err(ProviderError::Validation(
                "custom reasoning requires custom_json".to_string(),
            )),
        },
        level => Ok(wire_value(level).map(str::to_string)),
    }
}

/// Stream a chat completion, collecting deltas.
///
/// `supports_temperature` comes from the model's capability preset: when
/// false (e.g. reasoning families), temperature is omitted with a warning
/// instead of an error.
///
/// NOTE: `api_mode` enforcement (`chat_completions` only in MVP-0) lives in
/// the IPC layer where the provider row is available. This adapter only
/// speaks Chat Completions by construction.
///
/// The real API key is sent in exactly one request. It is never logged;
/// only the literal `[REDACTED]` placeholder appears in diagnostics.
pub async fn stream_chat(
    base_url: &str,
    api_key: &str,
    req: &NormalizedChatRequest,
    supports_temperature: bool,
) -> Result<StreamResult, ProviderError> {
    let base = normalize_base_url(base_url);
    let url = format!("{base}/chat/completions");
    let effort = map_reasoning_lenient(req)?;
    let body = build_chat_body(req, effort, supports_temperature)?;

    let client = reqwest::Client::builder()
        .timeout(Duration::from_millis(req.timeout_ms.max(1_000)))
        .build()
        .map_err(|e| ProviderError::Network(e.to_string()))?;

    let started = std::time::Instant::now();
    let response = client
        .post(&url)
        .header("Authorization", format!("Bearer {api_key}"))
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| {
            if e.is_timeout() {
                ProviderError::Timeout
            } else {
                ProviderError::Network(e.to_string())
            }
        })?;

    let status_code = response.status().as_u16();
    if status_code == 401 || status_code == 403 {
        return Err(ProviderError::Unauthorized(format!(
            "POST /chat/completions returned {status_code}"
        )));
    }
    if status_code == 404 {
        // Body intentionally dropped: it can echo the model id back, and the
        // caller already knows it. Never include header values in errors.
        return Err(ProviderError::ModelNotFound(req.model.clone()));
    }
    if !(200..300).contains(&status_code) {
        let text = response.text().await.unwrap_or_default();
        return Err(ProviderError::InvalidResponse(truncate(&text, 2048)));
    }

    let mut result = parse_sse_stream(response, url, body, started).await?;
    result.status_code = status_code;
    Ok(result)
}

#[derive(Debug, Deserialize)]
struct SseChoice {
    #[serde(default)]
    delta: SseDelta,
    #[serde(default)]
    finish_reason: Option<String>,
}

#[derive(Debug, Default, Deserialize)]
struct SseDelta {
    #[serde(default)]
    content: Option<String>,
}

#[derive(Debug, Deserialize)]
struct SseEvent {
    #[serde(default)]
    choices: Vec<SseChoice>,
    #[serde(default)]
    usage: Option<serde_json::Value>,
}

async fn parse_sse_stream(
    response: reqwest::Response,
    url: String,
    body: serde_json::Value,
    started: std::time::Instant,
) -> Result<StreamResult, ProviderError> {
    use futures_util::StreamExt as _;

    let mut text = String::new();
    let mut finish_reason: Option<String> = None;
    let mut usage: Option<serde_json::Value> = None;
    let mut ttft_ms: Option<i64> = None;
    let mut buffer = String::new();
    let mut stream = response.bytes_stream();

    while let Some(item) = stream.next().await {
        let bytes = item.map_err(|e| ProviderError::StreamInterrupted(e.to_string()))?;
        buffer.push_str(&String::from_utf8_lossy(&bytes));
        while let Some(pos) = buffer.find('\n') {
            let line: String = buffer.drain(..=pos).collect();
            let line = line.trim();
            let Some(payload) = line.strip_prefix("data:") else {
                continue;
            };
            let payload = payload.trim();
            if payload == "[DONE]" {
                return Ok(StreamResult {
                    text,
                    finish_reason,
                    usage,
                    request_url: url,
                    request_body: body,
                    status_code: 200,
                    ttft_ms,
                });
            }
            if payload.is_empty() {
                continue;
            }
            let event: SseEvent = serde_json::from_str(payload).map_err(|e| {
                ProviderError::InvalidResponse(format!("invalid SSE event JSON: {e}"))
            })?;
            if let Some(choice) = event.choices.into_iter().next() {
                if let Some(delta) = choice.delta.content {
                    if ttft_ms.is_none() && !delta.is_empty() {
                        ttft_ms = Some(started.elapsed().as_millis() as i64);
                    }
                    text.push_str(&delta);
                }
                if choice.finish_reason.is_some() {
                    finish_reason = choice.finish_reason;
                }
            }
            if event.usage.is_some() {
                usage = event.usage;
            }
        }
    }
    Err(ProviderError::StreamInterrupted(
        "stream ended without data: [DONE]".to_string(),
    ))
}

fn truncate(s: &str, max: usize) -> String {
    if s.len() <= max {
        s.to_string()
    } else {
        format!("{}…[truncated]", &s[..max])
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use provider_core::{NormalizedChatRequest, ReasoningConfig, ReasoningLevel};
    use wiremock::matchers::{header, method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    fn req(level: ReasoningLevel) -> NormalizedChatRequest {
        NormalizedChatRequest {
            model: "m1".to_string(),
            system_prompt: None,
            messages: vec![ChatMessage {
                role: "user".to_string(),
                content: "hi".to_string(),
            }],
            temperature: None,
            max_output_tokens: None,
            reasoning: ReasoningConfig {
                level,
                custom_json: None,
            },
            timeout_ms: 5_000,
        }
    }

    #[test]
    fn body_omits_none_fields_and_includes_system() {
        let mut r = req(ReasoningLevel::None);
        r.system_prompt = Some("sys".to_string());
        let body = build_chat_body(&r, None, true).expect("body");
        assert!(!body.to_string().contains("null"));
        assert_eq!(body["messages"][0]["role"], "system");
        assert!(body.get("reasoning_effort").is_none());
    }

    #[test]
    fn body_drops_temperature_when_unsupported() {
        let mut r = req(ReasoningLevel::High);
        r.temperature = Some(0.7);
        let body = build_chat_body(&r, Some("high".to_string()), false).expect("body");
        assert!(body.get("temperature").is_none());
        assert_eq!(body["reasoning_effort"], "high");
    }

    #[tokio::test]
    async fn streams_two_chunks_until_done() {
        let server = MockServer::start().await;
        let sse = "data: {\"choices\":[{\"delta\":{\"content\":\"Hello \"}}]}\n\ndata: {\"choices\":[{\"delta\":{\"content\":\"world\"},\"finish_reason\":\"stop\"}]}\n\ndata: [DONE]\n\n";
        Mock::given(method("POST"))
            .and(path("/v1/chat/completions"))
            .and(header("Authorization", "Bearer k"))
            .respond_with(
                ResponseTemplate::new(200)
                    .insert_header("content-type", "text/event-stream")
                    .set_body_string(sse),
            )
            .mount(&server)
            .await;
        let result = stream_chat(
            &format!("{}/v1", server.uri()),
            "k",
            &req(ReasoningLevel::None),
            true,
        )
        .await
        .expect("stream");
        assert_eq!(result.text, "Hello world");
        assert_eq!(result.finish_reason.as_deref(), Some("stop"));
        // TTFT is measured to the first content delta and can never exceed
        // the (mock-instant) total; on real networks it is strictly smaller.
        let ttft = result.ttft_ms.expect("ttft must be measured");
        assert!(ttft >= 0);
    }
}
