// MVP-0: Tauri IPC commands are wired here. No provider/model/chat logic
// outside ipc.rs. The Actix stub (crates/actix-api) stays disabled.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod ipc;

use std::sync::Arc;

fn main() {
    let db_path = default_db_path();
    let db = conversation_store::Db::connect(&db_path).expect("failed to open local database");
    let state = ipc::AppState::with_db(Arc::new(db));

    tauri::Builder::default()
        .manage(state)
        .invoke_handler(tauri::generate_handler![
            ipc::create_provider,
            ipc::list_providers,
            ipc::update_provider,
            ipc::delete_provider,
            ipc::export_provider,
            ipc::test_connection_cmd,
            ipc::refresh_models,
            ipc::list_models_cmd,
            ipc::add_model_manual,
            ipc::create_conversation,
            ipc::list_conversations,
            ipc::rename_conversation,
            ipc::delete_conversation,
            ipc::stream_chat_cmd,
            ipc::cancel_stream,
            ipc::open_devtools,
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Inference Chat Studio");
}

fn default_db_path() -> String {
    std::env::var("INFERENCE_CHAT_STUDIO_DB").unwrap_or_else(|_| "inference-chat-studio.db".to_string())
}
