# About + Export/Import Backup

Date: 2026-09-30 21:12:00
Plan: `plans/2026-09-30-about-export-import-implementation-plan.md` (10 langkah, semua done).

## Task
Add an About dialog showing semver + commit-count build number baked at build time, and export/import of providers + models + chat history as a single `ics-backup-v1.json` file (merge-only, no secrets).

## Files changed
- `src-tauri/build.rs` — new; embeds `ICS_BUILD_NUMBER` (env → git count → `"0"`), `ICS_GIT_SHA`, `ICS_BUILD_TIME` (epoch seconds).
- `src-tauri/src/ipc.rs` — structs `AppInfo/BackupProvider/BackupConversation/BackupFile/ImportSummary`; handlers `get_app_info/export_backup/import_backup`; pure helpers `backup_from_db/import_backup_file/validate_backup`.
- `src-tauri/src/main.rs` — registers new handlers.
- `packages/api-types/src/index.ts` — appends TS mirror types + `BACKUP_FORMAT/BACKUP_VERSION` constants.
- `apps/desktop/src/lib/backup.ts` — new; pure validators + parser + download helper (UTC filename).
- `apps/desktop/src/lib/backup.test.ts` — new; 14 vitest cases.
- `apps/desktop/src/components/AboutDialog.tsx` — new; dialog with loading/error/retry/copy (clipboard fallback to prompt).
- `apps/desktop/src/components/DataBackup.tsx` — new; collapsible with Export/Import buttons, file-size gate (50 MB), result/error display.
- `apps/desktop/src/App.tsx` — wires About button in header, `<DataBackup />` in sidebar, `<AboutDialog />` portal.
- `plans/2026-09-30-about-export-import-implementation-plan.md` — updated tasks + progress log.
- `TEST-CHECKLIST.md` + `.memory/README.md` — noted new coverage.

## Decisions
- `build_time` = epoch seconds, not RFC3339 (no `chrono` in build-dependencies). UI labels it as such.
- `tauri::VERSION` compiles — used directly.
- Import is pure merge (new ids); existing rows untouched. Secret store never touched.
- Single-file backup via Blob download + `<input type=file>`; no extra Tauri plugin.

## Risks / open items
- Large backups (>100 MB) may still stress the renderer (file-size gate caps at 50 MB client-side). Pagination not in scope.
- Chat content is included plaintext; user warned via UI hint, no encryption at this stage.
- Manual e2e test remaining (see TEST-CHECKLIST rows below).

## Verification performed
- `cargo test -p inference-chat-studio-tauri` → 11 passed (7 backup + 1 app_info + 3 existing).
- `pnpm --filter inference-chat-studio-desktop test` → 56 passed (14 new in `backup.test.ts`).
- `pnpm --filter inference-chat-studio-desktop typecheck` → clean.
- `git status --short` shows only expected files (no accidental changes to `crates/*`, `capabilities/`, schema).

## Manual verification needed (before commit)
1. `cargo tauri dev` → open About: version=`0.1.0`, build_number numerik-or-"0", name=`Inference Chat Studio`.
2. Export backup from a running profile → confirm file named `ics-backup-0.1.0-YYYYMMDD-HHmmss.json`, no `"credential_reference"` or `"api_key"` strings in file.
3. Import the exported file → summary shows correct counts; provider list refreshed; API key empty re-enter required.
4. F12 / DevTools button still works.

## Commit proposal
`feat: add about dialog and backup export import`

## Related
- Plan: `plans/2026-09-30-about-export-import-implementation-plan.md`
