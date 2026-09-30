# Inference Chat Studio — MVP-0 Test Checklist

Gate: all 12 rows checked + `cargo test --workspace`, `typecheck`, and
`pnpm test` green on Windows. `Actual` is filled during manual verification.

| # | Area | Input | Expected | Actual |
|---|------|-------|----------|--------|
| 1 | Provider CRUD | Add provider `Local` (`http://127.0.0.1:8000/v1`, key `local-key`); edit name; delete | List updates; no secret in `list_providers` output | |
| 2 | Test connection (401/timeout) | Bad key against mock → 401; stopped server | `Unauthorized` / `Connection Failed` (or `Timeout`) badge | |
| 3 | Refresh models | `refresh_models` against Chat Completions mock | Dropdown fills with `m1, m2`; `last_seen_at` updates | |
| 4 | Manual model | Add `my-model` manually | Appears with manual badge; survives refresh | |
| 5 | Reasoning blocked | Reasoning-capable=`false` model + level `High`, send | Send blocked with "Not supported by this model"; no HTTP fired | |
| 6 | Chat stream + stop + regenerate | Send message; Stop mid-stream; Retry | Placeholder → reply + `chat-done`; cancel persists `status: cancelled`; Retry re-sends | |
| 7 | History search/rename/delete/filter | New conversation per provider/model; rename; delete; filter | Persisted across restart; filters match provider/model | |
| 8 | Inspector masked | Open Inspector on a reply | URL/method/body visible; `Authorization: [REDACTED]`; usage/TTFT/duration shown; raw truncated > 20 KB | |
| 9 | Offline cache | Kill server; reopen model dropdown | Last cached list still shown | |
| 10 | Restart persistence | Restart app | Providers, models, conversations intact; `credential_reference` = `keyring:…`, no `sk-` in DB | |
| 11 | NSIS install (Win10 1809+) | Run `Inference Chat Studio_0.1.0_x64-setup.exe` per-user | Installs without admin; WebView2 bootstrapper runs once; app launches | |
| 12 | Uninstall | Remove via Settings → Apps | App removed; data dir documented as optionally remaining | |

Automated coverage (CI): `cargo test --workspace` (conversation-store 6,
secret-store 5, provider-core 5, provider-openai 11, tauri IPC 3),
`vitest` (reasoning 3, inspector 3).
New coverage after 2026-09-30 feature work:
Rust `inference-chat-studio-tauri`: +8 (app_info_semver, export_backup_excludes_secrets,
export_backup_on_empty_db, import_backup_merges_with_new_ids, import_backup_rejects_bad_format,
import_backup_rejects_unsupported_version, import_backup_skips_dangling_bookmark,
import_backup_skips_unsupported_provider).
Vitest: +14 in `src/lib/backup.test.ts` (validateBackupFile, parseBackupJsonText, buildBackupFilename);
+3 in `src/stores/providerStore.test.ts` (rotateProviderKey valid / empty key / error propagate).
