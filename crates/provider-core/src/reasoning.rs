use serde::{Deserialize, Serialize};

use crate::error::ProviderError;

/// Universal reasoning level (UI). The wire value is decided by the adapter
/// (`provider-openai::reasoning_map`). `None` and `Automatic` both mean:
/// do NOT send any reasoning field to the provider.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum ReasoningLevel {
    Automatic,
    None,
    Minimal,
    Low,
    Medium,
    High,
    ExtraHigh,
    Maximum,
    Custom,
}

impl ReasoningLevel {
    pub fn as_str(&self) -> &'static str {
        match self {
            ReasoningLevel::Automatic => "automatic",
            ReasoningLevel::None => "none",
            ReasoningLevel::Minimal => "minimal",
            ReasoningLevel::Low => "low",
            ReasoningLevel::Medium => "medium",
            ReasoningLevel::High => "high",
            ReasoningLevel::ExtraHigh => "xhigh",
            ReasoningLevel::Maximum => "maximum",
            ReasoningLevel::Custom => "custom",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ReasoningConfig {
    pub level: ReasoningLevel,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub custom_json: Option<serde_json::Value>,
}

impl ReasoningConfig {
    /// Whether the adapter must send a reasoning field at all.
    /// `Custom` is validated separately (requires `custom_json`).
    pub fn should_send(&self) -> bool {
        !matches!(self.level, ReasoningLevel::Automatic | ReasoningLevel::None)
    }

    pub fn validate(&self) -> Result<(), ProviderError> {
        if self.level == ReasoningLevel::Custom && self.custom_json.is_none() {
            return Err(ProviderError::Validation(
                "custom reasoning requires custom_json".to_string(),
            ));
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn config(level: ReasoningLevel) -> ReasoningConfig {
        ReasoningConfig {
            level,
            custom_json: None,
        }
    }

    #[test]
    fn custom_without_json_fails_validation() {
        let err = config(ReasoningLevel::Custom)
            .validate()
            .expect_err("must fail");
        assert!(matches!(err, ProviderError::Validation(_)));
    }

    #[test]
    fn none_does_not_send() {
        assert!(!config(ReasoningLevel::None).should_send());
    }

    #[test]
    fn automatic_does_not_send() {
        assert!(!config(ReasoningLevel::Automatic).should_send());
    }

    #[test]
    fn high_sends() {
        assert!(config(ReasoningLevel::High).should_send());
    }
}
