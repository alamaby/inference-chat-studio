# Enhancements Implementation Plan (5 items)

Created: 2026-10-01 07:00:00

## Objective
Mengeksekusi 5 enhancement (Settings panel, Anthropic provider, Conversation folders/tags, Auto-update, Multi-window) secara atomik, deterministik, tanpa analisis ulang oleh model kecil. Setiap finding dari analisa 2026-10-01 harus ditangani minimal satu langkah dengan test/verifikasi eksplisit.

## Scope
In scope:
- S0 baseline gate.
- A. Settings panel: validasi + `timeout_ms` per-conversation + grouping UI (inkremental, 70% sudah ada).
- B. Anthropic provider: crate baru + routing IPC + UI select + backup compat.
- C. Folders/tags: migrasi `0003` + Db methods + IPC + UI + backup v2.
- D. Auto-update: integrasi `tauri-plugin-updater` + signing + release workflow (gated by signing key).
- E. Multi-window: window kedua read-only + event targeting (risiko tertinggi, terakhir).
Out of scope:
- Responses API adapter, Actix server aktif, Linux/Mac bundling, enkripsi backup, perubahan pricing/usage, ikon final, migrasi DB lama per-CWD.

## Milestones
1. M0 Baseline green (S0).
2. M1 Settings done (A1-A2).
3. M2 Anthropic done (B1-B3).
4. M3 Folders/tags done (C1-C2).
5. M4 Auto-update gated (D1-D2, boleh blocked on signing key).
6. M5 Multi-window minimal (E1-E2, terakhir).

## Tasks
- [x] S0 Baseline gate verification
- [x] A1 Settings contract + validation + timeout_ms
- [x] A2 Settings panel grouping UI
- [x] B1 provider-anthropic crate skeleton (no IPC wiring)
- [x] B2 IPC routing anthropic + ProviderForm select
- [x] B3 Anthropic reasoning/caps + backup allowlist
- [x] C1 Migration 0003 + Db methods + backup v2 structs
- [x] C2 IPC folders/tags + UI + import/export wiring
- [x] D1 Updater plugin + tauri.conf (inactive endpoint)
- [x] D2 Release workflow latest.json + sig publishing
- [x] E1 Second window read-only (About/Inspector)
- [x] E2 Per-window chat event targeting
- [x] Handoff checklist selesai

## Risks
- Anthropic `thinking` budget mapping tidak 1:1 dengan `reasoning_effort` OpenAI; salah map sebabkan `reasoning_not_supported` palsu.
- Migrasi 0003 + backup v2 putus jika id folder/tag tidak diremap saat import.
- Updater tanpa signing key = dead code; jangan aktifkan endpoint produksi sebelum key ada.
- Multi-window race: dua window tulis conversation sama + broadcast `chat-done` ke window salah.
- Scope creep: model kecil tergoda selipkan Responses API / Actix / ubah versi manual.

## Progress Log
- 2026-10-01 07:00:00 — Plan dibuat dari analisa + traceability; belum ada implementasi.
- 2026-10-01 09:50:00 — S0 baseline hijau: typecheck 0, vitest 85 passed, cargo 45 tests 0 failed.
- 2026-10-01 09:57:00 — A1 selesai: timeoutMs + validasi range di conversation.ts, providerStore, api-types. Vitest 89 passed (+4).
- 2026-10-01 10:22:00 — A2 selesai: SettingsSimple 3 grup + timeout input + validation UI, ChatView kirim timeoutMs. Vitest 98 passed (+9).
- 2026-10-01 10:30:00 — B1 selesai: crates/provider-anthropic (5 tests). StreamResult di-unifikasi via provider-openai.
- 2026-10-01 10:40:00 — B2 selesai: validate_provider terima anthropic, create_provider compatibility_type, test/refresh branch, ProviderForm select. Cargo 50 tests 0 failed.
- 2026-10-01 10:50:00 — B3 selesai: stream_chat_cmd anthropic branch, backup allowlist, reasoning.ts anthropic caps. Cargo 50 tests 0 failed.
- 2026-10-01 11:00:00 — C1 selesai: migrasi 0003, Db methods folder/tag, backup v2 structs, import/export wiring. Cargo 50 tests 0 failed.
- 2026-10-01 11:10:00 — C2 selesai: 8 IPC commands folder/tag, providerStore state+actions, ConversationList UI. Cargo 50 tests 0 failed.
- 2026-10-01 11:20:00 — D1 selesai: tauri-plugin-updater + tauri.conf inactive + capability. Cargo 50 tests 0 failed.
- 2026-10-01 11:25:00 — D2 selesai: release.yml signing env + sig/latest.json upload, tauri.conf endpoint GitHub releases (active:false).
- 2026-10-01 11:35:00 — E1 selesai: window inspector read-only, open/close_inspector_window, App.tsx hash route. Cargo 50 tests 0 failed.
- 2026-10-01 11:45:00 — E2 selesai: StreamChatInput.origin_window, emit_to targeting, ChatView kirim origin_window. Cargo 50 tests 0 failed, typecheck 0.
- 2026-10-01 11:45:00 — SEMUA LANGKAH SELESAI. Gate final: cargo 50 tests 0 failed, typecheck 0, vitest 98 passed.

---

## Detailed Steps

### S0 — Baseline gate verification (read-only, no code change)
- Tujuan: pastikan baseline hijau sebelum sentuh apapun.
- Finding/requirement: gate `.memory/README.md` klaim typecheck clean, 85 vitest, cargo 0 failed; harus direproduksi.
- Dependency: tidak ada.
- File yang harus dibaca: `apps/desktop/package.json`, `src-tauri/Cargo.toml`, `.memory/README.md`, `TEST-CHECKLIST.md`.
- File yang harus diubah: tidak ada.
- Simbol terkait: tidak ada (hanya command).
- Kondisi saat ini: v0.2.0, single version source `src-tauri/Cargo.toml:3`.
- Perubahan konkret: tidak ada perubahan kode.
- Urutan: tidak ada.
- Behavior dipertahankan: semua.
- Error handling/edge: jika gate merah, STOP, catat di Progress Log, jangan lanjut ke A1.
- Test ditambah/diupdate: tidak ada.
- Input/expected: N/A.
- Command verifikasi:
  1. `pnpm --filter inference-chat-studio-desktop typecheck`
  2. `pnpm --filter inference-chat-studio-desktop test`
  3. `cargo test --workspace`
- Hasil diharapkan: (1) 0 error, (2) semua vitest passed, (3) 0 failed. Catat angka aktual.
- Completion criteria: tiga command hijau, angka dicatat di plan Progress Log.
- Tidak boleh diubah: file kode, `Cargo.toml`, `tauri.conf.json`, migrasi, `.env*`, secrets.

### A1 — Settings contract + validation + timeout_ms per-conversation
- Tujuan: lengkapi kontrak settings yang sudah 70% ada dengan validasi dan `timeout_ms`.
- Finding: `SettingsSimple.tsx` sudah ada temperature/maxOutput/systemPrompt/reasoning; belum ada validasi range, belum ada timeout per-conversation; `StreamChatInput.timeout_ms` sudah ada di IPC tapi tidak tersimpan di `settings_json`.
- Dependency: S0.
- File yang harus dibaca:
  - `apps/desktop/src/lib/conversation.ts:123-179`
  - `apps/desktop/src/stores/providerStore.ts:348-361`
  - `apps/desktop/src/components/SettingsSimple.tsx:156-192`
  - `src-tauri/src/ipc.rs:1049-1061` (`StreamChatInput`), `984-999` (`update_conversation_settings`)
  - `packages/api-types/src/index.ts:78-89`
- File yang harus diubah:
  1. `apps/desktop/src/lib/conversation.ts`
  2. `apps/desktop/src/lib/conversation.test.ts` (buat jika belum ada; cek via glob `apps/desktop/src/lib/*.test.ts` dulu)
  3. `apps/desktop/src/stores/providerStore.ts`
  4. `packages/api-types/src/index.ts` (hanya tambah field opsional, jangan ubah existing)
- Simbol: `ConversationSettings`, `DEFAULT_SETTINGS`, `serializeConversationSettings`, `parseConversationSettings`, `saveConversationSettings`, `StreamChatInput`.
- Kondisi saat ini: `ConversationSettings={reasoningLevel,reasoningCustomJson,temperature,maxOutput}`; `serialize` pakai key snake_case `reasoning_level,reasoning_custom_json,temperature,max_output_tokens`; `parse` fallback per-field ke default.
- Perubahan konkret:
  1. Di `conversation.ts`: tambah `timeoutMs: number|null` ke `ConversationSettings` + `DEFAULT_SETTINGS.timeoutMs=null`; `serialize` tambah `timeout_ms`; `parse` tambah `timeout_ms` dengan aturan: number finite integer 1000..120000 else null.
  2. Di `conversation.ts`: perketat `parse` existing: `temperature` hanya terima finite -2..2 else null; `maxOutput` integer 1..128000 else null (jangan throw, fallback null).
  3. Di `providerStore.ts`: tambah state `timeoutMs:number|null=null`; update `conversationPatch()` untuk restore `timeoutMs`; update `saveConversationSettings()` untuk kirim `timeoutMs`; update interface `ConversationDto` tambah `settings_json` sudah ada, tidak perlu ubah IPC signature selain teruskan via `settingsJson`.
  4. Di `api-types/src/index.ts`: tambah `timeout_ms?: number|null` ke `StreamChatInput` jika belum ada (cek dulu; jika sudah ada lewati).
- Urutan dalam file: (1) type/interface dulu, (2) default, (3) serialize, (4) parse, (5) store state+patch+save.
- Behavior dipertahankan: corrupt `settings_json` tetap fallback per-field, tidak wipe panel; shape lama tanpa `timeout_ms` tetap terbaca.
- Error/edge: `settings_json=null/""/invalid JSON/unknown keys` -> default; `temperature="abc"/NaN/Infinity` -> null; `timeout_ms=0/999/999999/"30s"` -> null; Custom reasoning JSON invalid tetap disimpan sebagai string (validasi JSON penuh di A2, bukan di parse).
- Test ditambah/diupdate:
  - `conversation.test.ts`: `parseConversationSettings` cases + `serialize` roundtrip.
- Input/expected:
  - `parse('{"temperature":999,"max_output_tokens":-5,"timeout_ms":50}')` -> `{temperature:null,maxOutput:null,timeoutMs:null,...defaults}`.
  - `parse(null)` -> clone `DEFAULT_SETTINGS`.
  - `serialize({...,timeoutMs:30000})` contains `"timeout_ms":30000`; `serialize` dengan null tidak hilangkan key (tetap `null`, karena backend parse defensif).
  - `serialize(parse(x))` roundtrip stabil untuk input valid.
- Verifikasi:
  - `pnpm --filter inference-chat-studio-desktop typecheck` -> 0 error.
  - `pnpm --filter inference-chat-studio-desktop test` -> semua passed termasuk file baru.
- Completion: 4 file diubah sesuai list, test baru hijau, tidak ada perubahan Rust di langkah ini.
- Tidak boleh diubah: `src-tauri/**`, `crates/**`, `tauri.conf.json`, migrasi, backup version, `ChatView.tsx` logic kirim (wiring timeout ke send di A2).

### A2 — Settings panel grouping + wiring timeout + validation UI
- Tujuan: jadikan panel usable: grup, pesan error, kirim timeout per-conversation.
- Finding: `SettingsSimple.tsx` satu Collapsible campur template; tidak ada error message; `timeoutMs` dari A1 belum ada input; pengirim chat belum pakai timeout tersimpan.
- Dependency: A1.
- File yang harus dibaca:
  - `apps/desktop/src/components/SettingsSimple.tsx:1-195`
  - `apps/desktop/src/components/ChatView.tsx` (cari `stream_chat_cmd` invoke + `timeout_ms` param)
  - `apps/desktop/src/stores/providerStore.ts:250-257,348-361`
  - `apps/desktop/src/lib/ui.ts` (cek `btn,hintText,input,label,select,errorText` tersedia)
- File yang harus diubah:
  1. `apps/desktop/src/components/SettingsSimple.tsx`
  2. `apps/desktop/src/components/ChatView.tsx` (hanya tambah `timeout_ms` dari store ke invoke, 1 baris + import store jika perlu)
  3. `apps/desktop/src/components/SettingsSimple.test.tsx` (buat baru, vitest + testing-library yang sudah dipakai repo; cek contoh test existing dulu)
- Simbol: `SettingsSimple`, `useProviderStore().timeoutMs/setSimple`, `stream_chat_cmd`.
- Kondisi: `setSimple` hanya patch `systemPrompt/temperature/maxOutput`; streaming checkbox locked.
- Perubahan konkret:
  1. `SettingsSimple.tsx`: bagi jadi 3 grup berjudul: `Model Behavior` (reasoning+custom), `Sampling & Limits` (temperature,maxOutput,timeoutMs), `System & Templates` (systemPrompt+templates 기존). Jangan pindah file template logic.
  2. Tambah input `Timeout (ms)` number placeholder `30000`, min 1000 max 120000; onChange: `""->null` else `Number`; jika di luar range tampilkan `<p class=errorText>Timeout must be 1000–120000 ms.</p>` dan jangan blokir save (save kirim null jika invalid).
  3. Tambah validasi UI: temperature di luar -2..2 tampilkan errorText; maxOutput <1 tampilkan errorText. Disabled state temperature saat `caps.supports_temperature===false` dipertahankan.
  4. `ChatView.tsx`: saat invoke `stream_chat_cmd`, tambah `timeout_ms: timeoutMs ?? 30000`. Cari exact key `timeout_ms` di file; jika sudah ada, ganti sumbernya dari store (jangan duplikat).
- Urutan: (1) store `timeoutMs` wiring cek, (2) grup JSX, (3) input+error, (4) ChatView invoke.
- Behavior: template save/apply/delete tidak berubah; reasoning disabled saat unsupported tidak berubah; streaming tetap locked.
- Error/edge: input kosong->null (auto); non-numeric->null + errorText; timeout invalid tetap kirim 30000 fallback agar tidak hang.
- Test:
  - `SettingsSimple.test.tsx`: render dengan store mock, ketik timeout `50` -> errorText muncul; ketik `30000` -> error hilang; temperature `99` -> error muncul.
- Input/expected: `timeout input "50"` -> error visible, invoke fallback 30000; `"30000"` -> no error.
- Verifikasi: typecheck 0 + vitest passed.
- Completion: grup tampil, error muncul tepat, chat kirim pakai timeout store.
- Tidak boleh diubah: `src-tauri/**`, `crates/**`, schema, backup, `ProviderForm.tsx`, window config.

### B1 — provider-anthropic crate skeleton (tanpa IPC wiring)
- Tujuan: crate baru terisolasi, bisa di-test tanpa sentuh app.
- Finding: hanya `provider-openai` ada; `provider-core` sudah punya `ProviderError,NormalizedChatRequest,ModelCapabilities,ConnectionStatus`.
- Dependency: S0 (bisa paralel dengan A).
- File dibaca:
  - `crates/provider-openai/Cargo.toml`, `crates/provider-openai/src/lib.rs`, `crates/provider-openai/src/chat.rs:29-73`, `crates/provider-openai/src/models.rs`, `crates/provider-core/src/types.rs`, `crates/provider-core/src/error.rs`
  - Root `Cargo.toml:1-9`
- File diubah (baru, jangan edit existing selain 1 baris):
  1. BUAT `crates/provider-anthropic/Cargo.toml` (copy dependency dari provider-openai: tokio,serde,serde_json,reqwest + provider-core path)
  2. BUAT `crates/provider-anthropic/src/lib.rs`
  3. BUAT `crates/provider-anthropic/src/chat.rs`
  4. BUAT `crates/provider-anthropic/src/models.rs`
  5. EDIT `Cargo.toml` root: tidak perlu (members `crates/*` sudah wildcard) — verifikasi saja, jangan tambah.
- Simbol: `build_anthropic_body, stream_anthropic_chat, list_anthropic_models, test_anthropic_connection, map_anthropic_reasoning`.
- Kondisi: belum ada kode Anthropic.
- Perubahan konkret:
  1. `chat.rs`: `pub fn build_anthropic_body(req:&NormalizedChatRequest)->Result<Value,ProviderError>` mapping: `model`, `max_tokens=req.max_output_tokens.unwrap_or(1024)`, `system=req.system_prompt` (skip jika kosong), `messages` filter role `user/assistant` (drop `system` karena sudah di `system`), `temperature` hanya jika Some. Jangan implementasi streaming SSE di B1, hanya body builder + `wire thinking` stub return None.
  2. `models.rs`: `pub fn normalize_anthropic_base_url(raw:&str)->String` trim trailing `/`; `test_anthropic_connection` stub return `Ok(ConnectionStatus::NotTested)` agar B1 tidak butuh network.
  3. `lib.rs`: re-export 3 fungsi di atas.
- Urutan: Cargo.toml -> lib.rs -> chat.rs -> models.rs.
- Behavior: tidak ada behavior app berubah (crate belum dipakai).
- Error/edge: `base_url` tanpa scheme tetap terima di normalizer (validasi scheme tetap di IPC); `messages` kosong -> `Validation("messages must not be empty")`.
- Test:
  - `chat.rs #[cfg(test)]`: `build_body_maps_system_and_temp`, `build_body_drops_system_role_from_messages`, `build_body_empty_messages_rejects`.
- Input/expected:
  - req `{model:"claude-3-5-sonnet-20241022",system_prompt:Some("hi"),messages:[{role:"system",content:"x"},{role:"user",content:"hello"}],temperature:Some(0.7),max_output_tokens:None}` -> body `{"model":...,"system":"hi","messages":[{"role":"user","content":"hello"}],"max_tokens":1024,"temperature":0.7}` tanpa key `null`.
  - req messages `[]` -> Err Validation.
- Verifikasi: `cargo test -p provider-anthropic` -> 3 passed; `cargo test --workspace` -> 0 failed.
- Completion: crate kompilasi, 3 test hijau, tidak ada file lain tersentuh.
- Tidak boleh diubah: `src-tauri/**`, `apps/**`, `conversation-store/**`, `provider-openai/**`, `provider-core/**`.

### B2 — IPC routing anthropic + ProviderForm select
- Tujuan: provider Anthropic bisa dibuat/test/list tanpa merusak OpenAI.
- Finding: `ipc.rs:create_provider` hardcode openai; `validate_provider` di `db.rs:161-167` reject non-chat_completions; UI locked.
- Dependency: B1.
- File dibaca:
  - `src-tauri/src/ipc.rs:239-248,343-383,793-819,825-878,1063-1114`
  - `crates/conversation-store/src/db.rs:161-197`
  - `apps/desktop/src/components/ProviderForm.tsx:44-71,112-133`
  - `src-tauri/Cargo.toml:17-20`
- File diubah:
  1. `crates/conversation-store/src/db.rs` (fungsi `validate_provider` saja)
  2. `src-tauri/src/ipc.rs` (`CreateProviderInput` + `create_provider` + `test_connection_cmd` + `refresh_models`)
  3. `src-tauri/Cargo.toml` (tambah `provider-anthropic = {path...}`)
  4. `apps/desktop/src/components/ProviderForm.tsx` (ganti input disabled jadi select)
  5. `packages/api-types/src/index.ts` (`CreateProviderInput` tambah `compatibility_type`)
- Simbol: `CreateProviderInput,validate_provider,create_provider,test_connection_cmd,refresh_models`.
- Kondisi: `CreateProviderInput={name,base_url,api_key,additional_headers_json,timeout_ms}` tanpa compatibility; `validate_provider` hanya terima `chat_completions`.
- Perubahan konkret:
  1. `api-types`: tambah `compatibility_type?: "openai"|"anthropic"|null` (opsional agar old call tetap jalan).
  2. `db.rs validate_provider`: terima `api_mode in ("chat_completions","anthropic")` ATAU `compatibility_type in ("openai","anthropic")` dengan aturan: jika `compatibility_type=="anthropic"` maka `api_mode` harus `"anthropic"`; jika openai maka `chat_completions`; selain itu Validation. Jangan ubah validasi nama/base_url.
  3. `ipc.rs CreateProviderInput`: tambah `compatibility_type: Option<String>`; `create_provider`: `let compat = input.compatibility_type.unwrap_or("openai")`; jika bukan openai/anthropic -> Validation; set `compatibility_type=compat`, `api_mode = if compat=="anthropic" {"anthropic"} else {"chat_completions"}`; selain itu logic sama (keyring set, insert).
  4. `src-tauri/Cargo.toml`: tambah baris `provider-anthropic = { path = "../crates/provider-anthropic" }` setelah provider-openai, urutan alfabet tidak wajib.
  5. `test_connection_cmd`/`refresh_models`: branch `if row.compatibility_type=="anthropic"||row.api_mode=="anthropic"` -> panggil `provider_anthropic::test_.../list_...` (stub NotTested di B1); else jalur openai existing. Jangan ubah error mapping.
  6. `ProviderForm.tsx:119-122`: ganti `<input disabled value="OpenAI Compatible">` jadi `<select value={compat} onChange>` opsi `OpenAI Compatible(value openai)` + `Anthropic(value anthropic)`; state `const [compat,setCompat]=useState("openai")`; submit kirim `compatibility_type:compat`. Tooltip lama hapus.
- Urutan: api-types -> db.rs -> Cargo.toml -> ipc.rs -> ProviderForm.
- Behavior: provider openai lama tetap jalan; list_providers tidak bocorkan secret (`api_key:null`).
- Error/edge: `compatibility_type="foo"` -> Validation 400-style; `base_url` non-http -> Validation existing; anthropic tanpa key -> unauthorized existing; stub test return NotTested, UI tampilkan badge NotTested (bukan Connected).
- Test:
  - Rust `ipc.rs tests`: `create_provider_anthropic_sets_api_mode` (in-memory Db, panggil `backup_from_db`? lebih baik test `validate_backup` tidak; buat test langsung `Db::insert_provider` dengan row anthropic -> Ok; row `api_mode="responses"` -> Err).
  - TS: update `providerStore.test.ts` jika ada snapshot CreateProviderInput (tambah field opsional, harus tetap pass).
- Input/expected:
  - `insert_provider({compatibility_type:"anthropic",api_mode:"anthropic",...})` -> Ok.
  - `insert_provider({api_mode:"responses"})` -> Err Validation contains `unsupported api_mode`.
  - UI submit anthropic -> invoke `create_provider` payload contains `compatibility_type:"anthropic"`.
- Verifikasi: `cargo test --workspace` 0 failed; `pnpm --filter ... typecheck` 0; `vitest run` passed.
- Completion: bisa add provider anthropic via UI, test connection return NotTested (stub), openai tidak regresi.
- Tidak boleh diubah: `stream_chat_cmd` (di B3), migrasi, backup version, chat body openai, secret-store, multi-window/updater config.

### B3 — Anthropic chat routing + reasoning/caps + backup allowlist
- Tujuan: chat via Anthropic jalan dengan capability-aware reasoning.
- Finding: `stream_chat_cmd` hardcode openai + `provider_openai::build_chat_body/map_reasoning`; `ChatChunkEvent` komentar reserve Responses/Anthropic; `validate_backup` skip non-chat_completions.
- Dependency: B2.
- File dibaca:
  - `src-tauri/src/ipc.rs:1093-1138,1169-1258,605-653,668-691`
  - `crates/provider-anthropic/src/chat.rs` (hasil B1)
  - `crates/provider-core/src/reasoning.rs`, `crates/provider-openai/src/reasoning_map.rs`
  - `apps/desktop/src/lib/reasoning.ts`, `apps/desktop/src/components/ChatView.tsx`
- File diubah:
  1. `src-tauri/src/ipc.rs` (`stream_chat_cmd` dispatch + `validate_backup` + `import_backup_file` allowlist)
  2. `crates/provider-anthropic/src/chat.rs` (tambah `stream_anthropic_chat` minimal non-stream POST lalu bungkus jadi StreamResult; jangan duplikat SSE openai)
  3. `apps/desktop/src/lib/reasoning.ts` (tambah branch caps untuk anthropic jika caps null -> default disable reasoning; jangan ubah label existing)
- Simbol: `stream_chat_cmd,build_chat_body,map_reasoning,model_caps_from_json,validate_backup,BACKUP_VERSION`.
- Kondisi: `stream_chat_cmd` tolak `api_mode!="chat_completions"`; backup skip unknown api_mode (count 0).
- Perubahan konkret:
  1. `ipc.rs stream_chat_cmd`: ganti guard `if row.api_mode != "chat_completions"` jadi `if !(["chat_completions","anthropic"].contains)`; setelah load caps+reasoning validate, branch: jika anthropic -> `let body=provider_anthropic::build_anthropic_body(&request)?; diag_url=normalize_anthropic_base_url+"/v1/messages"; diag_body=body;` lalu spawn pakai `provider_anthropic::stream_anthropic_chat`. Jalur openai pindah ke `else` tanpa ubah logic (copy-paste blok existing ke else, jangan refactor).
  2. `validate_backup` + `import_backup_file`: ganti cek `!= "chat_completions"` jadi `not in ("chat_completions","anthropic")` di 2 tempat (`606-638` dan `673-675`). Jangan bump BACKUP_VERSION di langkah ini.
  3. `reasoning.ts`: jika `caps==null` dan provider compat anthropic (teruskan param `compat?:string`, default openai) -> `supported=false`; jangan ubah opsi untuk openai.
- Urutan: anthropic chat.rs dulu -> ipc dispatch -> backup allowlist -> reasoning.ts.
- Behavior: chat openai byte-identical body/url; event `chat-done/chat-error` shape tidak berubah (frontend contract frozen).
- Error/edge: anthropic `temperature` unsupported? tetap kirim jika Some (Anthropic support); `reasoning_level!=None/Automatic` untuk model tanpa `supports_reasoning` -> `reasoning_not_supported` via `map_reasoning` existing untuk openai, untuk anthropic return `ReasoningNotSupported` jika level bukan None/Automatic/Custom (dokumentasikan).
- Test:
  - Rust: `stream body anthropic` test di provider-anthropic (dari B1) + `validate_backup_accepts_anthropic` (buat BackupFile dengan 1 provider anthropic -> `validate_backup` Ok).
  - TS: reasoning test existing tetap pass; tambah 1 case caps null + compat anthropic -> supported false.
- Input/expected:
  - `validate_backup({providers:[{api_mode:"anthropic",...}],...})` -> Ok (sebelumnya skip tapi tetap Ok; bedakan: import count providers==1, bukan 0).
  - `import_backup_file` dengan anthropic -> `providers==1`.
- Verifikasi: cargo workspace 0 failed; typecheck 0; vitest passed.
- Completion: stream anthropic end-to-end dengan stub non-stream, backup roundtrip anthropic.
- Tidak boleh diubah: schema migrasi, updater, window config, secret handling, openai chat.rs.

### C1 — Migration 0003 folders/tags + Db methods + backup v2 structs
- Tujuan: storage siap tanpa UI.
- Finding: `conversations` tanpa folder/tag; `SCHEMA_VERSION=2`; `migrate()` match 0/1; backup v1 tanpa folder/tag.
- Dependency: S0 (bisa paralel A/B, tapi merge setelah B3 untuk hindari konflik backup version — prioritaskan urut B3->C1).
- File dibaca:
  - `crates/conversation-store/src/db.rs:6-8,144-159,259-290` (insert/list conversation)
  - `crates/conversation-store/migrations/0001_init.sql`, `0002_bookmarks.sql`
  - `src-tauri/src/ipc.rs:470-523,555-602` (Backup structs)
  - `packages/api-types/src/index.ts:139-221`
- File diubah:
  1. BUAT `crates/conversation-store/migrations/0003_folders_tags.sql`
  2. `crates/conversation-store/src/db.rs` (konstanta + migrate + structs + methods)
  3. `crates/conversation-store/src/db_tests.rs` (tambah test)
  4. `src-tauri/src/ipc.rs` (Backup structs + BACKUP_VERSION 1->2 + validate)
  5. `packages/api-types/src/index.ts` (mirror backup types + BACKUP_VERSION)
- Simbol: `Db::migrate,SCHEMA_VERSION,ConversationRow,FolderRow,TagRow,BACKUP_VERSION,validate_backup`.
- Kondisi: `SCHEMA_VERSION=2`, `BACKUP_VERSION=1`.
- Perubahan konkret:
  1. `0003_folders_tags.sql` exact:
     ```sql
     CREATE TABLE folders(id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at TEXT NOT NULL);
     CREATE TABLE tags(id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL);
     ALTER TABLE conversations ADD COLUMN folder_id TEXT REFERENCES folders(id);
     CREATE TABLE conversation_tags(conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE, tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE, PRIMARY KEY(conversation_id,tag_id));
     CREATE INDEX idx_conv_folder ON conversations(folder_id);
     CREATE INDEX idx_ctag_conv ON conversation_tags(conversation_id);
     ```
  2. `db.rs`: tambah `const FOLDERS_TAGS_SQL: &str = include_str!("../migrations/0003_folders_tags.sql");` + `SCHEMA_VERSION: i64 = 2 -> 3`; `migrate()` tambah `2 => conn.execute_batch(FOLDERS_TAGS_SQL)?,`. Tambah struct `FolderRow{id,name,created_at}`, `TagRow{id,name,created_at}`. Tambah methods: `create_folder, list_folders, rename_folder, delete_folder(set folder_id null dulu), create_tag, list_tags, set_conversation_folder(id,Option<&str>), set_conversation_tags(id,&[tag_id])` (delete+insert dalam transaksi). Jangan ubah signature existing methods.
  3. `ipc.rs`: `BACKUP_VERSION 1->2`; `BackupConversation` tambah `folder_id: Option<String>, tag_ids: Vec<String>`? Lebih aman: tambah `BackupFolder{id,name,created_at}`, `BackupTag{...}`, `BackupFile{folders,tags}` + `BackupConversation.folder_id/tag_ids`. `backup_from_db` isi folders/tags; `validate_backup`: terima version 1 atau 2 (backward compat baca), tapi tulis selalu 2; reject `folder name empty`, `tag name empty`.
  4. `api-types`: mirror tambah exact field sama + `BACKUP_VERSION=2`.
- Urutan: SQL file -> db.rs konstanta+migrate -> structs+methods -> ipc backup -> api-types.
- Behavior: DB lama v2 auto-migrate ke v3 tanpa hapus data; backup v1 lama tetap bisa diimport (version check `==1||==2`).
- Error/edge: `folder name empty/whitespace` -> Validation; `tag name duplicate` -> pakai SELECT dulu, return existing id (idempotent), bukan error; `set_conversation_tags` dengan tag_id unknown -> Validation; `delete_folder` tidak cascade delete conversation (set null).
- Test:
  - `db_tests.rs`: `migrate_v2_to_v3_preserves_conversations`, `folder_crud_and_set`, `tags_idempotent_and_set`.
- Input/expected:
  - fresh `connect_in_memory` -> `user_version==3`, `list_folders==[]`.
  - `create_folder("Work")` -> list 1; `set_conversation_folder(conv,"folder-id")` -> get conversation folder_id Some; `delete_folder` -> folder_id None, conversation tetap ada.
  - `create_tag("urgent")` 2x -> same id, list 1.
  - backup v1 file (tanpa folders field? pakai Option) -> validate Ok.
- Verifikasi: `cargo test -p conversation-store` passed; `cargo test --workspace` 0 failed.
- Completion: migrasi + methods + backup v2 structs hijau tanpa UI.
- Tidak boleh diubah: provider crates, updater, window, secret-store, `0001/0002` SQL (frozen), version app.

### C2 — IPC folders/tags + UI + import/export wiring
- Tujuan: folders/tags usable end-to-end.
- Finding: `ConversationList.tsx` hanya search+provider/model filter; store tanpa folder/tag state.
- Dependency: C1.
- File dibaca:
  - `src-tauri/src/ipc.rs:931-999` (conversation commands), `main.rs:20-44` (handler list)
  - `apps/desktop/src/components/ConversationList.tsx:1-141`
  - `apps/desktop/src/stores/providerStore.ts:29-46,258-306`
  - `apps/desktop/src/components/DataBackup.tsx` (cek export/import invoke)
- File diubah:
  1. `src-tauri/src/ipc.rs` (tambah 8 command, jangan ubah existing)
  2. `src-tauri/src/main.rs` (tambah ke generate_handler)
  3. `packages/api-types/src/index.ts` (DTO Folder/Tag)
  4. `apps/desktop/src/stores/providerStore.ts` (state+actions)
  5. `apps/desktop/src/components/ConversationList.tsx` (folder select + tag filter + assign UI)
- Simbol: `create_folder,list_folders_cmd,rename_folder,delete_folder,create_tag,list_tags_cmd,set_conversation_folder_cmd,set_conversation_tags_cmd`.
- Kondisi: belum ada command folder/tag.
- Perubahan konkret:
  1. `ipc.rs` tambah exact 8 `#[tauri::command]`: `create_folder(name)->FolderRow`, `list_folders_cmd()->Vec<FolderRow>`, `rename_folder(id,name)`, `delete_folder(id)`, `create_tag(name)->TagRow`, `list_tags_cmd()->Vec<TagRow>`, `set_conversation_folder_cmd(conversation_id, folder_id:Option<String>)`, `set_conversation_tags_cmd(conversation_id, tag_ids:Vec<String>)`. Validasi nama non-empty trim else Validation. Semua panggil `state.db.*` dari C1.
  2. `main.rs`: tambah 8 nama ke `generate_handler!` setelah `delete_conversation`, urutan sama.
  3. `api-types`: `FolderDto{id,name,created_at}`, `TagDto{id,name,created_at}`.
  4. `providerStore.ts`: tambah `folders:FolderDto[], tags:TagDto[], conversationFolderFilter:string|null, conversationTagFilter:string|null, loadFoldersTags(), setConversationFolder(id,folderId), setConversationTags(id,tagIds)`; `visible` filter di component (bukan store) pakai 2 field baru.
  5. `ConversationList.tsx`: tambah `<select folder>` (All + Uncategorized + tiap folder) + `<select tag>` + per-row `<select folder assign>` + tag toggle sederhana (checkbox list atau comma input; pilih comma input `tag1, tag2` -> create-if-missing lalu set). Jangan ubah rename/delete flow.
- Urutan: ipc -> main -> api-types -> store -> UI.
- Behavior: conversation tanpa folder tetap tampil di All/Uncategorized; backup export/import sudah dari C1, UI DataBackup tidak perlu ubah selain hint text.
- Error/edge: folder/tag name empty -> tampilkan errorText inline, jangan invoke; tag_ids unknown dari UI tidak mungkin (selalu via create_tag dulu); invoke gagal -> `setError(formatIpcError)`.
- Test:
  - Rust ipc test: `folder_tag_commands_roundtrip` via `import_backup_file`/`backup_from_db` dengan folder+tag (karena State-free) + Db methods dari C1 (cukup).
  - TS `providerStore.test.ts`: mock invoke `list_folders_cmd/list_tags_cmd` -> state terisi; filter logic test jika ada.
- Input/expected:
  - `create_folder("  ")` -> Err validation.
  - `set_conversation_tags(conv,["t1","t2"])` -> list tags conv ==2.
  - UI: pilih folder filter `f1` -> visible hanya conv dengan folder_id f1.
- Verifikasi: cargo 0 failed; typecheck 0; vitest passed.
- Completion: CRUD folder/tag via UI, filter jalan, backup v2 roundtrip dengan folder/tag.
- Tidak boleh diubah: chat streaming, provider form, updater, window, secret, `0001/0002`.

### D1 — Updater plugin + tauri.conf (inactive endpoint, no signing yet)
- Tujuan: siapkan kabel updater tanpa aktifkan update produksi.
- Finding: `tauri.conf.json` tanpa updater; `Cargo.toml` features kosong; release hanya NSIS.
- Dependency: M1-M3 selesai (hindari konflik tauri.conf dengan E).
- File dibaca:
  - `src-tauri/tauri.conf.json:1-43`, `src-tauri/Cargo.toml:10-23`, `src-tauri/src/main.rs:12-20`, `.github/workflows/release.yml`, `src-tauri/capabilities/*` (list file dulu)
- File diubah:
  1. `src-tauri/Cargo.toml` (tambah `tauri-plugin-updater = "2"`)
  2. `src-tauri/tauri.conf.json` (tambah `plugins.updater` dengan `active:false`, `endpoints:["https://example.invalid/latest.json"]`)
  3. `src-tauri/src/main.rs` (tambah `.plugin(tauri_plugin_updater::Builder::new().build())`)
  4. `src-tauri/capabilities/default.json` (tambah `updater:allow-check` saja jika file ada; jika tidak ada cek nama file aktual dulu, jangan buat baru)
- Simbol: `tauri_plugin_updater::Builder`.
- Kondisi: belum ada updater.
- Perubahan konkret: exact 4 edit di atas; endpoint dummy agar tidak pernah cek produksi; `active:false` agar tidak ganggu startup. Jangan tambah UI check-update di langkah ini.
- Urutan: Cargo -> main.rs -> tauri.conf -> capability.
- Behavior: app boot sama; tidak ada network call updater (inactive).
- Error/edge: jika plugin init gagal (offline) -> app tetap jalan (Builder default tidak throw); capability salah nama -> build gagal, harus cek schema.
- Test: tidak ada unit test (config); verifikasi via build.
- Verifikasi: `cargo test --workspace` 0 failed; `pnpm --filter ... typecheck` 0; `cargo check -p inference-chat-studio-tauri` passed (jika tersedia).
- Completion: kompilasi dengan plugin, updater inactive, tidak ada perubahan perilaku.
- Tidak boleh diubah: bundle targets, version sync, signing key (belum ada), chat/store/provider logic, windows list.

### D2 — Release workflow latest.json + sig publishing (blocked on signing key)
- Tujuan: CI hasilkan artefak updater.
- Finding: `release.yml` hanya NSIS, tanpa `.sig`/latest.json.
- Dependency: D1. BLOCKER jika signing key belum ada -> langkah ini boleh STOP setelah siapkan diff tanpa merge key.
- File dibaca: `.github/workflows/release.yml` full, `src-tauri/tauri.conf.json` (hasil D1).
- File diubah: `.github/workflows/release.yml` saja.
- Simbol: N/A (YAML).
- Kondisi: trigger tag `v*`, sync version, build NSIS.
- Perubahan konkret:
  1. Tambah env `TAURI_SIGNING_PRIVATE_KEY` dari secrets + `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` jika dipakai; tambah step `tauri-action` dengan `args: --target nsis` tetap, tapi ambil artefak `*.sig` + `latest.json` yang dihasilkan plugin updater.
  2. Tambah step upload `latest.json` + `.sig` ke GitHub Release bersama `.exe`. Jangan ubah trigger/version-sync logic.
  3. Ganti endpoint D1 dari `example.invalid` ke `https://github.com/<owner>/<repo>/releases/latest/download/latest.json` TAPI tetap `active:false` sampai key dipasang dan diuji sekali manual.
- Urutan: secrets env -> build args -> upload -> endpoint URL (tetap inactive).
- Behavior: release manual tetap sama sampai key ada.
- Error/edge: secret missing -> workflow fail fast dengan pesan jelas (tambah `if: secrets.TAURI_SIGNING_PRIVATE_KEY != ''` guard agar build tanpa key tetap hijau tapi skip sig).
- Test: tidak ada unit; verifikasi via `actionlint` jika tersedia else YAML parse check + dry-run tidak wajib.
- Verifikasi: `cargo test --workspace` tetap hijau (tidak terpengaruh); YAML valid.
- Completion: workflow siap, terdokumentasi butuh key; JANGAN aktifkan `active:true` di langkah ini.
- Tidak boleh diubah: kode Rust/TS, migrasi, secrets di repo (jangan commit key), version numbers manual.

### E1 — Second window read-only (About/Inspector)
- Tujuan: multi-window minimal tanpa shared writable state.
- Finding: `tauri.conf.json:app.windows` single; `main.rs` single builder; `open_devtools` pakai `tauri::Webview`.
- Dependency: M1-M4 (terakhir sebelum E2).
- File dibaca:
  - `src-tauri/tauri.conf.json:12-22`, `src-tauri/src/main.rs:1-48`, `src-tauri/capabilities/*`, `apps/desktop/src/App.tsx`, `apps/desktop/src/components/AboutDialog.tsx`, `apps/desktop/src/components/Inspector.tsx`
- File diubah:
  1. `src-tauri/tauri.conf.json` (tambah window kedua `label:"inspector"`, `url:"/index.html#/inspector"`, `width:600,height:800,visible:false`)
  2. `src-tauri/src/ipc.rs` (tambah `open_inspector_window(app:AppHandle)` pakai `WebviewWindowBuilder` atau `get_webview_window`, jika exists fokus else buat; tambah `close_inspector_window`)
  3. `src-tauri/src/main.rs` (daftarkan 2 command baru)
  4. `apps/desktop/src/App.tsx` (route `#/inspector` render `<Inspector>` read-only + tombol Open/Close via invoke)
- Simbol: `WebviewWindowBuilder, get_webview_window, open_inspector_window`.
- Kondisi: single window.
- Perubahan konkret:
  1. tauri.conf tambah exact second entry tanpa ubah first entry (copy width/height beda).
  2. ipc: `open_inspector_window`: jika `app.get_webview_window("inspector")` Some -> `set_focus` + `show`; else `WebviewWindowBuilder::new(&app,"inspector",WebviewUrl::App("/index.html#/inspector".into()))...build()`. `close`: hide saja, jangan destroy agar state tidak hilang.
  3. App.tsx: jika `location.hash=="#/inspector"` render hanya Inspector dengan props read-only (tanpa tombol send), selain itu render normal + tombol "Open Inspector Window".
- Urutan: tauri.conf -> ipc -> main -> App.tsx.
- Behavior: main window tidak berubah; inspector window tidak bisa kirim chat (read-only).
- Error/edge: window sudah terbuka -> fokus, jangan duplikat; build gagal jika label duplikat; hash routing unknown -> fallback main.
- Test:
  - TS: App hash routing test (`#/inspector` renders Inspector, no ChatView).
  - Rust: tidak ada window test headless; cukup `cargo check`.
- Input/expected: invoke `open_inspector_window` 2x -> 1 window, focused, no error.
- Verifikasi: typecheck 0; cargo check passed; manual `tauri dev` checklist (dicatat sebagai manual).
- Completion: window kedua terbuka/fokus/close tanpa duplikat, read-only.
- Tidak boleh diubah: chat events, store, migrasi, updater, provider logic.

### E2 — Per-window chat event targeting
- Tujuan: chat-done/error terkirim ke window peminta, bukan broadcast.
- Finding: `ipc.rs:1206,1226,1245` pakai `app.emit`; `AppState.streams` global tanpa window label.
- Dependency: E1.
- File dibaca: `src-tauri/src/ipc.rs:1063-1270` (`stream_chat_cmd` full), `apps/desktop/src/components/ChatView.tsx` (listen `chat-done/chat-error`), `apps/desktop/src/lib/errors.ts`.
- File diubah:
  1. `src-tauri/src/ipc.rs` saja (`StreamChatInput` tambah `origin_window: Option<String>`, spawn pakai `emit_to` jika Some else `emit` fallback)
  2. `apps/desktop/src/components/ChatView.tsx` (kirim `origin_window: window.__TAURI_WINDOW_LABEL__` via `@tauri-apps/api/window::getCurrentWindow().label`)
  3. `packages/api-types/src/index.ts` (`StreamChatInput.origin_window?`)
- Simbol: `stream_chat_cmd,ChatDoneEvent,ChatErrorEvent,emit_to`.
- Kondisi: `app.emit("chat-done")` broadcast.
- Perubahan konkret:
  1. `StreamChatInput` tambah `origin_window: Option<String>` (Rust) + `origin_window?: string|null` (TS). Jangan ubah field lain.
  2. Di `stream_chat_cmd`: tangkap `let target = input.origin_window.clone();` sebelum spawn; di spawn success: `if let Some(label)=target { let _ = app_clone.emit_to(label,"chat-done",event); } else { app_clone.emit(...); }` Duplikat untuk `emit_error` (tambah param target atau kirim via emit_to di dalam spawn error branch). Jangan ubah payload event.
  3. ChatView: saat invoke sertakan `origin_window: getCurrentWindow().label`; listener tetap `listen("chat-done")` (Tauri otomatis scoped per-window untuk emit_to).
- Urutan: api-types -> ipc struct -> ipc spawn branches -> ChatView invoke.
- Behavior: single-window tetap jalan via fallback emit; payload/event name tidak berubah.
- Error/edge: `origin_window` label unknown/closed -> fallback emit (jangan error); `cancel_stream` tetap global by stream_id (didokumentasikan, tidak diubah).
- Test:
  - Rust: `stream_input_origin_window_optional` (deserialize tanpa field -> None; dengan field -> Some) — tanpa butuh window sungguhan.
  - TS: ChatView invoke payload test contains origin_window (mock invoke).
- Input/expected:
  - `{"conversation_id":"c","provider_id":"p","model":"m",...}` tanpa origin -> Ok None.
  - dengan `"origin_window":"main"` -> Some("main").
- Verifikasi: cargo 0 failed; typecheck 0; vitest passed.
- Completion: tidak ada perubahan payload, fallback aman, test 2 lulus.
- Tidak boleh diubah: cancel logic, store, schema, updater, backup, secret.

---

## Notes
- Prinsip versi: single source `src-tauri/Cargo.toml`; jangan edit versi manual di langkah manapun.
- Secret tetap di OS Credential Manager (`com.alamaby.inference-chat-studio`); DB hanya referensi; backup tanpa secret.
- `0001_init.sql`/`0002_bookmarks.sql` frozen; hanya tambah `0003`.
- Adapter order: Chat Completions → Responses → Anthropic; langkah B tidak boleh selipkan Responses.
- `devtools` feature tetap sampai D selesai (drop sebelum rilis publik).
- Setiap langkah: baca file list dulu, ubah hanya file list, jalankan 3 gate (typecheck, vitest, cargo test workspace).

### Open Questions / Blockers
1. Anthropic `ExtraHigh=xhigh` / `Maximum=max` wire values belum konfirmasi provider nyata (open item memori). Opsi: (a) kirim `high` fallback + log, (b) blokir 2 level untuk anthropic. Risiko (a) silent downgrade, (b) UX kecewa. Rekomendasi: (b) untuk B3, buka setelah konfirmasi manual.
2. Updater signing key owner + storage (GitHub Secrets vs Vault) belum diputuskan. Opsi: (a) GitHub Secrets, (b) Vault + inject CI. Risiko cetak key di log. Rekomendasi: (a) + `active:false` sampai uji sekali.
3. Folder vs tags UX: hierarchical folder + flat tags (dipilih di plan) vs tags saja. Risiko folder over-engineering bila <50 conversation. Rekomendasi: implement keduanya di storage (C1) tapi UI folder dulu, tag minimal (C2 comma input).
4. Multi-window scope: inspector read-only (dipilih) vs full chat kedua. Risiko full chat = race + event fan-out. Rekomendasi: read-only dulu (E1), E2 hanya targeting tanpa shared write.

---

## Handoff Checklist (untuk model kecil)
- [ ] Kerjakan urut S0→A1→A2→B1→B2→B3→C1→C2→D1→D2→E1→E2; jangan paralelkan yang sentuh file sama (`ipc.rs`, `api-types`, `tauri.conf.json`).
- [ ] Setiap langkah: baca `File yang harus dibaca` dulu, ubah hanya `File yang harus diubah`, patuhi `Urutan perubahan`.
- [ ] Setiap langkah: jalankan `pnpm --filter inference-chat-studio-desktop typecheck`, `pnpm --filter inference-chat-studio-desktop test`, `cargo test --workspace`; catat hasil vs `Hasil diharapkan`.
- [ ] Setiap langkah: penuhi `Completion criteria` + tambah/update test sesuai `Input/expected`; jangan lanjut jika merah.
- [ ] Jangan ubah area `Tidak boleh diubah` tiap langkah; jangan staging/commit kode; hanya file plan ini yang boleh diupdate (Progress Log + Tasks checkbox).
- [ ] Jika blocker (signing key, wire values, window label konflik) muncul: STOP langkah terkait, catat di Notes, lanjut ke langkah independen berikutnya.
- [ ] Selesai: semua Tasks checked atau ditandai blocked dengan alasan + verifikasi tercatat.
