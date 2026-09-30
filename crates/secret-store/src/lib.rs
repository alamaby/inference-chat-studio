//! Secure credential storage for Inference Chat Studio (MVP-0: Windows only).
//!
//! SQLite stores only the `credential_reference` string
//! (`keyring:provider:{provider_id}:api_key`). The secret itself lives in
//! the OS credential manager. Values are never logged.

pub const SERVICE_NAME: &str = "com.alamaby.inference-chat-studio";

#[derive(Debug, thiserror::Error)]
pub enum SecretStoreError {
    #[error("validation error: {0}")]
    Validation(String),
    #[error("access denied to credential store for key '{0}'")]
    AccessDenied(String),
    #[error("credential store error for key '{0}': {1}")]
    Backend(String, String),
}

pub type Result<T> = std::result::Result<T, SecretStoreError>;

pub trait SecretStore {
    fn set(&self, key: &str, secret: &str) -> Result<()>;
    fn get(&self, key: &str) -> Result<Option<String>>;
    fn delete(&self, key: &str) -> Result<()>;
}

/// Build the DB-safe reference string for a provider API key.
/// The reference is stored in SQLite; the secret is not.
pub fn credential_reference_for_provider(provider_id: &str) -> String {
    format!("keyring:provider:{provider_id}:api_key")
}

/// Windows Credential Manager backend (MVP-0).
pub struct WindowsCredentialStore;

impl WindowsCredentialStore {
    fn entry(&self, key: &str) -> std::result::Result<keyring::Entry, SecretStoreError> {
        keyring::Entry::new(SERVICE_NAME, key)
            .map_err(|e| SecretStoreError::Backend(key.to_string(), e.to_string()))
    }
}

impl SecretStore for WindowsCredentialStore {
    fn set(&self, key: &str, secret: &str) -> Result<()> {
        if secret.is_empty() {
            return Err(SecretStoreError::Validation(
                "secret must not be empty".to_string(),
            ));
        }
        let entry = self.entry(key)?;
        entry
            .set_password(secret)
            .map_err(|e| map_keyring_error(key, e))?;
        Ok(())
    }

    fn get(&self, key: &str) -> Result<Option<String>> {
        let entry = self.entry(key)?;
        match entry.get_password() {
            Ok(secret) => Ok(Some(secret)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(map_keyring_error(key, e)),
        }
    }

    fn delete(&self, key: &str) -> Result<()> {
        let entry = self.entry(key)?;
        match entry.delete_credential() {
            Ok(()) => Ok(()),
            Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(map_keyring_error(key, e)),
        }
    }
}

fn map_keyring_error(key: &str, e: keyring::Error) -> SecretStoreError {
    let msg = e.to_string();
    if msg.contains("access denied")
        || msg.contains("Access is denied")
        || matches!(
            e,
            keyring::Error::PlatformFailure(_)
        ) && msg.to_lowercase().contains("denied")
    {
        SecretStoreError::AccessDenied(key.to_string())
    } else {
        SecretStoreError::Backend(key.to_string(), msg)
    }
}

// MVP-0 Windows only. macOS Keychain / Linux Secret Service are out of scope.
// pub struct MacKeychainStore; // MVP-0 Windows only
// pub struct LinuxSecretServiceStore; // MVP-0 Windows only

/// In-memory store for unit tests only. Never touches the OS keychain,
// so CI runs without credential popups.
#[cfg(any(test, feature = "test-utils"))]
pub struct InMemoryStore {    inner: std::sync::Mutex<std::collections::HashMap<String, String>>,
}

#[cfg(any(test, feature = "test-utils"))]
impl InMemoryStore {
    pub fn new() -> Self {
        Self {
            inner: std::sync::Mutex::new(std::collections::HashMap::new()),
        }
    }
}

#[cfg(any(test, feature = "test-utils"))]
impl Default for InMemoryStore {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(any(test, feature = "test-utils"))]
impl SecretStore for InMemoryStore {
    fn set(&self, key: &str, secret: &str) -> Result<()> {
        if secret.is_empty() {
            return Err(SecretStoreError::Validation(
                "secret must not be empty".to_string(),
            ));
        }
        self.inner
            .lock()
            .expect("secret mutex poisoned")
            .insert(key.to_string(), secret.to_string());
        Ok(())
    }

    fn get(&self, key: &str) -> Result<Option<String>> {
        Ok(self
            .inner
            .lock()
            .expect("secret mutex poisoned")
            .get(key)
            .cloned())
    }

    fn delete(&self, key: &str) -> Result<()> {
        self.inner
            .lock()
            .expect("secret mutex poisoned")
            .remove(key);
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn set_get_delete_roundtrip() {
        let store = InMemoryStore::new();
        store.set("k1", "s3cr3t").expect("set");
        assert_eq!(store.get("k1").expect("get"), Some("s3cr3t".to_string()));
        store.delete("k1").expect("delete");
        assert_eq!(store.get("k1").expect("get after delete"), None);
    }

    #[test]
    fn set_overwrites_existing() {
        let store = InMemoryStore::new();
        store.set("k1", "first").expect("set 1");
        store.set("k1", "second").expect("set 2");
        assert_eq!(store.get("k1").expect("get"), Some("second".to_string()));
    }

    #[test]
    fn get_missing_returns_none_not_error() {
        let store = InMemoryStore::new();
        assert_eq!(store.get("nope").expect("get"), None);
    }

    #[test]
    fn empty_secret_rejected() {
        let store = InMemoryStore::new();
        let err = store.set("k1", "").expect_err("empty must fail");
        assert!(matches!(err, SecretStoreError::Validation(_)));
    }

    #[test]
    fn credential_reference_format() {
        assert_eq!(
            credential_reference_for_provider("p1"),
            "keyring:provider:p1:api_key"
        );
    }

    #[test]
    fn windows_store_roundtrip_smoke() {
        // Diagnostic regression test: touches the REAL Windows Credential
        // Manager with a throwaway key and cleans up afterwards.
        let store = WindowsCredentialStore;
        let key = format!(
            "smoke-test-{}-{}:api_key",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("clock")
                .as_millis()
        );
        let _ = store.delete(&key);
        store.set(&key, "smoke-secret").expect("set");
        assert_eq!(
            store.get(&key).expect("get"),
            Some("smoke-secret".to_string())
        );
        store.delete(&key).expect("delete");
        assert_eq!(store.get(&key).expect("get after delete"), None);
    }
}
