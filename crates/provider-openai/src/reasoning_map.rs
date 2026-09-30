use provider_core::{ModelCapabilities, ProviderError, ReasoningConfig, ReasoningLevel};
use serde_json::Value;

/// Wire value for a non-custom reasoning level.
/// `Automatic`/`None`/`Custom` resolve to `None` here on purpose:
/// `Automatic` and `None` must omit the field, `Custom` is resolved
/// from `custom_json` by [`map_reasoning`].
pub fn wire_value(level: ReasoningLevel) -> Option<&'static str> {
    match level {
        ReasoningLevel::Automatic | ReasoningLevel::None | ReasoningLevel::Custom => None,
        ReasoningLevel::Minimal => Some("minimal"),
        ReasoningLevel::Low => Some("low"),
        ReasoningLevel::Medium => Some("medium"),
        ReasoningLevel::High => Some("high"),
        // Open question (plan Notes): OpenAI uses `xhigh`; some servers
        // expect `extra_high`. MVP uses `xhigh`; `Custom` is the escape hatch.
        ReasoningLevel::ExtraHigh => Some("xhigh"),
        // Open question (plan Notes): MVP uses `max`; override via `Custom`.
        ReasoningLevel::Maximum => Some("max"),
    }
}

/// Resolve the universal UI level to an OpenAI Chat Completions
/// `reasoning_effort` wire value.
///
/// Returns `Ok(None)` when no reasoning field must be sent.
/// Fails fast with `ReasoningNotSupported` or `Validation` before any HTTP.
pub fn map_reasoning(
    level: &ReasoningLevel,
    caps: &ModelCapabilities,
    custom: Option<&Value>,
) -> Result<Option<String>, ProviderError> {
    ReasoningConfig {
        level: *level,
        custom_json: custom.cloned(),
    }
    .validate()?;

    if matches!(
        level,
        ReasoningLevel::Automatic | ReasoningLevel::None
    ) {
        return Ok(None);
    }

    if *level == ReasoningLevel::Custom {
        // Escape hatch by design: raw passthrough, exempt from the
        // allowlist membership check but still requires a reasoning-capable
        // model so typos fail fast instead of producing provider 400s.
        if !caps.supports_reasoning {
            return Err(ProviderError::ReasoningNotSupported(
                "custom reasoning requires a reasoning-capable model".to_string(),
            ));
        }
        return Ok(Some(extract_custom_reasoning(custom)?));
    }

    if !caps.supports_reasoning {
        return Err(ProviderError::ReasoningNotSupported(format!(
            "model does not support reasoning (level '{}')",
            level.as_str()
        )));
    }
    if !caps.allowed_reasoning.is_empty() && !caps.allowed_reasoning.contains(level) {
        return Err(ProviderError::ReasoningNotSupported(format!(
            "reasoning level '{}' is not in this model's allowlist",
            level.as_str()
        )));
    }
    Ok(Some(
        wire_value(*level)
            .expect("non-custom send level always has a wire value")
            .to_string(),
    ))
}

fn extract_custom_reasoning(custom: Option<&Value>) -> Result<String, ProviderError> {
    match custom {
        Some(Value::String(s)) => Ok(s.clone()),
        Some(Value::Object(map)) => match map.get("reasoning_effort") {
            Some(Value::String(s)) => Ok(s.clone()),
            Some(other) => Ok(other.to_string()),
            None => Err(ProviderError::Validation(
                "custom reasoning object must contain 'reasoning_effort'".to_string(),
            )),
        },
        _ => Err(ProviderError::Validation(
            "custom reasoning must be a string or an object with 'reasoning_effort'".to_string(),
        )),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn no_reasoning_caps() -> ModelCapabilities {
        ModelCapabilities::default()
    }

    fn reasoning_caps() -> ModelCapabilities {
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
            supports_temperature: true,
            supports_system_prompt: true,
            max_output_tokens: None,
        }
    }

    #[test]
    fn high_blocked_when_model_has_no_reasoning() {
        let err = map_reasoning(&ReasoningLevel::High, &no_reasoning_caps(), None)
            .expect_err("must fail");
        assert!(matches!(err, ProviderError::ReasoningNotSupported(_)));
    }

    #[test]
    fn automatic_and_none_omit_field() {
        assert_eq!(
            map_reasoning(&ReasoningLevel::Automatic, &no_reasoning_caps(), None).expect("auto"),
            None
        );
        assert_eq!(
            map_reasoning(&ReasoningLevel::None, &no_reasoning_caps(), None).expect("none"),
            None
        );
    }

    #[test]
    fn extra_high_maps_to_xhigh_and_maximum_to_max() {
        assert_eq!(
            map_reasoning(&ReasoningLevel::ExtraHigh, &reasoning_caps(), None).expect("xhigh"),
            Some("xhigh".to_string())
        );
        assert_eq!(
            map_reasoning(&ReasoningLevel::Maximum, &reasoning_caps(), None).expect("max"),
            Some("max".to_string())
        );
    }

    #[test]
    fn level_outside_allowlist_is_rejected() {
        let caps = ModelCapabilities {
            allowed_reasoning: vec![ReasoningLevel::Low, ReasoningLevel::High],
            ..reasoning_caps()
        };
        let err = map_reasoning(&ReasoningLevel::Medium, &caps, None).expect_err("must fail");
        assert!(matches!(err, ProviderError::ReasoningNotSupported(_)));
        assert_eq!(
            map_reasoning(&ReasoningLevel::Low, &caps, None).expect("low"),
            Some("low".to_string())
        );
    }

    #[test]
    fn custom_accepts_object_with_reasoning_effort() {
        let custom = serde_json::json!({ "reasoning_effort": "high" });
        assert_eq!(
            map_reasoning(&ReasoningLevel::Custom, &reasoning_caps(), Some(&custom))
                .expect("custom"),
            Some("high".to_string())
        );
    }
}
