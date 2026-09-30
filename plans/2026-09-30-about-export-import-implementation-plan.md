# About + Export/Import Backup Implementation Plan

Created: 2026-09-30 07:00:00

## Objective
Menambah menu About (menampilkan versi semver + build number yang dipakai saat build) dan cara export/import konfigurasi provider dan model + chat history, tanpa membocorkan secret API key.

Keputusan user yang sudah final:
- Versi memakai semantic versioning, sumber tunggal `src-tauri/Cargo.toml` (`CARGO_PKG_VERSION`).
- Build number = `git rev-list --count HEAD` saat build (fallback env `ICS_BUILD_NUMBER`), otomatis tanpa input manual.
- Satu file backup gabungan `ics-backup-v1.json`, import mode merge saja (tidak ada replace destruktif).

## Scope
- `src-tauri/build.rs`, `src-tauri/src/ipc.rs`, `src-tauri/src/main.rs`
- `packages/api-types/src/index.ts`
- Frontend baru: `apps/desktop/src/lib/backup.ts`, `apps/desktop/src/components/AboutDialog.tsx`, `apps/desktop/src/components/DataBackup.tsx`, wiring di `apps/desktop/src/App.tsx`
- Test Rust + vitest baru
- In scope: About dialog, export/import provider (tanpa secret), model, conversation + message + bookmark.
- Out of scope: enkripsi backup, mode import replace, plugin dialog/fs Tauri, updater/signing, perubahan schema DB (tidak ada migrasi baru).

## Milestones
1. Build metadata + `get_app_info` (About punya sumber data)
2. `export_backup` / `import_backup` backend (merge, tanpa secret)
3. Types + lib validasi frontend
4. UI About + DataBackup + wiring
5. Test + verifikasi penuh

## Requirement Traceability
- R1 About menampilkan versi semver saat build -> Langkah 1, 2, 5, 7
- R2 About menampilkan build number saat build -> Langkah 1, 2, 5, 7
- R3 Export konfigurasi provider (tanpa api_key) -> Langkah 3, 5, 6, 8
- R4 Export model (cache + manual) -> Langkah 3, 5, 6, 8
- R5 Export chat history (conversation+message+bookmark) -> Langkah 3, 5, 6, 8
- R6 Import merge dari file backup, tanpa secret, user isi ulang key -> Langkah 4, 5, 6, 8
- R7 Tidak ada regresi IPC/store yang ada -> semua langkah + Langkah 9 verifikasi

## Tasks
- [x] Langkah 0 — Baseline read-only (tanpa ubah file)
- [x] Langkah 1 — `build.rs`: embed version/build metadata
- [x] Langkah 2 — IPC `get_app_info`
- [x] Langkah 3 — IPC `export_backup`
- [x] Langkah 4 — IPC `import_backup` (merge)
- [x] Langkah 5 — api-types: `AppInfo` + `BackupFile` types
- [x] Langkah 6 — `lib/backup.ts`: validasi + serialize
- [x] Langkah 7 — `AboutDialog.tsx` + wiring header
- [x] Langkah 8 — `DataBackup.tsx` + wiring sidebar
- [x] Langkah 9 — Test + verifikasi + TEST-CHECKLIST

---

## Langkah 0 — Baseline read-only (tanpa ubah file)

- Tujuan langkah: memastikan pelaksana memahami kondisi awal persis sebelum mengubah apa pun.
- Finding/requirement: prasyarat semua langkah; tidak menyelesaikan R apapun langsung.
- Dependency: tidak ada.
- File yang harus dibaca:
  - `src-tauri/build.rs` (seluruh file, 3 baris)
  - `src-tauri/Cargo.toml` (blok `[package]`, field `version`)
  - `src-tauri/tauri.conf.json` (field `version`, `productName`)
  - `src-tauri/src/main.rs` (seluruh file, ±67 baris; daftar `invoke_handler`)
  - `src-tauri/src/ipc.rs` baris 1-70 (state), 119-135 (`ProviderDto`, `api_key: None`), 343-484 (provider commands incl. `export_provider`), 953-978 (`open_devtools`, re-export, awal `mod tests`)
  - `crates/conversation-store/src/db.rs` fungsi `list_providers`, `list_models_by_provider`, `list_conversations`, `list_messages_by_conversation`, `list_bookmarks_by_conversation`, `insert_provider`, `upsert_model`, `insert_conversation`, `insert_message`, `insert_bookmark`
  - `packages/api-types/src/index.ts` (seluruh file)
  - `apps/desktop/src/App.tsx`, `apps/desktop/src/lib/errors.ts`, `apps/desktop/src/lib/ui.ts`, `apps/desktop/src/components/Collapsible.tsx`
- File yang harus diubah: tidak ada.
- Simbol terkait: tidak ada (hanya observasi).
- Kondisi implementasi saat ini: versi `0.1.0` duplikat di 4 file; belum ada build number; belum ada IPC app-info/backup; `export_provider` tidak mengembalikan secret; belum ada UI About/backup.
- Perubahan konkret: tidak ada perubahan file. Hanya membaca.
- Behavior yang harus dipertahankan: tidak ada yang berubah.
- Error handling/edge case: tidak ada.
- Test: tidak ada.
- Command verifikasi: tidak ada (jangan jalankan dulu agar baseline bersih).
- Completion criteria: pelaksana bisa menyebutkan dari memori: versi ada di 4 file, `invoke_handler` berisi 22 command existing, `ProviderDto.api_key` selalu `None`, tidak ada kolom secret di DB.
- Tidak boleh diubah: semua file repo.

## Langkah 1 — `build.rs`: embed version/build metadata

- Tujuan langkah: menyediakan versi semver + build number + git sha + waktu build sebagai env saat kompilasi.
- Menyelesaikan: R1, R2 (sumber data).
- Dependency: Langkah 0.
- File yang harus dibaca: `src-tauri/build.rs`, `src-tauri/Cargo.toml` (5 baris pertama).
- File yang harus diubah: `src-tauri/build.rs` (satu-satunya file langkah ini).
- Simbol terkait: `tauri_build::build()`, env baru `ICS_BUILD_NUMBER`, `ICS_GIT_SHA`, `ICS_BUILD_TIME`; `CARGO_PKG_VERSION` (otomatis dari Cargo, tidak perlu di-set manual).
- Kondisi saat ini:
  ```rust
  fn main() {
      tauri_build::build()
  }
  ```
- Perubahan konkret (urutan di dalam file):
  1. Di atas `tauri_build::build()`, tambah helper `fn git(args: &[&str]) -> Option<String>` yang menjalankan `std::process::Command::new("git").args(args).output()`, return `None` jika gagal/non-UTF8/kosong (jangan `expect`/`unwrap`).
  2. Emit `println!("cargo:rerun-if-env-changed=ICS_BUILD_NUMBER")`, `cargo:rerun-if-changed=.git/HEAD`, `cargo:rerun-if-changed=.git/refs/heads/`.
  3. `ICS_BUILD_NUMBER`: baca `std::env::var("ICS_BUILD_NUMBER")`; jika absen/tidak numerik, fallback `git(["rev-list","--count","HEAD"])` trim; jika masih gagal, string `"0"`. Emit `cargo:rustc-env=ICS_BUILD_NUMBER=...`.
  4. `ICS_GIT_SHA`: fallback `git(["rev-parse","--short","HEAD"])` trim, gagal -> `"unknown"`. Emit `cargo:rustc-env=ICS_GIT_SHA=...`.
  5. `ICS_BUILD_TIME`: `std::time::SystemTime::now()` format RFC3339 detik via `chrono`? `build-dependencies` belum ada chrono — JANGAN tambah dependency; gunakan epoch detik `as_secs()` string. Emit `cargo:rustc-env=ICS_BUILD_TIME=...`. (Label UI nanti "build time (epoch)"; dokumentasikan di plan Notes.)
  6. Terakhir panggil `tauri_build::build()` seperti semula.
- Behavior yang harus dipertahankan: build tetap sukses tanpa git (mis. source archive) dan tanpa env; tidak ada panic di build script.
- Error handling/edge case:
  - git tidak terinstal / bukan repo / HEAD detached -> fallback `"0"` / `"unknown"`, build tetap lanjut.
  - `ICS_BUILD_NUMBER` non-numerik (mis. `"abc"`) -> abaikan, pakai commit count; jika commit count non-numerik -> `"0"`.
  - Jangan print secret apa pun.
- Test: belum ada test khusus (build script sulit di-unit-test); verifikasi via Langkah 2 test `get_app_info` (assert `build_number` numerik-or-"0", `version` cocok semver).
- Command verifikasi: `cargo check -p inference-chat-studio-tauri` dari root workspace. Hasil yang diharapkan: sukses tanpa warning baru (warning pre-existing boleh).
- Completion criteria: `cargo check` sukses dengan dan tanpa env `ICS_BUILD_NUMBER`; `option_env!("ICS_BUILD_NUMBER")` tersedia untuk Langkah 2.
- Tidak boleh diubah: `src-tauri/Cargo.toml`, `tauri.conf.json`, file `crates/*`, file frontend apa pun.

## Langkah 2 — IPC `get_app_info`

- Tujuan langkah: mengekspos versi + build metadata ke frontend lewat satu command.
- Menyelesaikan: R1, R2 (kontrak IPC).
- Dependency: Langkah 1.
- File yang harus dibaca: `src-tauri/src/ipc.rs` baris 1-115 (imports, `IpcError`, `From` impls), 965-978 (`open_devtools` sebagai contoh command sederhana + pola return `Result<_, IpcError>`); `src-tauri/src/main.rs` baris 20-42 (`invoke_handler` list).
- File yang harus diubah:
  1. `src-tauri/src/ipc.rs` (tambah struct + command + test)
  2. `src-tauri/src/main.rs` (satu baris registrasi)
- Simbol terkait: struct baru `AppInfo { name, version, build_number, git_sha, build_time, tauri_version }` (derive `Serialize, Deserialize, Clone, Debug`); `#[tauri::command] pub async fn get_app_info() -> Result<AppInfo, IpcError>` (tanpa argumen, tanpa `State`); handler list di `main.rs`.
- Kondisi saat ini: `invoke_handler!` berisi 22 command, belum ada `get_app_info`; tidak ada struct `AppInfo`.
- Perubahan konkret (urutan di dalam file `ipc.rs`):
  1. Letakkan struct `AppInfo` + fn `get_app_info` tepat setelah `open_devtools` (setelah baris 974, sebelum baris 976 `pub use tauri as _tauri_reexport`), agar diff terlokalisir.
  2. Isi field: `name: "Inference Chat Studio"`, `version: env!("CARGO_PKG_VERSION")`, `build_number: option_env!("ICS_BUILD_NUMBER").unwrap_or("0")`, `git_sha: option_env!("ICS_GIT_SHA").unwrap_or("unknown")`, `build_time: option_env!("ICS_BUILD_TIME").unwrap_or("unknown")`, `tauri_version: tauri::VERSION` (jika `tauri::VERSION` tidak tersedia di versi dipakai, fallback string literal versi tauri dari `Cargo.toml`, mis. `"2"` — cek saat implementasi, jangan tebak; gunakan yang kompilasi).
  3. Di `main.rs`, tambah `ipc::get_app_info,` di akhir daftar handler setelah `ipc::open_devtools,` (satu baris, koma di ujung).
  4. Tambah unit test di `mod tests` (akhir `ipc.rs`): `app_info_version_is_semver` — panggil `get_app_info().await.unwrap()`, assert `version` cocok pola `major.minor.patch` (split `.`, 3 bagian numerik), assert `build_number` either numerik atau `"0"`, assert `name` non-empty. Test harus `#[tokio::test] async` (command-nya async) — contoh test existing sinkron; gunakan `#[tokio::test]` khusus test ini.
- Behavior yang harus dipertahankan: semua 22 command existing tidak berubah signature/perilaku; `IpcError` tidak berubah.
- Error handling/edge case: command ini tidak pernah error dalam praktik (semua sumber punya fallback) — tetap return `Result` demi konsistensi kontrak frontend `formatIpcError`.
- Test yang harus ditambahkan: `app_info_version_is_semver` (input: tidak ada; expected: pass, version=`0.1.0` saat ini, build_number numerik-or-"0").
- Command verifikasi: `cargo test -p inference-chat-studio-tauri app_info` . Hasil yang diharapkan: 1 passed.
- Completion criteria: test hijau; `cargo check` workspace bersih; frontend bisa `invoke("get_app_info")` (dipakai Langkah 7).
- Tidak boleh diubah: logika provider/model/chat/conversation apa pun di `ipc.rs`; `crates/*`; `capabilities/default.json`; frontend.

## Langkah 3 — IPC `export_backup`

- Tujuan langkah: menghasilkan satu JSON backup lengkap (provider tanpa secret + model + conversation + message + bookmark) dari DB.
- Menyelesaikan: R3, R4, R5 (sisi backend).
- Dependency: Langkah 0 (tidak butuh Langkah 1/2, tapi kerjakan setelah Langkah 2 agar urutan diff logis).
- File yang harus dibaca: `src-tauri/src/ipc.rs` baris 14-23 (imports `Db`, row types), 468-484 (`export_provider` pola JSON + komentar `api_key` null), 574-587 (`list_models_cmd`), 653-658 (`list_conversations`), 694-700 (`list_messages_cmd`), 722-728 (`list_bookmarks_cmd`); `crates/conversation-store/src/db.rs` signature kelima fungsi `list_*` + struct `ProviderRow/ModelRow/ConversationRow/MessageRow/BookmarkRow`.
- File yang harus diubah: `src-tauri/src/ipc.rs` saja (tambah struct + command + test). `main.rs` registrasi ikut Langkah 4 sekaligus (dua baris) ATAU daftarkan di langkah ini — pilih: daftarkan `export_backup` di langkah ini, `import_backup` di Langkah 4 (satu baris masing-masing, hindari lupa).
- Simbol terkait: struct baru `BackupFile { format: String, version: u32, exported_at: String, app_version: String, providers: Vec<BackupProvider>, models: Vec<ModelRow>, conversations: Vec<BackupConversation> }`, `BackupProvider { id, name, base_url, compatibility_type, api_mode, additional_headers_json, default_model_id, enabled, created_at, updated_at }` (SENGAJA tanpa `credential_reference` dan tanpa `api_key`), `BackupConversation { conversation: ConversationRow, messages: Vec<MessageRow>, bookmarks: Vec<BookmarkRow> }`; `#[tauri::command] pub async fn export_backup(state: State<'_, AppState>) -> Result<BackupFile, IpcError>`.
- Kondisi saat ini: tidak ada struct backup; export hanya per-provider tanpa secret.
- Perubahan konkret (urutan di dalam `ipc.rs`):
  1. Struct backup diletakkan tepat sebelum `export_provider` (sebelum baris 467) agar konteks "tanpa secret" berdekatan.
  2. Command `export_backup` diletakkan tepat setelah `export_provider` (setelah baris 484).
  3. Implementasi: `state.db.list_providers()` -> petakan ke `BackupProvider` (copy semua field kecuali secret; JANGAN sertakan `credential_reference`); untuk tiap provider `list_models_by_provider(&id)` kumpulkan ke satu `Vec<ModelRow>`; `list_conversations()` -> untuk tiap conversation `list_messages_by_conversation` + `list_bookmarks_by_conversation`; `exported_at = now_rfc3339()` (helper existing baris 235); `app_version = env!("CARGO_PKG_VERSION")`; `format = "ics-backup"`, `version = 1`.
  4. Jangan mengubah `export_provider`, `list_*` existing.
- Behavior yang harus dipertahankan: `list_providers`/`export_provider` tetap tidak membocorkan secret; urutan: providers `created_at ASC` (ikut DB), conversations `updated_at DESC` (ikut DB), messages `created_at ASC` (ikut DB) — jangan re-sort di Rust.
- Error handling/edge case:
  - DB kosong -> return backup valid dengan vec kosong (bukan error).
  - Gagal di tengah (I/O) -> propagasi `IpcError` via `?` (mapping `From<StoreError>` existing); tidak ada partial JSON.
  - Ukuran besar (ribuan message) -> tidak ada pagination di MVP; dokumentasikan limit di Notes plan (frontend `JSON.stringify` + `invoke` payload besar).
- Test yang harus ditambahkan di `mod tests` (`ipc.rs` bawah):
  - `export_backup_excludes_secrets`: buat state in-memory (`test_state()` helper existing), insert 1 provider DENGAN `credential_reference: Some("keyring:test")`, 1 model, 1 conversation + 1 message + 1 bookmark (gunakan struct Row langsung + `db.insert_*`); panggil `export_backup` — butuh `State`: bangun via `tauri::test`? Jika sulit, uji fungsi mapper murni sebagai gantinya: pisahkan `fn to_backup_provider(row: &ProviderRow) -> BackupProvider` (pure) dan test itu + test serialisasi `BackupFile` tidak mengandung substring `"keyring"` maupun `"api_key"` setelah `serde_json::to_string`. Expected: pass, JSON tidak mengandung kedua substring.
  - Minimal satu test roundtrip ada di Langkah 4 (export->import).
- Command verifikasi: `cargo test -p inference-chat-studio-tauri backup` . Hasil yang diharapkan: semua test backup passed.
- Completion criteria: `export_backup` terdaftar di `invoke_handler`, test hijau, JSON tidak memuat secret.
- Tidak boleh diubah: `crates/*` (tidak ada migrasi), `delete_provider`/`clear_conversation_provider` behavior, frontend.

## Langkah 4 — IPC `import_backup` (merge, tanpa secret)

- Tujuan langkah: mengimpor file backup ke DB sebagai data BARU (ID baru), tanpa menulis secret apa pun ke secret-store.
- Menyelesaikan: R6.
- Dependency: Langkah 3 (struktur `BackupFile` harus ada).
- File yang harus dibaca: `src-tauri/src/ipc.rs` hasil Langkah 3 (struct backup), baris 235-237 (`now_rfc3339`), 343-383 (`create_provider` pola insert + secret — JANGAN tiru bagian secret-nya), 177-197 `db.rs` (`insert_provider` + `validate_provider`: menolak `api_mode != chat_completions`, nama kosong).
- File yang harus diubah: `src-tauri/src/ipc.rs` (command + test) + `src-tauri/src/main.rs` (satu baris registrasi `ipc::import_backup,`).
- Simbol terkait: `#[tauri::command] pub async fn import_backup(state: State<'_, AppState>, backup: BackupFile) -> Result<ImportSummary, IpcError>`; struct `ImportSummary { providers: usize, models: usize, conversations: usize, messages: usize, bookmarks: usize }`; helper pure `fn validate_backup(b: &BackupFile) -> Result<(), IpcError>`.
- Kondisi saat ini: belum ada import; `insert_provider` memvalidasi `api_mode`/`name`/`base_url`.
- Perubahan konkret (urutan di `ipc.rs`):
  1. `ImportSummary` + `validate_backup` sebelum command; command tepat setelah `export_backup`.
  2. `validate_backup`: tolak jika `format != "ics-backup"` (code `validation`, msg `unsupported backup format: {format}`), jika `version != 1` (msg `unsupported backup version: {version}`), jika providers/conversations melebihi cap `10_000`/`50_000` (msg `backup too large`), jika ada provider dengan `name` kosong (msg `provider name must not be empty`). Validasi SEMUA dulu sebelum tulis apa pun (all-or-nothing gate).
  3. Import providers: untuk tiap `BackupProvider`, generate `new_id = uuid::Uuid::new_v4()`, simpan peta `old_id -> new_id` (catatan: `BackupProvider` perlu field `id` lama agar mapping conversation/model bisa jalan — tambahkan `pub id: String` di struct Langkah 3; jika Langkah 3 sudah dikerjakan tanpa `id`, tambahkan di langkah ini). `credential_reference: None`, `enabled: p.enabled`, timestamp: PERTAHANKAN `created_at/updated_at` asli (fidelitas history). Validasi `api_mode == "chat_completions"` else skip provider itu + semua model/conversation yang menunjuknya? Keputusan deterministik: SKIP + hitung sebagai 0 (jangan error total) HANYA untuk kasus `api_mode` tak dikenal; untuk `name` kosong sudah ditolak di gate. Dokumentasikan di kode dengan komentar 2 baris.
  4. Import models: `ModelRow` baru dengan `id` baru, `provider_id = mapped`, pertahankan `remote_model_id/display_name/capabilities_json/manually_added/available/first_seen_at/last_seen_at`; panggil `upsert_model`. Jika `provider_id` tidak termapping (ter-skip) -> skip model.
  5. Import conversations: `id` baru, `provider_id` = mapped ATAU `None` jika provider diskip/tidak ada; pertahankan semua field lain + timestamps. Lalu messages: `id` baru, `conversation_id` baru, pertahankan semua payload; bookmarks: `id` baru, `conversation_id` baru, `message_id` = mapped message id baru (peta `old_msg -> new_msg` per conversation); jika bookmark menunjuk message yang tidak ada di backup -> SKIP bookmark itu (jangan error).
  6. JANGAN sentuh `state.secrets` sama sekali di fungsi ini (tidak ada `set`/`get`/`delete`).
  7. Kembalikan `ImportSummary` dengan count sukses.
- Behavior yang harus dipertahankan: data existing TIDAK dihapus/diupdate (merge murni); `delete_provider`/`clear_conversation_provider` tidak dipanggil; secret-store tidak berubah.
- Error handling/edge case:
  - Duplikat nama provider -> boleh (tidak ada unique constraint nama); jangan dedup diam-diam.
  - `UNIQUE(provider_id, remote_model_id)` pada model: karena `provider_id` baru, tidak konflik dengan existing — aman.
  - ID tabrakan (praktis mustahil, UUIDv4) -> biarkan error DB propagasi sebagai `IpcError{code: store}`.
  - `content_json`/`settings_json` arbitrary string -> pertahankan verbatim, jangan parse.
- Test di `mod tests`:
  - `import_backup_merges_with_new_ids`: seed DB dengan 1 provider existing; bangun `BackupFile` inline (1 provider `id:"old-p"`, 1 model, 1 conversation + 2 message + 1 bookmark valid); panggil `import_backup` via state in-memory; expected: `summary == {providers:1, models:1, conversations:1, messages:2, bookmarks:1}`, `list_providers().len()==2`, provider import punya `credential_reference: None`, conversation import `provider_id` menunjuk ID baru (bukan `"old-p"`).
  - `import_backup_rejects_bad_format`: `format:"other"`, expected `Err` code `validation`.
  - `import_backup_skips_dangling_bookmark`: bookmark `message_id:"missing"`; expected summary `bookmarks:0`, tidak error.
  - `import_backup_never_touches_secrets`: tidak ada API untuk assert langsung; yakinkan via code review + fakta tidak ada referensi `secrets` di fungsi (catat di PR). Test tidak perlu.
- Command verifikasi: `cargo test -p inference-chat-studio-tauri backup` + `cargo test -p conversation-store` . Hasil yang diharapkan: semua passed (30 test pre-existing + 4-5 baru).
- Completion criteria: 3 test baru hijau; tidak ada `secrets` di path import; registrasi handler lengkap.
- Tidak boleh diubah: `crates/*`, `create_provider`/`update_provider`, `stream_chat_cmd`, frontend.

## Langkah 5 — api-types: `AppInfo` + `BackupFile` types

- Tujuan langkah: kontrak tipe TS cermin Rust agar frontend tidak menduplikasi string literal.
- Menyelesaikan: fondasi R1-R6 sisi frontend.
- Dependency: Langkah 2 + 3 + 4 (field harus cermin final Rust).
- File yang harus dibaca: `packages/api-types/src/index.ts` (seluruh file, 128 baris; pola `interface` + `export type`); hasil akhir struct Rust `AppInfo/BackupFile/BackupProvider/BackupConversation/ImportSummary`.
- File yang harus diubah: `packages/api-types/src/index.ts` saja (append di akhir, JANGAN ubah 128 baris existing).
- Simbol terkait: `AppInfo`, `BackupProvider`, `BackupModel` (alias bentuk `ModelRow`: `{id, provider_id, remote_model_id, display_name, capabilities_json, manually_added, available, first_seen_at, last_seen_at}`), `BackupConversation { conversation: ConversationRowLite, messages: MessageRowLite[], bookmarks: BookmarkDto[] }`, `BackupFile`, `ImportSummary`. `ConversationRowLite/MessageRowLite` = interface dengan SEMUA field DB (lihat `db.rs` struct) agar roundtrip verbatim.
- Kondisi saat ini: file hanya berisi provider/model/chat/bookmark types; belum ada AppInfo/Backup.
- Perubahan konkret (urutan append di akhir file, setelah `BookmarkDto` baris 121-128):
  1. `export interface AppInfo { name: string; version: string; build_number: string; git_sha: string; build_time: string; tauri_version: string; }`
  2. `export interface BackupProvider { id: string; name: string; base_url: string; compatibility_type: string; api_mode: string; additional_headers_json?: string | null; default_model_id?: string | null; enabled: boolean; created_at: string; updated_at: string; }` (SENGAJA tanpa `credential_reference`/`api_key`; tambah komentar 1 baris).
  3. `BackupModel`, `BackupConversationPayload` (conversation fields), `BackupMessage` (message fields), `BackupFile { format: string; version: number; exported_at: string; app_version: string; providers: BackupProvider[]; models: BackupModel[]; conversations: BackupConversation[]; }`, `ImportSummary`.
  4. Nama field snake_case SAMA PERSIS dengan Rust agar `invoke`/`JSON.parse` tanpa mapping.
- Behavior yang harus dipertahankan: tidak ada export existing yang diubah/dihapus; import path existing (`../../../../packages/api-types/src/index`) tetap valid.
- Error handling: tidak ada (tipe saja).
- Test: tidak ada (dicakup test `backup.test.ts` Langkah 6 yang mengimpor tipe ini).
- Command verifikasi: `pnpm --filter inference-chat-studio-desktop typecheck` . Hasil yang diharapkan: clean.
- Completion criteria: typecheck hijau; tidak ada `any` baru.
- Tidak boleh diubah: Rust apa pun; komponen/store existing.

## Langkah 6 — `lib/backup.ts`: validasi + serialize frontend

- Tujuan langkah: satu modul murni untuk validasi file backup di frontend sebelum dikirim ke backend (gagal cepat dengan pesan jelas) + helper download/upload.
- Menyelesaikan: fondasi R3-R6 sisi frontend.
- Dependency: Langkah 5.
- File yang harus dibaca: `apps/desktop/src/lib/errors.ts` (pola `formatIpcError`), `apps/desktop/src/lib/conversation.ts` (pola parse/serialize + test pendamping `conversation.test.ts` sebagai contoh gaya test), `packages/api-types/src/index.ts` (tipe baru).
- File yang harus diubah/dibuat:
  1. BUAT `apps/desktop/src/lib/backup.ts`
  2. BUAT `apps/desktop/src/lib/backup.test.ts`
- Simbol terkait: `validateBackupFile(data: unknown) => { ok: true; value: BackupFile } | { ok: false; error: string }`, `parseBackupJsonText(text: string) => ...` (bungkus `JSON.parse` + panggil validate), `buildBackupFilename(appVersion: string, d?: Date) => string`, `downloadBackupFile(backup: BackupFile) => void` (Blob + `URL.createObjectURL` + anchor click; nama dari `buildBackupFilename`).
- Kondisi saat ini: file belum ada; belum ada helper file.
- Perubahan konkret (`backup.ts`, urutan fungsi: konstanta dulu, lalu validator, lalu parser, lalu download/filename):
  1. `export const BACKUP_FORMAT = "ics-backup"; export const BACKUP_VERSION = 1; export const MAX_PROVIDERS = 10_000; export const MAX_CONVERSATIONS = 50_000;` (cap SAMA dengan Rust Langkah 4).
  2. `isRecord(v)`, `isString`, lalu `validateBackupFile`: cek `format === "ics-backup"` (else `"unsupported backup format"`), `version === 1` (else `"unsupported backup version"`), array check + cap untuk `providers/models/conversations`, tiap provider wajib `id/name/base_url` string non-empty + `base_url` match `/^https?:\/\//` (else `"provider[<i>]: ..."`, `"provider[<i>].base_url must start with http:// or https://"`), tiap conversation wajib `conversation.id` + `messages` array + `bookmarks` array; tiap bookmark wajib `id/conversation_id/message_id` string. TIDAK perlu validasi dalam message payload (verbatim). JANGAN tolak field tambahan (forward-compat: abaikan unknown fields).
  3. `parseBackupJsonText`: try/catch `JSON.parse` -> `{ok:false, error:"invalid JSON: "+msg}`; teruskan ke `validateBackupFile`.
  4. `buildBackupFilename`: `ics-backup-${appVersion}-${YYYYMMDD-HHmmss}.json` (angka saja, tanpa `:` agar aman di Windows).
  5. `downloadBackupFile`: `new Blob([JSON.stringify(backup,null,2)],{type:"application/json"})`, buat `<a>`, `a.download`, click, `revokeObjectURL`. Bungkus try/catch -> throw `Error("failed to download backup")`.
- Behavior yang harus dipertahankan: tidak ada state global; fungsi murni kecuali `downloadBackupFile` (DOM).
- Error handling/edge case:
  - `null`/array/string sebagai root -> `"backup must be an object"`.
  - JSON 200MB -> biarkan browser OOM? Tidak; cap array di atas + pesan `"backup too large"` sebelum render.
  - Secret bocor: jika JSON mengandung key `api_key`/`credential_reference` di provider (file dari sumber tak dikenal), JANGAN error — abaikan saat kirim? Keputusan: validator memberi `ok:true` tapi `downloadBackupFile` tidak pernah menulis secret (sumbernya dari backend yang sudah bersih). Untuk import, backend mengabaikan field unknown via serde default — catat di komentar.
- Test (`backup.test.ts`, gaya vitest existing, minimal 6 kasus):
  1. valid minimal `{format,version:1,exported_at,app_version,providers:[{id:"p",name:"N",base_url:"https://x",compatibility_type:"openai",api_mode:"chat_completions",enabled:true,created_at:"t",updated_at:"t"}],models:[],conversations:[]}` -> `ok:true`.
  2. `format:"other"` -> `ok:false`, error mengandung `unsupported backup format`.
  3. `version:2` -> error mengandung `unsupported backup version`.
  4. provider `base_url:"ftp://x"` -> error mengandung `base_url`.
  5. text bukan JSON `"{"` -> `parseBackupJsonText` error mengandung `invalid JSON`.
  6. `buildBackupFilename("0.1.0", new Date("2026-01-02T03:04:05Z"))` -> `"ics-backup-0.1.0-20260102-030405.json"`.
- Command verifikasi: `pnpm --filter inference-chat-studio-desktop test` (vitest run) + `typecheck`. Hasil yang diharapkan: 6 pre-existing + 6 baru = 12 passed; typecheck clean.
- Completion criteria: semua test baru hijau; tidak ada `any`.
- Tidak boleh diubah: `providerStore.ts`, komponen apa pun, Rust.

## Langkah 7 — `AboutDialog.tsx` + wiring header

- Tujuan langkah: menu About yang menampilkan versi + build number aktual saat build.
- Menyelesaikan: R1, R2 (UI).
- Dependency: Langkah 2 (IPC) + Langkah 5 (tipe `AppInfo`).
- File yang harus dibaca: `apps/desktop/src/App.tsx` baris 1-57 (imports, `openDevtools`, header block), `apps/desktop/src/lib/errors.ts` (`formatIpcError`), `apps/desktop/src/lib/ui.ts` (`btn`, `card`), `apps/desktop/src/components/Collapsible.tsx` BUKAN dipakai (dialog, bukan collapsible).
- File yang harus diubah/dibuat:
  1. BUAT `apps/desktop/src/components/AboutDialog.tsx`
  2. EDIT `apps/desktop/src/App.tsx` (tambah tombol + state + render dialog)
- Simbol terkait: `AboutDialog({ open, onClose }: { open: boolean; onClose: () => void })`, internal `useState<AppInfo|null>`, `useState<string|null> error`, `useEffect` fetch saat `open` true via `invoke<AppInfo>("get_app_info")`; di `App.tsx`: `const [aboutOpen, setAboutOpen] = useState(false)` + tombol.
- Kondisi saat ini: header berisi judul + tombol DevTools; tidak ada dialog; tidak ada `useState` di `App.tsx` (hanya `useEffect`).
- Perubahan konkret:
  1. `AboutDialog.tsx` (baru, ±80 baris): jika `!open` return `null`; overlay `fixed inset-0 z-50 flex items-center justify-center bg-black/40` + panel `card max-w-md w-full`; judul "About Inference Chat Studio"; saat loading tampilkan "Loading…"; saat error tampilkan `formatIpcError(e)` + tombol "Retry" (panggil fetch ulang); saat sukses tampilkan tabel read-only: App / Version (semver) / Build number / Git SHA / Build time (epoch) / Tauri; catatan 1 baris "API key tidak pernah ditampilkan di sini."; tombol "Copy info" (copy `JSON.stringify(info)` via `navigator.clipboard`, fallback `window.prompt` jika clipboard API absen) + tombol "Close" (`onClose`); tutup via Escape (`useEffect` keydown saat open) dan klik overlay (onClick overlay -> onClose, stopPropagation di panel).
  2. `App.tsx` edit minimal 3 titik: (a) import `useState` (ubah `import { useEffect }` -> `import { useEffect, useState }`) + `import { AboutDialog } from "./components/AboutDialog"`; (b) di dalam `App()`, tambah `const [aboutOpen, setAboutOpen] = useState(false);`; (c) di header setelah tombol DevTools, tambah `<button onClick={() => setAboutOpen(true)} className={btn}>About</button>`; (d) sebelum `<CommandPalette />`, tambah `<AboutDialog open={aboutOpen} onClose={() => setAboutOpen(false)} />`.
- Behavior yang harus dipertahankan: tombol DevTools + F12 tetap seperti semula; layout header tidak berubah selain satu tombol tambahan; dialog tidak fetch saat closed.
- Error handling/edge case:
  - Berjalan di browser biasa (tanpa Tauri runtime): `invoke` throw -> tampilkan error + Retry, jangan crash.
  - Clipboard API absen (http non-secure): fallback prompt, jangan throw unhandled.
  - `build_time` epoch string -> tampilkan apa adanya + label "(epoch)"; JANGAN parse ke Date dengan asumsi format (bisa `"unknown"`).
- Test: tambah `apps/desktop/src/components/AboutDialog.test.ts`? Komponen React tanpa testing-library terinstal — JANGAN tambah dependency; sebagai gantinya tidak ada test komponen; cakup via verifikasi manual + typecheck. Catat di handoff sebagai gap manual (buka dialog di `tauri dev` + di browser `vite dev`, pastikan keduanya tidak crash).
- Command verifikasi: `pnpm --filter inference-chat-studio-desktop typecheck` . Hasil yang diharapkan: clean.
- Completion criteria: tombol About muncul di header; dialog menampilkan 6 field; tidak ada crash di browser dev.
- Tidak boleh diubah: `providerStore.ts`, `ChatView`, `ConversationList`, Rust, `index.css`.

## Langkah 8 — `DataBackup.tsx` + wiring sidebar

- Tujuan langkah: cara export/import provider+model+history dari UI tanpa plugin Tauri tambahan.
- Menyelesaikan: R3, R4, R5, R6 (UI).
- Dependency: Langkah 3 + 4 (IPC) + Langkah 5 (tipe) + Langkah 6 (validator).
- File yang harus dibaca: `apps/desktop/src/App.tsx` baris 59-65 (sidebar `<aside>`), `apps/desktop/src/stores/providerStore.ts` baris 125-142 (`loadProviders` pola refresh setelah mutasi), `apps/desktop/src/lib/errors.ts`, `apps/desktop/src/lib/backup.ts` (hasil Langkah 6), `apps/desktop/src/components/ProviderForm.tsx` (pola `invoke` + busy/error state).
- File yang harus diubah/dibuat:
  1. BUAT `apps/desktop/src/components/DataBackup.tsx`
  2. EDIT `apps/desktop/src/App.tsx` (import + render di sidebar)
- Simbol terkait: `DataBackup()`, `invoke<BackupFile>("export_backup")`, `invoke<ImportSummary>("import_backup", { backup })`, `parseBackupJsonText`, `downloadBackupFile`, `useProviderStore(s => s.loadProviders/loadConversations)`.
- Kondisi saat ini: sidebar berisi `ProviderForm/ModelSelector/SettingsSimple/ConversationList`; belum ada backup UI.
- Perubahan konkret:
  1. `DataBackup.tsx` (baru, ±140 baris): bungkus `Collapsible id="data" title="Data & Backup"`; isi: paragraf hint "Export berisi provider (tanpa API key), model, dan history. Setelah import, isi ulang API key tiap provider."; tombol "Export backup" (busy state `exporting`, error state); tombol "Import backup" + `<input type="file" accept="application/json,.json" hidden ref>`; alur export: `setError(null); setExporting(true); const data = await invoke("export_backup"); downloadBackupFile(data);` catch -> `formatIpcError`; finally reset + `await loadProviders()` TIDAK perlu setelah export (tidak ada mutasi) — jangan panggil. Alur import: klik tombol -> trigger file input; onChange: baca via `file.text()`, `parseBackupJsonText(text)` -> jika `!ok` tampilkan error, reset input; jika ok -> `setImporting(true); const summary = await invoke("import_backup", { backup: value }); setResult(\`Imported ${summary.providers} providers, ${summary.models} models, ${summary.conversations} conversations.\`); await loadProviders(); await loadConversations();` catch formatIpcError; finally reset + `e.target.value = ""` agar file sama bisa dipilih ulang.
  2. `App.tsx`: tambah `import { DataBackup } from "./components/DataBackup";`, render `<DataBackup />` di `<aside>` setelah `<ConversationList />` (satu baris).
- Behavior yang harus dipertahankan: semua panel sidebar existing tidak berubah; setelah import, seleksi provider/model di-refresh via store existing (jangan manipulasi state manual).
- Error handling/edge case:
  - File > ~50MB: tolak di frontend sebelum parse (`file.size > 50*1024*1024` -> error `"file too large (max 50 MB)"`).
  - File valid tapi backend menolak (version/format) -> tampilkan pesan backend apa adanya.
  - Import sukses tapi provider tanpa kredensial -> tampilkan kalimat lanjutan di result: `"Re-enter each provider's API key."` (jangan otomatis buat placeholder key).
  - Double-click export saat busy -> tombol disabled.
- Test: tidak ada test komponen (alasan sama Langkah 7); logika sudah dicover `backup.test.ts`. Verifikasi manual: export lalu import di DB bersih, cek count + isi ulang key + test connection.
- Command verifikasi: `pnpm --filter inference-chat-studio-desktop typecheck` + `test`. Hasil yang diharapkan: typecheck clean, 12 vitest passed.
- Completion criteria: tombol export mengunduh file bernama `ics-backup-<ver>-<timestamp>.json`; import file hasil export sukses dengan summary benar; tidak ada penambahan permission/capability.
- Tidak boleh diubah: `capabilities/default.json`, `Cargo.toml` manapun, `tauri.conf.json`, `crates/*`, `providerStore.ts` (hanya dipanggil, tidak diedit).

## Langkah 9 — Test + verifikasi penuh + checklist

- Tujuan langkah: memastikan tidak ada regresi dan semua requirement terverifikasi end-to-end.
- Menyelesaikan: R7 + garansi semua langkah.
- Dependency: Langkah 1-8 selesai.
- File yang harus dibaca: `TEST-CHECKLIST.md` (format kolom `Actual`), `.memory/README.md` (tidak diubah di langkah ini — hanya dibaca untuk konteks).
- File yang harus diubah: TIDAK ADA file kode; hanya mengisi kolom `Actual` di `TEST-CHECKLIST.md` JIKA struktur file mengizinkan (satu kolom per baris; jangan ubah baris `Expected`). Jika ragu, JANGAN ubah — laporkan sebagai sisa manual.
- Perintah verifikasi (urutan eksekusi, dari root repo kecuali disebut):
  1. `cargo test` — expected: semua passed (baseline 30 + ≥4 baru Langkah 2-4).
  2. `cargo clippy -- -D warnings` — expected: clean (jika repo punya pre-existing warning, catat, jangan fix di luar scope).
  3. `pnpm --filter inference-chat-studio-desktop typecheck` — expected: clean.
  4. `pnpm --filter inference-chat-studio-desktop test` — expected: 12 passed (6 lama + 6 backup).
  5. `pnpm --filter inference-chat-studio-desktop build` — expected: sukses, `apps/desktop/dist` terisi.
- Manual (wajib karena tidak ada e2e otomatis): `pnpm tauri dev` (atau `cargo tauri dev` sesuai setup lokal): buka About (cek 6 field cocok dengan `Cargo.toml` + git), Export (cek JSON tidak mengandung `"credential_reference"`/`"api_key"` via cari teks), Import di profil bersih (cek summary + history terbaca + provider minta key ulang).
- Completion criteria: 5 command hijau + 3 cek manual lolos + tidak ada file di luar daftar langkah yang berubah (`git status` hanya menunjukkan file langkah 1-8 + plan ini).
- Tidak boleh diubah: `crates/*/migrations/*`, `tauri.conf.json` version, `capabilities/*`, `.memory/*`, `target/`, `node_modules/`, `*.db`.

## Risks
- Payload backup besar via `invoke` bisa lambat/berat di memori — mitigasi: cap 10k provider/50k conversation + tolak file >50MB di frontend; tidak ada pagination di tahap ini (open question untuk backup >100MB).
- `build_time` sebagai epoch detik (bukan RFC3339) karena `build-dependencies` tanpa chrono — label UI harus jujur "(epoch)"; alternatif tambah `chrono` ke build-deps ditolak agar scope kecil.
- `tauri::VERSION` mungkin tidak ada di versi Tauri dipakai — fallback ke literal; pelaksana wajib pakai yang kompilasi, bukan tebak.
- Tidak ada test komponen React (tanpa testing-library) — About/DataBackup hanya typecheck + manual; risiko regresi UI kecil, diterima untuk tahap ini.
- File backup memuat isi chat sensitif walau tanpa key — UI wajib menampilkan peringatan; tanpa enkripsi di tahap ini.

## Progress Log
- 2026-09-30 07:00:00 — Plan dibuat dari analisis repo + konfirmasi user (semver, commit-count build number, satu file merge-only). Belum ada implementasi.
- 2026-09-30 21:12:00 — Semua langkah diimplementasi; `cargo test -p inference-chat-studio-tauri` 11 passed, `pnpm --filter inference-chat-studio-desktop test` 56 passed (termasuk 14 vitest backup baru), typecheck bersih, clippy `-D warnings` bersih. File baru: `src-tauri/build.rs`, `apps/desktop/src/lib/backup.ts`, `apps/desktop/src/lib/backup.test.ts`, `apps/desktop/src/components/AboutDialog.tsx`, `apps/desktop/src/components/DataBackup.tsx`.
- 2026-09-30 21:20:00 — Final verify: clippy clean, cargo test 11 passed, vitest 56 passed. Manual e2e check pending (see plan Notes).

## Notes
- Sumber versi tunggal: `src-tauri/Cargo.toml` via `CARGO_PKG_VERSION`. `tauri.conf.json` `version` tetap `0.1.0` manual (sinkronisasi otomatis bukan scope; jangan ubah).
- Backend backup SENGAJA menghilangkan `credential_reference` + `api_key`; jangan "memperbaiki" dengan menambahkannya kembali.
- Import = merge murni: ID baru selalu generate; tidak ada delete/update data existing; secret-store tidak disentuh.
- File dialog memakai web primitif (`Blob` download + `<input type=file>`) agar tidak perlu `plugin-dialog`/`plugin-fs` dan perubahan capability.
- Commit konvensional yang diusulkan saat implementasi selesai: `feat: add about dialog and backup export import` (satu baris, tanpa trailer).

---

## Handoff Checklist (untuk model pelaksana kecil)
- [ ] Kerjakan Langkah 0-9 berurutan; jangan loncat (dependency di atas).
- [ ] Hanya ubah file yang terdaftar di tiap langkah; selain itu dilarang.
- [ ] Setiap langkah selesai -> jalankan command verifikasi langkah itu; lanjut hanya jika hijau.
- [ ] Jika `tauri::VERSION` tidak kompilasi, pakai literal + catat di Progress Log.
- [ ] Jika `git` absen saat build, pastikan fallback `"0"`/`"unknown"` dan build tetap hijau.
- [ ] Jangan menambah dependency (npm/cargo), capability, migrasi DB, atau plugin Tauri apa pun.
- [ ] Jangan menyentuh secret-store di path import; jangan memasukkan `credential_reference`/`api_key` ke JSON backup.
- [ ] Akhiri dengan Langkah 9 penuh + isi Progress Log + Tasks checklist di file plan ini.
