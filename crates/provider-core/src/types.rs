use serde::{Deserialize, Serialize};

use crate::reasoning::ReasoningConfig;

/// Static provider configuration (no secrets; only a credential reference).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ProviderConfig {
    pub id: String,
    pub name: String,
    pub compatibility_type: String,
    pub api_mode: String,
    pub base_url: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub credential_reference: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub additional_headers_json: Option<String>,
    pub timeout_ms: u64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ModelCapabilities {
    pub supports_streaming: bool,
    pub supports_reasoning: bool,
    pub allowed_reasoning: Vec<crate::reasoning::ReasoningLevel>,
    pub supports_temperature: bool,
    pub supports_system_prompt: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max_output_tokens: Option<u32>,
}

impl Default for ModelCapabilities {
    fn default() -> Self {
        Self {
            supports_streaming: true,
            supports_reasoning: false,
            allowed_reasoning: Vec::new(),
            supports_temperature: true,
            supports_system_prompt: true,
            max_output_tokens: None,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ModelInfo {
    pub remote_model_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub display_name: Option<String>,
    pub capabilities: ModelCapabilities,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct NormalizedChatRequest {
    pub model: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub system_prompt: Option<String>,
    pub messages: Vec<ChatMessage>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub temperature: Option<f32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max_output_tokens: Option<u32>,
    pub reasoning: ReasoningConfig,
    pub timeout_ms: u64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ConnectionStatus {
    Connected,
    ConnectionFailed,
    Unauthorized,
    Timeout,
    InvalidResponse,
    NotTested,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn none_options_are_skipped_in_json() {
        let req = NormalizedChatRequest {
            model: "m".to_string(),
            system_prompt: None,
            messages: vec![ChatMessage {
                role: "user".to_string(),
                content: "hi".to_string(),
            }],
            temperature: None,
            max_output_tokens: None,
            reasoning: ReasoningConfig {
                level: crate::reasoning::ReasoningLevel::None,
                custom_json: None,
            },
            timeout_ms: 30_000,
        };
        let json = serde_json::to_string(&req).expect("serialize");
        assert!(!json.contains("temperature"));
        assert!(!json.contains("max_output_tokens"));
        assert!(!json.contains("system_prompt"));
        assert!(!json.contains("null"));
    }
}
