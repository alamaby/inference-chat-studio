# Inference Chat Studio — MVP-0 Windows Implementation Plan

Created: 2026-09-28 09:00:00

## Objective

Bangun MVP-0 Windows local-first yang membuktikan alur inti: Add Provider (OpenAI Chat Completions) → Test Connection → Discover Models (+ manual fallback) → Select Model + Reasoning (8 level, capability-aware) → Stream Chat → Persist History → Raw Inspector minimal. Installer NSIS + embedBootstrapper, manual install, unsigned. Tanpa Actix wajib, tanpa auto-update, tanpa Responses/Anthropic di MVP-0 (disiapkan sebagai tahap berikutnya).

Konteks terkunci:
- Nama: Inference Chat Studio
- Bundle ID: com.alamaby.inference-chat-studio, Publisher: Alam Aby Bashit
- Target akhir cross-platform, MVP Windows 10 1809+ saja
- Bundler: NSIS, WebView2 embedBootstrapper
- Adapter bertahap: Chat Completions dulu, Responses dan Anthropic menyusul
- Reasoning tetap 8 level + Custom
- Tauri IPC jalur utama, Actix stub saja

## Scope

In scope (MVP-0):
- R1 Provider CRUD OpenAI-compatible Chat Completions
- R2 Test connection + status taxonomy
- R3 List models GET /models + manual add + cache SQLite
- R4 Reasoning mapping 8 level capability-aware
- R5 Streaming chat + stop + regenerate + edit/resend + copy + markdown/code render
- R6 History persist + rename + search + delete + filter provider/model
- R7 Raw request/response inspector minimal
- R8 Secret di Windows Credential Manager via trait
- R9 Packaging NSIS embedBootstrapper 1809+
- R10 Simple settings: model, reasoning, max output, system prompt, temperature (gated)

Out of scope (dilarang di MVP-0):
- OpenAI Responses API, Anthropic Messages API, auto-detect mode
- Tool calling, MCP, RAG, image/audio/voice, cloud sync, kolaborasi, benchmark
- Conversation branching, tags, favorites, export/import, multi-model compare
- Actix HTTP server aktif, Tauri updater, signing, Linux/Mac bundling

## Milestones

1. M1 Scaffolding + packaging dasar (Langkah 1, 9-skeleton)
2. M2 Data layer: SQLite + SecretStore (Langkah 2, 3)
3. M3 Provider core + Chat Completions adapter (Langkah 4, 5)
4. M4 Tauri IPC + Frontend chat linear + inspector (Langkah 6, 7, 8)
5. M5 Hardening + NSIS embedBootstrapper verification (Langkah 9, 10)

## Tasks

- [x] Langkah 1: Workspace + Tauri + React skeleton + NSIS embedBootstrapper config
- [x] Langkah 2: conversation-store SQLite schema + migrasi + index
- [x] Langkah 3: secret-store trait + Windows impl
- [x] Langkah 4: provider-core types + error taxonomy + reasoning enum 8 level
- [x] Langkah 5: provider-openai Chat Completions adapter (models + test + stream + reasoning map)
- [x] Langkah 6: Tauri IPC commands provider/model/chat/history
- [x] Langkah 7: Frontend Provider Manager + Model Selector + Chat linear + Simple settings
- [x] Langkah 8: Raw inspector minimal + diagnostics persist
- [x] Langkah 9: NSIS packaging + manual install verification Win10 1809+
- [x] Langkah 10: Test suite + verifikasi akhir

## Requirement Traceability

- R1 → Langkah 1,5,6,7
- R2 → Langkah 4,5,6
- R3 → Langkah 2,5,6,7
- R4 → Langkah 4,5,7
- R5 → Langkah 5,6,7
- R6 → Langkah 2,6,7
- R7 → Langkah 6,8
- R8 → Langkah 3,6
- R9 → Langkah 1,9
- R10 → Langkah 7
- F1 capability unreliable → Langkah 4,7 (preset+manual, no auto-probe)
- F4 null rejection → Langkah 4,5 (skip_serializing_if)
- F6 Actix dual surface → Langkah 1,6 (stub only)
- F7 privacy disclaimer → Langkah 7
- F8 install-time internet → Langkah 9

## Implementation Steps

### Langkah 1 — Workspace + Desktop skeleton + Tauri NSIS config

- Tujuan: sediakan skeleton buildable agar langkah lain tidak blocked struktur repo.
- Finding/requirement: R1, R9, F6.
- Dependency: tidak ada (pertama).
- File yang harus dibaca: tidak ada (repo kosong, hanya `.git/`). Verifikasi dengan `read` root bila perlu.
- File yang harus diubah (buat baru):
  - `Cargo.toml`
  - `src-tauri/Cargo.toml`
  - `src-tauri/tauri.conf.json`
  - `src-tauri/src/main.rs`
  - `src-tauri/capabilities/default.json`
  - `apps/desktop/package.json`
  - `apps/desktop/vite.config.ts`
  - `apps/desktop/src/App.tsx`
  - `crates/actix-api/src/lib.rs` (stub)
- Simbol terkait: `tauri::Builder`, `bundle.windows.nsis`, `bundle.windows.webviewInstallMode`.
- Kondisi saat ini: file belum ada. Repo kosong.
- Perubahan konkret:
  1. `Cargo.toml`: workspace members `["src-tauri", "crates/*"]`, resolver `2`, tambah `[workspace.dependencies]` `tokio=1`, `serde=1`, `reqwest=0.12`, `sqlx` atau `rusqlite` dipin di Langkah 2 (jangan tambah di sini selain tokio/serde).
  2. `src-tauri/tauri.conf.json`: set `productName: "Inference Chat Studio"`, `identifier: "com.alamaby.inference-chat-studio"`, `publisher: "Alam Aby Bashit"`, `bundle.windows.nsis.installMode: "currentUser"` (tanpa admin), `bundle.windows.webviewInstallMode: "embedBootstrapper"`, `bundle.targets: ["nsis"]`, `app.windows.minVersion`: dokumentasikan `10.0.17763` (1809) di komentar/deskripsi bila field tidak didukung versi Tauri.
  3. `src-tauri/src/main.rs`: hanya `fn main() { tauri::Builder::default().run(tauri::generate_context!()).expect("tauri run"); }`. Jangan tambah IPC di sini (IPC di Langkah 6).
  4. `crates/actix-api/src/lib.rs`: isi satu baris `//! Stub MVP-0: Actix dinonaktifkan. Jangan aktifkan server.` + `pub fn is_enabled() -> bool { false }`.
- Urutan perubahan: `Cargo.toml` → `src-tauri/*` → `apps/desktop/*` → `crates/actix-api/*`.
- Behavior dipertahankan: tidak ada behavior lama. Pastikan `cargo check` dan `pnpm --dir apps/desktop typecheck` lolos skeleton.
- Error handling/edge: jika `embedBootstrapper` gagal download saat install (proxy/GPO), installer harus tampilkan error jelas, bukan silent fail. Dokumentasikan di README install, jangan code auto-retry di MVP-0.
- Test: belum ada logic test. Tambah smoke: `src-tauri` compile check saja.
- Input/expected: N/A logic.
- Command verifikasi: `cargo check -p inference-chat-studio-tauri` dan `pnpm --dir apps/desktop typecheck` (setelah `pnpm install`).
- Hasil diharapkan: kedua command exit 0, tidak ada error resolver.
- Completion criteria: skeleton compile, `tauri.conf.json` berisi 4 kunci terkunci (productName, identifier, publisher, embedBootstrapper+nsis).
- Dilarang ubah: `crates/provider-*`, `crates/conversation-store/*`, `crates/secret-store/*` di langkah ini.

### Langkah 2 — SQLite schema + migrasi + index

- Tujuan: persist providers/models/conversations/messages secara lokal dengan migrasi versioned.
- Requirement: R1, R3, R6.
- Dependency: Langkah 1 (workspace ada).
- Baca: `Cargo.toml`, `src-tauri/Cargo.toml`.
- Ubah (buat):
  - `crates/conversation-store/Cargo.toml`
  - `crates/conversation-store/src/lib.rs`
  - `crates/conversation-store/src/db.rs`
  - `crates/conversation-store/migrations/0001_init.sql`
- Simbol: `Db`, `Db::connect(path)`, `Db::migrate()`, struct `ProviderRow`, `ModelRow`, `ConversationRow`, `MessageRow`.
- Kondisi: belum ada.
- Perubahan konkret:
  1. Pilih SATU: `rusqlite 0.32 + refinery` ATAU `sqlx 0.8 sqlite`. Rekomendasi untuk model kecil: `rusqlite`. Kunci pilihan di `Cargo.toml` langkah ini, jangan ganti di langkah lain.
  2. `migrations/0001_init.sql` isi TEPAT (jangan tambah kolom lain):
     ```sql
     CREATE TABLE providers(id TEXT PRIMARY KEY, name TEXT NOT NULL, compatibility_type TEXT NOT NULL DEFAULT 'openai', api_mode TEXT NOT NULL DEFAULT 'chat_completions', base_url TEXT NOT NULL, credential_reference TEXT, additional_headers_json TEXT, default_model_id TEXT, enabled INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
     CREATE TABLE models(id TEXT PRIMARY KEY, provider_id TEXT NOT NULL REFERENCES providers(id) ON DELETE CASCADE, remote_model_id TEXT NOT NULL, display_name TEXT, capabilities_json TEXT, manually_added INTEGER NOT NULL DEFAULT 0, available INTEGER NOT NULL DEFAULT 1, first_seen_at TEXT NOT NULL, last_seen_at TEXT NOT NULL, UNIQUE(provider_id, remote_model_id));
     CREATE TABLE conversations(id TEXT PRIMARY KEY, title TEXT NOT NULL, provider_id TEXT REFERENCES providers(id), default_model_id TEXT, system_prompt TEXT, settings_json TEXT, pinned INTEGER NOT NULL DEFAULT 0, archived INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
     CREATE TABLE messages(id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE, parent_message_id TEXT, role TEXT NOT NULL, content_json TEXT NOT NULL, raw_provider_data_json TEXT, provider_id TEXT, model_id TEXT, reasoning_config_json TEXT, usage_json TEXT, duration_ms INTEGER, ttft_ms INTEGER, finish_reason TEXT, status TEXT NOT NULL, created_at TEXT NOT NULL);
     CREATE INDEX idx_models_provider ON models(provider_id);
     CREATE INDEX idx_messages_conv_created ON messages(conversation_id, created_at);
     CREATE INDEX idx_conv_updated ON conversations(updated_at);
     ```
  3. `db.rs`: implement `connect(path: &str)`, `migrate()` jalankan `0001_init.sql` sekali via `user_version` check, `insert_provider`, `list_providers`, `upsert_model`, `insert_message`. ID generate `uuid v4` string di caller, bukan di SQL.
- Urutan: `Cargo.toml` → `migrations/0001_init.sql` → `db.rs` → `lib.rs` re-export.
- Pertahankan: `api_mode` selalu `'chat_completions'` di MVP-0. Jangan terima `responses`/`anthropic` (reject dengan error validasi).
- Error/edge: path DB belum ada → buat parent dir; `base_url` trailing slash dinormalisasi di Langkah 5 bukan di sini; foreign key aktifkan `PRAGMA foreign_keys=ON`.
- Test tambah: `crates/conversation-store/src/db_tests.rs` (integration `#[cfg(test)]`):
  - Input: insert provider id `p1`, upsert model `(p1, gpt-test)` 2x, insert conversation `c1` + 2 messages.
  - Expected: `list_providers` len 1; second upsert update `last_seen_at` tanpa duplikat (UNIQUE enforced); messages ordered by `created_at`.
- Verifikasi: `cargo test -p conversation-store`.
- Expected: semua test pass, tidak ada file DB tertinggal di repo (gunakan `tempfile`).
- Completion: migrasi idempoten (run 2x tidak error), index ada (cek `sqlite_master`).
- Dilarang ubah: provider adapter, secret-store, frontend, tauri.conf.

### Langkah 3 — SecretStore trait + Windows Credential Manager

- Tujuan: API key tidak pernah di SQLite plaintext.
- Requirement: R8.
- Dependency: Langkah 1.
- Baca: `Cargo.toml`.
- Ubah (buat):
  - `crates/secret-store/Cargo.toml`
  - `crates/secret-store/src/lib.rs`
- Simbol: `trait SecretStore { fn set(key:&str, secret:&str)->Result<()>; fn get(key:&str)->Result<Option<String>>; fn delete(key:&str)->Result<()>; }`, `WindowsCredentialStore`, `메모리 fallback InMemoryStore (cfg(test) only)`, `SecretStoreError`.
- Kondisi: belum ada.
- Perubahan:
  1. `Cargo.toml`: `keyring = "3"` (Windows Credential Manager backend). Jangan tambah `openssl` manual.
  2. `lib.rs` urutan: `SecretStoreError` enum → `SecretStore` trait → `WindowsCredentialStore` impl via `keyring::Entry::new(service, key)` dengan `service="com.alamaby.inference-chat-studio"` KONSTAN → `InMemoryStore` hanya `#[cfg(test)]`.
  3. `credential_reference` format: `keyring:provider:{provider_id}:api_key`. DB hanya simpan string ini, tidak pernah secret.
  4. Jangan implement keychain Mac / Secret Service Linux di MVP-0. Tinggalkan `unimplemented!()` dengan komentar `// MVP-0 Windows only`.
- Pertahankan: `get` missing → `Ok(None)` bukan error. `set` overwrite aman.
- Error/edge: Credential Manager locked/denied → map ke `SecretStoreError::AccessDenied` dengan pesan tanpa bocorkan secret; secret kosong → `Validation` error; jangan log secret (`#[allow]` log value dilarang, hanya log `key`).
- Test: `secret-store` unit dengan `InMemoryStore` (jangan sentuh OS keychain di CI):
  - Input: `set("k1","s3cr3t")` → `get("k1")` → `delete("k1")` → `get("k1")`.
  - Expected: `Some("s3cr3t")`, lalu `None`. Pastikan tidak ada `println!` secret.
- Verifikasi: `cargo test -p secret-store`.
- Expected: pass tanpa popup credential OS.
- Completion: trait terkompilasi di Windows, tidak ada secret di log/DB.
- Dilarang ubah: schema DB, adapter HTTP, frontend export (export config harus `api_key:null` — enforced di Langkah 6, bukan di sini).

### Langkah 4 — provider-core types + error + reasoning 8 level

- Tujuan: tipe tunggal agar adapter kecil bisa ikuti tanpa desain ulang.
- Requirement: R2, R4 + F1, F4.
- Dependency: Langkah 1.
- Baca: `Cargo.toml`.
- Ubah (buat):
  - `crates/provider-core/Cargo.toml`
  - `crates/provider-core/src/lib.rs`
  - `crates/provider-core/src/types.rs`
  - `crates/provider-core/src/error.rs`
  - `crates/provider-core/src/reasoning.rs`
- Simbol: `ProviderConfig`, `ModelInfo`, `ModelCapabilities`, `NormalizedChatRequest`, `ChatMessage`, `ContentBlock`, `ReasoningLevel`, `ReasoningConfig`, `ConnectionStatus`, `ProviderError`.
- Kondisi: belum ada.
- Perubahan konkret (tepat, jangan rename):
  1. `error.rs`: `pub enum ProviderError { Unauthorized(String), Timeout, InvalidResponse(String), ModelNotFound(String), ReasoningNotSupported(String), StreamInterrupted(String), Network(String), Validation(String) }` + `impl Display` tanpa sertakan secret/header value.
  2. `types.rs`:
     ```rust
     pub struct ProviderConfig { pub id:String, pub name:String, pub compatibility_type:String, pub api_mode:String, pub base_url:String, pub credential_reference:Option<String>, pub additional_headers_json:Option<String>, pub timeout_ms:u64 }
     pub struct ModelInfo { pub remote_model_id:String, pub display_name:Option<String>, pub capabilities:ModelCapabilities }
     pub struct ModelCapabilities { pub supports_streaming:bool, pub supports_reasoning:bool, pub allowed_reasoning:Vec<ReasoningLevel>, pub supports_temperature:bool, pub supports_system_prompt:bool, pub max_output_tokens:Option<u32> }
     pub struct NormalizedChatRequest { pub model:String, pub system_prompt:Option<String>, pub messages:Vec<ChatMessage>, pub temperature:Option<f32>, pub max_output_tokens:Option<u32>, pub reasoning:ReasoningConfig, pub timeout_ms:u64 }
     ```
     Semua `Option` serialize dengan `skip_serializing_if="Option::is_none"` (F4).
  3. `reasoning.rs`: `pub enum ReasoningLevel { Automatic, None, Minimal, Low, Medium, High, ExtraHigh, Maximum, Custom }` + `pub struct ReasoningConfig { pub level:ReasoningLevel, pub custom_json:Option<serde_json::Value> }`. `Custom` wajib `custom_json.is_some()` else `Validation` error. `None`/`Automatic` berarti JANGAN kirim field reasoning (dibedakan dari `Minimal..Maximum` yang kirim string).
  4. `ConnectionStatus` enum: `Connected, ConnectionFailed, Unauthorized, Timeout, InvalidResponse, NotTested`.
  5. Capability default: `supports_streaming=true, supports_reasoning=false, allowed_reasoning=[]` kecuali preset override. Jangan auto-probe (F1).
- Urutan: `error.rs` → `types.rs` → `reasoning.rs` → `lib.rs` re-export.
- Pertahankan: tidak ada pengiriman `null`; pesan error tidak bocorkan key.
- Edge: `temperature` + reasoning aktif: jika `supports_temperature==false`, adapter harus omit + beri warning (bukan error). `max_output_tokens` None → omit.
- Test: `reasoning.rs #[cfg(test)]`: `Custom` tanpa json → `Validation` err; `None` → `should_send()==false`; `High` → `true`. `types` serialize test: `temperature:None` tidak muncul di JSON string.
- Verifikasi: `cargo test -p provider-core`.
- Expected: pass.
- Completion: semua tipe terkompilasi, tidak ada `null` di snapshot JSON.
- Dilarang ubah: DB schema, HTTP adapter impl, Tauri IPC.

### Langkah 5 — provider-openai Chat Completions adapter

- Tujuan: satu-satunya adapter jaringan di MVP-0.
- Requirement: R1-R5 + F4.
- Dependency: Langkah 4 (types), Langkah 3 (secret read via caller, bukan di sini).
- Baca: `crates/provider-core/src/types.rs`, `crates/provider-core/src/reasoning.rs`, `crates/provider-core/src/error.rs`.
- Ubah (buat):
  - `crates/provider-openai/Cargo.toml` (`reqwest { json, stream }`, `tokio`, `serde_json`, `futures`, `eventsource-stream` atau manual SSE parse — kunci SATU, rekomendasi manual parse `data:` lines untuk hindari dep tambahan)
  - `crates/provider-openai/src/lib.rs`
  - `crates/provider-openai/src/models.rs`
  - `crates/provider-openai/src/chat.rs`
  - `crates/provider-openai/src/reasoning_map.rs`
- Simbol: `fn normalize_base_url(url:&str)->String`, `async fn list_models(base_url:&str, api_key:&str, timeout_ms:u64)->Result<Vec<ModelInfo>,ProviderError>`, `async fn test_connection(...)->Result<ConnectionStatus,ProviderError>`, `fn map_reasoning(level:&ReasoningLevel, caps:&ModelCapabilities, custom:Option<&Value>)->Result<Option<String>,ProviderError>`, `async fn stream_chat(base_url, api_key, req:NormalizedChatRequest)->Result<StreamChunks,ProviderError>`.
- Kondisi: belum ada.
- Perubahan:
  1. `normalize_base_url`: trim trailing `/`, hapus trailing `/chat/completions`, pastikan akhiran `/v1` dipertahankan jika user input `http://127.0.0.1:8000/v1`. Unit test wajib.
  2. `models.rs list_models`: `GET {base}/models` + `Authorization: Bearer {key}` + timeout. Parse `{data:[{id}]}`. Setiap `id` → `ModelInfo{capabilities: default + preset override}`. Preset map statis: jika id contains `o1|o3|gpt-5` → `supports_reasoning=true, allowed=[Minimal,Low,Medium,High,ExtraHigh,Maximum]`; else `supports_reasoning=false`. Jangan klaim akurat penuh — ini preset MVP.
  3. `test_connection`: panggil `list_models`. Map: 401/403→`Unauthorized`, timeout→`Timeout`, non-JSON→`InvalidResponse`, ok→`Connected`. Jangan kirim chat generation untuk test (hindari biaya).
  4. `reasoning_map.rs`: `Automatic|None→Ok(None)` (omit), `Minimal→"minimal"`, `Low→"low"`, `Medium→"medium"`, `High→"high"`, `ExtraHigh→"xhigh"`, `Maximum→"max"`, `Custom→Ok(custom_json["reasoning_effort"].as_str() atau raw string)`. Jika `caps.supports_reasoning==false` dan level bukan `Automatic/None` → `Err(ReasoningNotSupported)`. Jika level tidak ada di `allowed_reasoning` → `Err(ReasoningNotSupported)`.
  5. `chat.rs stream_chat`: `POST {base}/chat/completions` body `{model, messages:[{role,content}], stream:true, temperature?, max_tokens?, reasoning_effort?}` — hanya sertakan `Some`. SSE parse `data: {...}` sampai `data: [DONE]`. Kumpulkan `choices[0].delta.content`, `finish_reason`, `usage`. Header secret dimasking di log (jangan log `Authorization` value).
- Urutan: `reasoning_map.rs` → `models.rs` → `chat.rs` → `lib.rs`.
- Pertahankan: tidak pernah log API key; tidak kirim field null; test connection tidak generate token.
- Error/edge: base_url dengan `/v1/` ganda → normalisasi; SSE terputus tengah → `StreamInterrupted`; 404 model → `ModelNotFound`; `reasoning_effort` ditolak 400 → surface `InvalidResponse` dengan body truncated 2KB (tanpa header secret).
- Test tambah (`#[cfg(test)]` + `wiremock` atau `mockito` — kunci `wiremock 0.6`):
  - `normalize_base_url("http://127.0.0.1:8000/v1/")` → `"http://127.0.0.1:8000/v1"`.
  - `list_models` mock `{data:[{id:"m1"},{id:"m2"}]}` → len 2.
  - `test_connection` mock 401 → `Unauthorized`.
  - `map_reasoning(High, caps_no_reasoning)` → `Err(ReasoningNotSupported)`.
  - `stream_chat` mock SSE 2 chunk + `[DONE]` → gabungan `"Hello world"`, `finish_reason` preserved.
- Verifikasi: `cargo test -p provider-openai`.
- Expected: semua 5 test pass, tanpa request ke internet nyata.
- Completion: adapter hanya support `api_mode=chat_completions`; tolak `responses` dengan `Validation`.
- Dilarang ubah: DB schema, secret-store impl, Tauri IPC signature, Actix stub.

### Langkah 6 — Tauri IPC: provider/model/chat/history

- Tujuan: jembatan React→Rust deterministik, Actix tetap off.
- Requirement: R1-R3, R5-R8.
- Dependency: Langkah 2,3,4,5.
- Baca: `src-tauri/src/main.rs`, `crates/conversation-store/src/db.rs`, `crates/secret-store/src/lib.rs`, `crates/provider-openai/src/lib.rs`.
- Ubah:
  - `src-tauri/src/ipc.rs` (baru)
  - `src-tauri/src/main.rs` (daftarkan commands saja)
  - `packages/api-types/src/index.ts` (baru, tipe TS mirror Rust)
- Simbol Rust: `#[tauri::command] create_provider, update_provider, delete_provider, list_providers, test_connection_cmd, refresh_models, add_model_manual, create_conversation, list_conversations, append_message, stream_chat_cmd (emit events chat-chunk/chat-done/chat-error)`.
- Kondisi: `main.rs` skeleton tanpa command.
- Perubahan:
  1. `ipc.rs` urutan: imports → helper `load_api_key(credential_reference)` via `SecretStore` → setiap command. `create_provider(input:{name,base_url,api_key,additional_headers_json,timeout_ms})`: validasi `base_url` http(s), simpan provider row + `secret-store set`. `list_providers` kembalikan TANPA secret. `export_provider` kembalikan `api_key:null` selalu.
  2. `refresh_models(provider_id)`: load key, panggil `list_models`, `upsert_model` + update `last_seen_at`. `add_model_manual(provider_id, remote_model_id, display_name)` set `manually_added=1`.
  3. `stream_chat_cmd(conversation_id, request:NormalizedChatRequest)`: validasi `api_mode==chat_completions`, cek `map_reasoning` dulu (gagal cepat sebelum HTTP), lalu spawn streaming + `emit("chat-chunk", {conversation_id, delta})`, akhir `emit("chat-done", {usage, finish_reason, duration_ms, ttft_ms})` + persist message + update `conversations.updated_at`. `stop` via `CancellationToken`/abort handle (simpan di state Tauri, command `cancel_stream(stream_id)`).
  4. `packages/api-types/src/index.ts`: mirror tipe `ProviderConfig, ModelInfo, ReasoningLevel ("automatic|none|minimal|low|medium|high|xhigh|maximum|custom")`, event payloads. Jangan duplikasi string literal di komponen — import dari sini.
  5. `main.rs`: hanya tambah `.invoke_handler(tauri::generate_handler![...])` + `.manage(AppState{db, cancel_map})`. Jangan tambah plugin Actix/HTTP server.
- Pertahankan: export tanpa key; history linear MVP (abaikan `parent_message_id` branching, selalu append).
- Error/edge: provider tidak ada → `ModelNotFound`-style IPC error; key hilang (`get→None`) → `Unauthorized("missing credential, re-enter API key")`; timeout → map ke status; stream cancel → persist message `status:"cancelled"` bukan `done`; base_url self-signed cert internal → surface error jelas (tanpa bypass verify di MVP-0).
- Test: Rust `ipc` test dengan `InMemoryStore` + `conversation-store` tempfile: `create_provider→refresh_models(mock server)→list` tanpa bocor key (assert response JSON tidak mengandung secret substring). Frontend belum diuji di sini.
- Verifikasi: `cargo test -p inference-chat-studio-tauri` (atau nama crate tauri) + `cargo check`.
- Expected: pass, tidak ada `api_key` di snapshot `list_providers`.
- Completion: semua command terdaftar dan dipanggil dari TS types (cek import tidak ada `any` untuk payload IPC).
- Dilarang ubah: `tauri.conf.json` bundler, adapter HTTP body, DB migrasi 0001, `actix-api` (tetap stub false).

### Langkah 7 — Frontend: Provider Manager + Model Selector + Chat linear + Simple settings

- Tujuan: UI minimal yang memaksa capability-aware reasoning.
- Requirement: R1,R3,R4,R5,R6,R10 + F1,F7.
- Dependency: Langkah 6 (IPC + api-types).
- Baca: `packages/api-types/src/index.ts`, `apps/desktop/src/App.tsx`, `src-tauri/src/ipc.rs` (signature saja).
- Ubah (buat):
  - `apps/desktop/src/stores/providerStore.ts` (zustand)
  - `apps/desktop/src/components/ProviderForm.tsx`
  - `apps/desktop/src/components/ModelSelector.tsx`
  - `apps/desktop/src/components/ChatView.tsx`
  - `apps/desktop/src/components/SettingsSimple.tsx`
  - `apps/desktop/src/components/MessageList.tsx`
  - `apps/desktop/src/App.tsx` (layout 2 kolom sesuai konsep)
- Simbol: `useProviderStore`, `ReasoningLevel`, `invoke("refresh_models")`, `listen("chat-chunk")`.
- Kondisi: `App.tsx` skeleton kosong.
- Perubahan:
  1. `providerStore.ts`: state `providers, modelsByProvider, activeProviderId, activeModelId, reasoningLevel, customReasoningJson, statusByProvider`. Action `loadProviders, testConnection, refreshModels`. Jangan simpan secret di store/localStorage.
  2. `ProviderForm.tsx`: field `name, compatibility_type (locked "OpenAI Compatible" di MVP-0, disabled + tooltip "Anthropic menyusul"), base_url, api_key (password), timeout_ms`. Tombol `Test Connection` → tampilkan badge `Connected/Unauthorized/Timeout/InvalidResponse/NotTested`. Validasi: base_url harus `http://|https://`, key non-empty.
  3. `ModelSelector.tsx`: dropdown dari cache + tombol `[Refresh Models] [Add Model Manually]` (input `remote_model_id, display_name`). Tampilkan `manually_added` badge. Jika endpoint offline, tetap tampilkan cache terakhir.
  4. `SettingsSimple.tsx`: hanya `model, reasoning (9 opsi), max_output, system_prompt, temperature, streaming toggle (locked on di MVP-0)`. Reasoning dropdown: jika `supports_reasoning==false` → tampilkan `Not supported by this model` disabled + jangan kirim field. Jika `allowed_reasoning` non-empty → hanya opsi itu + `Automatic/None/Custom` yang enabled. `Custom` → textarea JSON (contoh `{"reasoning_effort":"high"}`) disimpan sebagai preset per-conversation (`settings_json`), bukan re-type tiap pesan.
  5. `ChatView.tsx + MessageList.tsx`: multiline composer, Send/Stop/Regenerate/Edit-resend/Copy, markdown + code block highlight (`react-markdown + highlight.js` — kunci versi di `package.json`), prompt history (ArrowUp). Disclaimer satu baris: `Prompt dikirim ke provider; history tersimpan lokal.` (F7).
- Urutan: `providerStore` → `ProviderForm` → `ModelSelector` → `SettingsSimple` → `ChatView/MessageList` → `App` layout.
- Pertahankan: linear history; ganti model tengah percakapan = lanjut dengan history penuh + tiap assistant message simpan `provider_id/model_id` (jangan overwrite pesan lama).
- Error/edge: reasoning tidak didukung → blokir kirim + tooltip; stream error → tampilkan inline error + tombol `Retry`; edit pesan lama → buat pesan baru setelahnya (jangan hapus respons sebelumnya di MVP-0); paste besar → tetap kirim sebagai text (tanpa attach file di MVP-0).
- Test tambah:
  - Unit (vitest): reasoning gating pure function `availableReasoningOptions(caps)` — input `supports_reasoning=false` → expected hanya `[automatic, none]` + flag `disabled:true`; input allowlist `[low,high]` → expected `medium` disabled.
  - E2E manual checklist (tanpa otomasi browser di MVP-0): tambah provider `http://127.0.0.1:8000/v1` + key dummy → refresh → chat 1 pesan → stop → regenerate.
- Verifikasi: `pnpm --dir apps/desktop test` (vitest) + `pnpm --dir apps/desktop typecheck`.
- Expected: unit pass, typecheck 0 error, tidak ada `localStorage` berisi key (grep).
- Completion: alur New Chat→Send→Stream→Persist jalan melawan mock/local server Chat Completions.
- Dilarang ubah: Rust adapter, DB migrasi, tauri.conf, secret-store.

### Langkah 8 — Raw inspector minimal + diagnostics persist

- Tujuan: diferensiasi diagnostics tanpa scope merambat.
- Requirement: R7.
- Dependency: Langkah 5,6,7.
- Baca: `crates/provider-openai/src/chat.rs`, `src-tauri/src/ipc.rs`, `apps/desktop/src/components/ChatView.tsx`.
- Ubah:
  - `apps/desktop/src/components/Inspector.tsx` (baru)
  - `src-tauri/src/ipc.rs` (tambah field diagnostics di `chat-done`, jangan ubah signature lain)
  - `crates/conversation-store/src/db.rs` (gunakan kolom `raw_provider_data_json, usage_json, duration_ms, ttft_ms, finish_reason` yang sudah ada — dilarang tambah tabel baru)
- Simbol: `InspectorProps {url, method, requestBody, statusCode, responseHeaders, rawEventsCount, usage, durationMs, ttftMs, finishReason, requestId}`.
- Kondisi: belum ada inspector.
- Perubahan:
  1. Rust: ukur `ttft_ms` (waktu chunk pertama) + `duration_ms` total, tangkap `status_code`, `usage` apa adanya (bisa null), `finish_reason`, `provider request id` bila ada header `x-request-id`. Simpan ke message row. Mask `Authorization` dan secret headers (`***`) sebelum persist/emit.
  2. `Inspector.tsx`: 2 tab `Request | Response`. Request: URL, method POST, headers masked, body pretty JSON, compatibility `chat_completions`. Response: status, headers (masked), usage, TTFT/duration, finish reason, event count, raw body truncated 20KB + tombol Copy. Jangan tampilkan full stream 1MB tanpa truncate.
- Urutan: Rust ukur waktu → persist → TS Inspector render.
- Pertahankan: usage hanya tampil jika provider kembalikan; jangan kalkulasi token sendiri.
- Error/edge: usage null → tampilkan `—`; stream cancelled → inspector tandai `cancelled` + duration parsial; body >20KB → truncate + label `truncated`.
- Test: Rust test `chat` mock ukur `ttft_ms <= duration_ms`; TS test `maskHeaders({authorization:"Bearer x"})` → `"Bearer ***"`. Input/expected eksplisit.
- Verifikasi: `cargo test -p provider-openai` + `pnpm --dir apps/desktop test`.
- Expected: pass.
- Completion: setiap assistant message punya inspector terisi tanpa secret bocor.
- Dilarang ubah: schema migrasi, reasoning mapping, bundler config.

### Langkah 9 — Packaging NSIS embedBootstrapper + verifikasi Win10 1809+

- Tujuan: installer manual unsigned yang terinstall di 1809+.
- Requirement: R9 + F8.
- Dependency: Langkah 1,6,7,8 (app runnable).
- Baca: `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, `apps/desktop/package.json`.
- Ubah:
  - `src-tauri/tauri.conf.json` (finalisasi nsis: `installMode=currentUser`, `languages=["en-US"]`, `headerImage` opsional — jangan tambah custom NSIS script di MVP-0)
  - `README-INSTALL.md` (baru, instruksi manual + syarat internet sekali untuk WebView2)
  - Tidak ada code Rust/TS logic di langkah ini.
- Simbol: `tauri build --bundles nsis`.
- Kondisi: config skeleton dari Langkah 1.
- Perubahan:
  1. Kunci `bundle.targets=["nsis"]`, `windows.webviewInstallMode="embedBootstrapper"`. Jangan aktifkan `updater`, `msi`, `portable`.
  2. Build rilis di Windows: `pnpm --dir apps/desktop tauri build --bundles nsis`. Dokumentasikan ukuran artefak + hash SHA256 di release notes manual.
  3. Uji di VM/bare Win10 1809: install per-user tanpa admin → launch → tambah provider local `http://127.0.0.1:8000/v1` → chat → cek `%APPDATA%/com.alamaby.inference-chat-studio/` berisi DB, tidak berisi key plaintext (grep `sk-`/`api_key` kecuali masked).
- Pertahankan: unsigned — Windows SmartScreen akan warning; dokumentasikan sebagai expected, jangan bypass signing dengan hack registry.
- Error/edge: WebView2 download diblokir proxy → installer error harus terlihat + README berisi link runtime manual; WebView2 sudah ada versi lama → bootstrapper update, app tetap launch; path dengan spasi/unicode → data dir via Tauri API tetap aman.
- Test: bukan unit test; checklist instalasi: `install ok, launch ok, offline cache models tampil saat server mati, uninstall bersih (data opsional tersisa dan didokumentasikan)`.
- Verifikasi: `tauri build` exit 0 + installer `.exe` NSIS terhasilkan di `src-tauri/target/release/bundle/nsis/`.
- Expected: 1 file installer NSIS, app terbuka, DB lokal terbuat.
- Completion: README-INSTALL + artefak path terdokumentasi.
- Dilarang ubah: semua `crates/*/src/*.rs` logic, `apps/desktop/src/*` logic, migrasi DB.

### Langkah 10 — Test suite akhir + gate rilis MVP-0

- Tujuan: gate deterministik sebelum serah ke model kecil berikutnya / rilis internal.
- Requirement: semua R1-R10.
- Dependency: Langkah 1-9.
- Baca: semua `Cargo.toml`, `apps/desktop/package.json`, `README-INSTALL.md`.
- Ubah:
  - `.github/workflows/ci-windows.yml` (baru, minimal: `cargo test` + `pnpm typecheck+test` di `windows-latest`)
  - `TEST-CHECKLIST.md` (baru)
- Simbol: `cargo test --workspace`, `cargo clippy -- -D warnings` (opsional tapi direkomendasi), `pnpm typecheck/test`.
- Kondisi: test tersebar per crate.
- Perubahan:
  1. CI hanya `windows-latest`: job `rust` (`cargo test --workspace`), job `web` (`pnpm install --frozen-lockfile`, `typecheck`, `test`). Jangan tambah job Linux/Mac, signing, updater di MVP-0.
  2. `TEST-CHECKLIST.md`: tabel 12 baris: provider CRUD, test 401/timeout, refresh models, manual add, reasoning blocked, chat stream+stop+regenerate, history search/rename/delete/filter, inspector masked, restart app cache tampil, install NSIS 1809, uninstall. Tiap baris kolom `Input | Expected | Actual`.
- Pertahankan: tidak ada auto-update, tidak ada Responses/Anthropic.
- Error/edge: flaky SSE mock → gunakan port acak wiremock; keychain popup di CI → pastikan test pakai InMemory, bukan OS keyring.
- Test: jalankan penuh, bukan tambah logic baru.
- Verifikasi:
  - `cargo test --workspace`
  - `pnpm --dir apps/desktop typecheck`
  - `pnpm --dir apps/desktop test`
- Expected: ketiga command exit 0 di Windows. `clippy` 0 warning bila dijalankan.
- Completion criteria MVP-0 DONE: 3 command hijau + installer NSIS terbuild + checklist 12/12 tercentang manual + grep tidak temukan secret di DB (`SELECT credential_reference` hanya berisi `keyring:...`, tidak ada `sk-`).
- Dilarang ubah: scope (jangan selipkan Responses/Anthropic/tags/branching di langkah ini).

## Risks

- Preset capability salah untuk model baru → mitigasi: manual override + `ReasoningNotSupported` error jelas. Tradeoff diterima vs auto-probe berbayar.
- 8 level + Custom membingungkan → mitigasi: gating UI ketat (Langkah 7). Jangan kurangi diam-diam karena user kunci 8 level.
- embedBootstrapper butuh internet sekali → dokumentasikan; sediakan varian offlineInstaller di luar MVP-0 bila enterprise minta.
- Unsigned NSIS → SmartScreen warning; expected untuk MVP internal.
- rusqlite vs sqlx pilihan sekali di Langkah 2; ganti setelahnya = migrasi ulang. Rekomendasi rusqlite untuk model kecil.

## Progress Log

- 2026-09-28 09:00:00 — Plan MVP-0 dibuat dari analisa + keputusan terkunci (nama, bundle id, NSIS embedBootstrapper, bertahap, 8 level, manual install, unsigned). Repo masih kosong, belum ada implementasi.
- 2026-09-28 — Langkah 1-5 selesai: skeleton workspace, SQLite migrasi 0001, SecretStore, provider-core, provider-openai Chat Completions. Toolchain disiapkan (Rustup stable 1.98, MSVC Build Tools 2022, pnpm 10). Perbaikan: hapus impl Display manual (konflik thiserror), field `publisher` dipindah ke `bundle.publisher`, icon placeholder di-generate via Pillow.
- 2026-09-28 — Langkah 6-8 selesai: IPC Tauri (provider/model/chat/history + cancel), frontend (ProviderForm, ModelSelector, SettingsSimple capability-gated, ChatView linear, ConversationList, Inspector masked + TTFT). TTFT diukur di adapter (first content delta). `map_conversation_row` kini dipakai via list_conversations.
- 2026-09-28 — Langkah 9-10 selesai: installer NSIS `target/release/bundle/nsis/Inference Chat Studio_0.1.0_x64-setup.exe` (4.96 MiB, embedBootstrapper, SHA256 03F7B6B9…). CI Windows (rust + web jobs), TEST-CHECKLIST.md 12 baris. Gate: `cargo test --workspace` 30 pass, `typecheck` 0 error, `vitest` 6 pass, `cargo clippy --workspace --all-targets` 0 warning. Verifikasi install manual di Win10 1809+ dan pengisian kolom Actual checklist tetap tugas manual user (tidak ada VM di lingkungan ini).
- 2026-09-30 — Bugfix Test connection tanpa feedback: `testConnection` tanpa try/catch menelan rejection diam-diam. Ditambah `testingByProvider`/`testErrorByProvider` di store + tombol Testing…/pesan error di ProviderForm + `eprintln! [ipc]` log di `test_connection_cmd`/`refresh_models`. (Belum di-commit.)
- 2026-09-30 — Root-cause "missing credential": keyring 3 tanpa feature `windows-native` diam-diam memakai backend mock in-memory (set Ok, get selalu NoEntry, tidak ada entry di Credential Manager). Fix 1 baris: `keyring = { version="3", features=["windows-native"] }`. Smoke test vault-asli kini lolos (gagal deterministik sebelum fix). Gate: 31 Rust test pass, clippy bersih. Konsekuensi: semua key lama tidak pernah tersimpan — user harus delete + re-add provider setelah rebuild. (Belum di-commit.)
- 2026-09-30 — UX batch: (1) auto-select provider+model pertama via `lib/selection.ts::resolveSelection` (+4 vitest) dipakai di load/refresh/add/setActive/delete — perbaiki bug Send disabled permanen; (2) hint blocker di bawah tombol Send; (3) filter keyword di ModelSelector; (4) tombol Delete provider (+ `clear_conversation_provider` agar delete tidak gagal FK bila ada history, +1 Rust test). Gate: 32 Rust test, 13 vitest, typecheck + clippy bersih. (Belum di-commit.)
- 2026-09-30 — Diagnosis 403: body error provider kini disertakan di pesan 401/403/404 (truncate 2KB, tanpa header secret; +2 Rust test) dan Inspector tampil juga saat chat gagal (`request_url/body` di `chat-error`). Gate: 34 Rust test, 13 vitest, typecheck + clippy bersih. (Belum di-commit.)
- 2026-09-30 — Fase A UI modern: Tailwind v4 + `@tailwindcss/typography`, token terpusat `lib/ui.ts` (card/input/button + dark mode), layout header sticky + sidebar + area chat, bubble user/assistant, inspector collapsible + JSON gelap, scrollbar + font Inter. Semua inline `style` dihapus dari 8 komponen; logika tidak berubah. Gate: typecheck 0, 13 vitest, `vite build` OK. (Belum di-commit.)
- 2026-09-30 — Fase B chat polish: code block ber-header (bahasa + copy, highlight.js github-dark, `lib/codeblock.ts` +5 vitest), streaming caret berkedip, smart auto-scroll + tombol ↓ Latest, error box dismissible (chat + provider), status pill berwarna. Gate: typecheck 0, 18 vitest, `vite build` OK. (Belum di-commit.)
- 2026-09-30 — Fase C micro-interaction: command palette Ctrl+K (pindah model antar-provider, new conversation, devtools; `lib/palette.ts` +4 vitest), animasi masuk pesan + `prefers-reduced-motion`, composer autogrow capped 240px. Gate: typecheck 0, 29 vitest, `vite build` OK. (Belum di-commit.)
- 2026-09-30 — Batch persistensi+markdown: (1) DB pindah ke app-data dir (satu lokasi untuk semua run mode; `INFERENCE_CHAT_STUDIO_DB` tetap override); (2) settings conversation tersimpan/dimuat (`update_conversation_settings` + `serialize/parseConversationSettings` + restore di select/autoload + save tiap send; +1 Rust, +2 vitest); (3) Retry kirim ulang pesan terakhir; (4) tabel markdown via remark-gfm. Gate: 35 Rust test, 31 vitest, typecheck + clippy bersih. (Belum di-commit.)
- 2026-09-30 — Fitur bookmark: seleksi teks di respons → klik kanan → "Bookmark here" (menu custom, WebView tak punya bawaan); rel kanan berisi label 20 karakter; klik → scroll ke bagian + flash kuning (fallback: scroll ke bubble bila anchor tak cocok). Jangkar `{message_id, anchor_text}`; migrasi 0002 + CRUD + 3 IPC; `ChatMsg.id` dialirkan dari backend; bookmark ikut conversation (cascade delete, dimuat per-conversation). Gate: 37 Rust test, 35 vitest, typecheck + clippy bersih. (Belum di-commit.)
- 2026-09-30 — Root-cause 4 gejala sekaligus (history kosong, settings NULL, bookmark error): argumen IPC multi-kata wajib camelCase di sisi JS (macro Tauri default Camel; param Option yang salah nama diam-diam jadi None). Diperbaiki 5 call site (list_messages/bookmarks, create_conversation/bookmark, update settings) + 4 regression test mock-invoke. Catatan: conversation lama ("test") berbaris NULL — hapus + buat ulang agar settings tersimpan benar. Gate: typecheck 0, 39 vitest. (Belum di-commit.)
- 2026-09-30 — Bugfix respons double: race StrictMode (promise `listen()` resolve setelah cleanup → listener bocor) diperbaiki dengan guard `cancelled` + dedup `stream_id` di ref. Sekalian: klik judul conversation memuat pesannya (`list_messages_cmd` baru + `decodeContent`/`toChatMsg` +4 vitest), dan Send auto-buat conversation bila belum ada (gantikan fallback `"local"` yang melanggar FK). Gate: 34 Rust test, 22 vitest, typecheck + clippy bersih. (Belum di-commit.)
- 2026-09-30 — Batch 4 item: (1) tab Metrics di Inspector (`lib/metrics.ts`: input/output/reasoning/total tokens + tok/s + TTFT/durasi, "—" bila provider tak melapor; +3 vitest); (2) buka app otomatis lanjutkan conversation terbaru (pesan dimuat di `loadConversations`); (3) Retry benar-benar kirim ulang pesan user terakhir (`sendText`/`retry`, bukan draft kosong); (4) field model manual berlabel jelas + penjelasan kapan dipakai. Gate: typecheck 0, 25 vitest. (Belum di-commit.)

## Notes

- Perintah yang mengubah repo dilarang kecuali file plan ini. Model pelaksana hanya boleh buat/ubah file yang disebut di tiap langkah, dalam urutan yang disebut.
- Jangan kirim field JSON null ke provider; gunakan `skip_serializing_if`.
- Jangan log/print API key, Authorization value, atau seluruh `process.env`. Masking wajib di inspector dan log.
- Actix tetap stub `is_enabled()==false` selama MVP-0.
- Open question (bukan blocker MVP-0, jangan pilih diam-diam):
  1. `ExtraHigh` wire value: dipakai `xhigh` (usulan plan) vs `extra_high`? Opsi: ikut konvensi OpenAI `xhigh`. Risiko: model tertentu tolak. Rekomendasi: `xhigh` + Custom override. Perlu konfirmasi saat integrasi model nyata pertama.
  2. `Maximum` wire value: `max` vs `maximal`? Rekomendasi `max`. Sama seperti di atas.
  3. Jumlah level: user kunci 8 tetapi daftar + Custom = 9 varian enum. Plan asumsikan 8 + Custom. Konfirmasi penamaan final sebelum docs publik.

## Handoff Checklist (untuk model kecil)

- [ ] Baca Langkah 1 → buat skeleton persis, verifikasi `cargo check` + `typecheck`.
- [ ] Kerjakan berurutan 1→10, jangan loncat (dependency linear kecuali 3 dan 4 bisa paralel setelah 1).
- [ ] Setiap langkah: baca file yang disebut, ubah hanya file yang disebut, jalankan command verifikasi yang disebut, penuhi completion criteria sebelum lanjut.
- [ ] Setiap finding scope harus punya test hijau yang disebut di langkahnya.
- [ ] Jika temui open question di Notes: hentikan langkah terkait, catat pilihan + bukti (response provider nyata), jangan tebak diam-diam.
- [ ] Dilarang: tambah Responses/Anthropic adapter, aktifkan Actix server, tambah updater/signing, tambah tabel/kolom di luar 0001_init.sql, simpan secret di SQLite/localStorage/log.
- [ ] Selesai: serahkan `cargo test --workspace` log + `typecheck/test` log + path installer NSIS + TEST-CHECKLIST terisi 12/12.
