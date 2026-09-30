//! Stub MVP-0: Actix dinonaktifkan. Jangan aktifkan server.

/// Returns false for the whole MVP-0. The Actix localhost bridge is
/// intentionally disabled; React talks to Rust via Tauri IPC (Langkah 6).
pub fn is_enabled() -> bool {
    false
}
