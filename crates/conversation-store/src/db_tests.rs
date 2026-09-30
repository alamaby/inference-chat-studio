use super::db::{ConversationRow, Db, MessageRow, ModelRow, ProviderRow};

fn provider_row(id: &str) -> ProviderRow {
    ProviderRow {
        id: id.to_string(),
        name: "Local".to_string(),
        compatibility_type: "openai".to_string(),
        api_mode: "chat_completions".to_string(),
        base_url: "http://127.0.0.1:8000/v1".to_string(),
        credential_reference: Some(format!("keyring:provider:{id}:api_key")),
        additional_headers_json: None,
        default_model_id: None,
        enabled: true,
        created_at: "2026-09-28T00:00:00Z".to_string(),
        updated_at: "2026-09-28T00:00:00Z".to_string(),
    }
}

fn model_row(id: &str, provider_id: &str, remote: &str, last_seen: &str) -> ModelRow {
    ModelRow {
        id: id.to_string(),
        provider_id: provider_id.to_string(),
        remote_model_id: remote.to_string(),
        display_name: Some(remote.to_string()),
        capabilities_json: None,
        manually_added: false,
        available: true,
        first_seen_at: "2026-09-28T00:00:00Z".to_string(),
        last_seen_at: last_seen.to_string(),
    }
}

#[test]
fn provider_insert_and_list() {
    let db = Db::connect_in_memory().expect("connect");
    db.insert_provider(&provider_row("p1")).expect("insert");
    let providers = db.list_providers().expect("list");
    assert_eq!(providers.len(), 1);
    assert_eq!(providers[0].id, "p1");
    assert_eq!(
        providers[0].credential_reference.as_deref(),
        Some("keyring:provider:p1:api_key")
    );
}

#[test]
fn model_upsert_updates_last_seen_without_duplicate() {
    let db = Db::connect_in_memory().expect("connect");
    db.insert_provider(&provider_row("p1")).expect("insert provider");
    db.upsert_model(&model_row("m1", "p1", "gpt-test", "2026-09-28T00:00:00Z"))
        .expect("upsert 1");
    db.upsert_model(&model_row("m1", "p1", "gpt-test", "2026-09-28T01:00:00Z"))
        .expect("upsert 2");
    let models = db.list_models_by_provider("p1").expect("list models");
    assert_eq!(models.len(), 1);
    assert_eq!(models[0].remote_model_id, "gpt-test");
    assert_eq!(models[0].last_seen_at, "2026-09-28T01:00:00Z");
}

#[test]
fn conversation_messages_ordered_by_created_at() {
    let db = Db::connect_in_memory().expect("connect");
    db.insert_conversation(&ConversationRow {
        id: "c1".to_string(),
        title: "t".to_string(),
        provider_id: None,
        default_model_id: None,
        system_prompt: None,
        settings_json: None,
        pinned: false,
        archived: false,
        created_at: "2026-09-28T00:00:00Z".to_string(),
        updated_at: "2026-09-28T00:00:00Z".to_string(),
    })
    .expect("insert conversation");
    for (id, ts) in [("msg2", "2026-09-28T00:02:00Z"), ("msg1", "2026-09-28T00:01:00Z")] {
        db.insert_message(&MessageRow {
            id: id.to_string(),
            conversation_id: "c1".to_string(),
            parent_message_id: None,
            role: "user".to_string(),
            content_json: "\"hi\"".to_string(),
            raw_provider_data_json: None,
            provider_id: None,
            model_id: None,
            reasoning_config_json: None,
            usage_json: None,
            duration_ms: None,
            ttft_ms: None,
            finish_reason: None,
            status: "done".to_string(),
            created_at: ts.to_string(),
        })
        .expect("insert message");
    }
    let messages = db.list_messages_by_conversation("c1").expect("list messages");
    assert_eq!(messages.len(), 2);
    assert_eq!(messages[0].id, "msg1");
    assert_eq!(messages[1].id, "msg2");
}

#[test]
fn migrate_is_idempotent_and_indexes_exist() {
    let db = Db::connect_in_memory().expect("connect");
    db.migrate().expect("migrate twice");
    assert_eq!(db.schema_version().expect("version"), 1);
    let mut indexes = db.index_names().expect("indexes");
    indexes.sort();
    assert_eq!(
        indexes,
        vec![
            "idx_conv_updated".to_string(),
            "idx_messages_conv_created".to_string(),
            "idx_models_provider".to_string(),
        ]
    );
}

#[test]
fn rejects_non_chat_completions_api_mode() {
    let db = Db::connect_in_memory().expect("connect");
    let mut row = provider_row("p9");
    row.api_mode = "responses".to_string();
    let err = db.insert_provider(&row).expect_err("must reject");
    assert!(err.to_string().contains("chat_completions"));
}

fn conversation_row(id: &str, title: &str, updated_at: &str) -> ConversationRow {
    ConversationRow {
        id: id.to_string(),
        title: title.to_string(),
        provider_id: None,
        default_model_id: None,
        system_prompt: None,
        settings_json: None,
        pinned: false,
        archived: false,
        created_at: "2026-09-28T00:00:00Z".to_string(),
        updated_at: updated_at.to_string(),
    }
}

#[test]
fn conversation_list_rename_delete() {
    let db = Db::connect_in_memory().expect("connect");
    db.insert_conversation(&conversation_row("c1", "first", "2026-09-28T00:01:00Z"))
        .expect("insert c1");
    db.insert_conversation(&conversation_row("c2", "second", "2026-09-28T00:02:00Z"))
        .expect("insert c2");
    let list = db.list_conversations().expect("list");
    assert_eq!(list.len(), 2);
    assert_eq!(list[0].id, "c2");

    db.rename_conversation("c1", "renamed", "2026-09-28T00:03:00Z")
        .expect("rename");
    let list = db.list_conversations().expect("list after rename");
    assert_eq!(list[0].id, "c1");
    assert_eq!(list[0].title, "renamed");

    db.delete_conversation("c1").expect("delete");
    let list = db.list_conversations().expect("list after delete");
    assert_eq!(list.len(), 1);
    assert_eq!(list[0].id, "c2");
}

#[test]
fn deleting_provider_with_history_detaches_conversations_first() {
    let db = Db::connect_in_memory().expect("connect");
    db.insert_provider(&provider_row("p1")).expect("insert provider");
    db.insert_conversation(&ConversationRow {
        id: "c1".to_string(),
        title: "t".to_string(),
        provider_id: Some("p1".to_string()),
        default_model_id: None,
        system_prompt: None,
        settings_json: None,
        pinned: false,
        archived: false,
        created_at: "2026-09-28T00:00:00Z".to_string(),
        updated_at: "2026-09-28T00:00:00Z".to_string(),
    })
    .expect("insert conversation");
    db.clear_conversation_provider("p1").expect("detach");
    db.delete_provider("p1").expect("delete provider");
    let list = db.list_conversations().expect("list");
    assert_eq!(list.len(), 1);
    assert_eq!(list[0].provider_id, None);
}
