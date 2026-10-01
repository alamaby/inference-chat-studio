use provider_core::{NormalizedChatRequest, ProviderError};
use provider_openai::StreamResult;
use serde_json::Value;

/// Build the Anthropic Messages API request body.
///
/// Anthropic uses a different schema than OpenAI Chat Completions:
/// - `system` is a top-level string, not a message role
/// - `max_tokens` is required (defaults to 1024 when unset)
/// - `temperature` is top-level, omitted when None
/// - messages only contain `user`/`assistant` roles (system is extracted)
pub fn build_anthropic_body(req : &NormalizedChatRequest) -> Result<Value, ProviderError> {
    if req.messages.is_empty() {
        return Err(ProviderError::Validation(
            "messages must not be empty".to_string()
        ));
    }
    let mut messages : Vec<Value> = Vec::new();
    for msg in &req.messages {
        if msg.role == "system" {
            continue;
        }
        messages.push(serde_json::json!({
            "role" : msg.role,
            "content" : msg.content
        }));
    }
    let mut body = serde_json::json!({
        "model" : req.model,
        "max_tokens" : req.max_output_tokens.unwrap_or(1024),
        "messages" : messages
    });
    if let Some(system) = req.system_prompt.as_deref().filter(|s| !s.trim().is_empty()) {
        body["system"] = Value::String(system.to_string());
    }
    if let Some(temp) = req.temperature {
        body["temperature"] = Value::from(temp);
    }
    Ok(body)
}

/// Minimal non-stream POST to Anthropic Messages API, wrapped as StreamResult.
///
/// This is a stub for B1: it does not implement SSE streaming. The full
/// streaming implementation lands in B3 when the IPC layer wires this up.
pub async fn stream_anthropic_chat(
    _base_url : &str,
    _api_key : &str,
    _req : &NormalizedChatRequest,
    _timeout_ms : u64,
) -> Result<StreamResult, ProviderError> {
    Err(ProviderError::Validation(
        "anthropic streaming not yet implemented".to_string()
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use provider_core::ChatMessage;

    fn req_with_messages(messages : Vec<ChatMessage>) -> NormalizedChatRequest {
        NormalizedChatRequest {
            model : "claude-3-5-sonnet-20241022".to_string(),
            system_prompt : Some("hi".to_string()),
            messages,
            temperature : Some(0.7),
            max_output_tokens : None,
            reasoning : provider_core::ReasoningConfig {
                level : provider_core::ReasoningLevel::None,
                custom_json : None
            },
            timeout_ms : 30_000
        }
    }

    #[test]
    fn build_body_maps_system_and_temp() {
        let req = req_with_messages(vec![
            ChatMessage { role : "system".to_string(), content : "x".to_string() },
            ChatMessage { role : "user".to_string(), content : "hello".to_string() }
        ]);
        let body = build_anthropic_body(&req).expect("body");
        assert_eq!(body["model"], "claude-3-5-sonnet-20241022");
        assert_eq!(body["system"], "hi");
        assert_eq!(body["max_tokens"], 1024);
        let temp = body["temperature"].as_f64().expect("temperature as f64");
        assert!((temp - 0.7).abs() < 1e-6);
        let msgs = body["messages"].as_array().expect("messages array");
        assert_eq!(msgs.len(), 1);
        assert_eq!(msgs[0]["role"], "user");
        assert_eq!(msgs[0]["content"], "hello");
    }

    #[test]
    fn build_body_drops_system_role_from_messages() {
        let mut req = req_with_messages(vec![
            ChatMessage { role : "user".to_string(), content : "hi".to_string() },
            ChatMessage { role : "assistant".to_string(), content : "hello".to_string() }
        ]);
        req.system_prompt = None;
        let body = build_anthropic_body(&req).expect("body");
        let msgs = body["messages"].as_array().expect("messages array");
        assert_eq!(msgs.len(), 2);
        assert!(body.get("system").is_none());
    }

    #[test]
    fn build_body_empty_messages_rejects() {
        let req = req_with_messages(vec![]);
        let result = build_anthropic_body(&req);
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(err.to_string().contains("messages must not be empty"));
    }
}
