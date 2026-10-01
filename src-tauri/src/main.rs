// MVP-0: Tauri IPC commands are wired here. No provider/model/chat logic
// outside ipc.rs. The Actix stub (crates/actix-api) stays disabled.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod ipc;

use std::sync::Arc;

use tauri::Manager;

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let db_path = resolve_db_path(app);
            let db =
                conversation_store::Db::connect(&db_path).expect("failed to open local database");
            app.manage(ipc::AppState::with_db(Arc::new(db)));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            ipc::create_provider,
            ipc::list_providers,
            ipc::update_provider,
            ipc::delete_provider,
            ipc::export_provider,
            ipc::export_backup,
            ipc::import_backup,
            ipc::test_connection_cmd,
            ipc::refresh_models,
            ipc::list_models_cmd,
            ipc::add_model_manual,
            ipc::create_conversation,
            ipc::list_conversations,
            ipc::rename_conversation,
            ipc::delete_conversation,
            ipc::update_conversation_settings,
            ipc::create_folder,
            ipc::list_folders_cmd,
            ipc::rename_folder,
            ipc::delete_folder,
            ipc::create_tag,
            ipc::list_tags_cmd,
            ipc::set_conversation_folder_cmd,
            ipc::set_conversation_tags_cmd,
            ipc::list_messages_cmd,
            ipc::create_bookmark,
            ipc::list_bookmarks_cmd,
            ipc::delete_bookmark,
            ipc::stream_chat_cmd,
            ipc::cancel_stream,
            ipc::open_devtools,
            ipc::open_inspector_window,
            ipc::close_inspector_window,
            ipc::get_app_info,
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Inference Chat Studio");
}

/// Single stable database location for every run mode (`tauri dev`,
/// release binary, installed app).
///
/// Previously the path was CWD-relative, so each launch mode silently used a
/// different database file (history "lost" between runs). Now everything
/// points at the per-user app-data dir. `INFERENCE_CHAT_STUDIO_DB` still
/// overrides (tests, portable use). Old per-CWD files are intentionally
/// orphaned, not migrated, for MVP-0.
fn resolve_db_path(app: &tauri::App) -> String {
    if let Ok(path) = std::env::var("INFERENCE_CHAT_STUDIO_DB") {
        return path;
    }
    let dir = app
        .path()
        .app_data_dir()
        .expect("failed to resolve app data dir");
    std::fs::create_dir_all(&dir).expect("failed to create app data dir");
    dir.join("inference-chat-studio.db")
        .to_string_lossy()
        .to_string()
}
