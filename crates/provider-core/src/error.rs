/// Error taxonomy for inference provider operations.
///
/// Secret and header values must never be embedded in these messages.
/// `Display` is derived from the `#[error(...)]` messages below via thiserror.
#[derive(Debug, thiserror::Error, Clone, PartialEq)]
pub enum ProviderError {
    #[error("unauthorized: {0}")]
    Unauthorized(String),
    #[error("request timed out")]
    Timeout,
    #[error("invalid response from provider: {0}")]
    InvalidResponse(String),
    #[error("model not found: {0}")]
    ModelNotFound(String),
    #[error("reasoning not supported: {0}")]
    ReasoningNotSupported(String),
    #[error("stream interrupted: {0}")]
    StreamInterrupted(String),
    #[error("network error: {0}")]
    Network(String),
    #[error("validation error: {0}")]
    Validation(String),
}
