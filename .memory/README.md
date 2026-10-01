# Memory Index — inference-chat-studio

Last updated: 2026-10-01
Format version: 1

## Current state
MVP-0 Windows implemented per `plans/2026-09-28-inference-chat-studio-mvp0-windows-plan.md`
(all 10 steps). Chat enhancements (shortcuts, rename/delete hygiene, prompt
templates, single export, usage summary) implemented 2026-10-01 per
`plans/2026-10-01-chat-enhancements-implementation-plan.md`. Enhancements
(Anthropic provider, folders/tags, settings panel, updater, multi-window)
implemented 2026-10-01 per `plans/2026-10-01-enhancements-implementation-plan.md`.
Version 0.2.0. Gate green: typecheck clean, 98 vitest (15 file), cargo workspace
50 tests 0 failed. Manual UI checklist (20 item) still pending (`tauri dev`).

## Active decisions
- rusqlite (bundled) for local store; migrations `0001_init.sql` + `0002_bookmarks.sql` + `0003_folders_tags.sql` are the schema source of truth.
- Adapter order: Chat Completions → Responses → Anthropic (Chat Completions + Anthropic built; Anthropic reasoning limited to None/Automatic/Custom).
- Reasoning 8 levels + Custom; wire `ExtraHigh=xhigh`, `Maximum=max` (unconfirmed vs real providers).
- Tauri IPC primary; Actix stub disabled. Updater plugin wired but `active:false` (no signing key yet).
- Secrets in Windows Credential Manager (`com.alamaby.inference-chat-studio`); DB holds only references.
- Single version source: `src-tauri/Cargo.toml` (`CARGO_PKG_VERSION`); sync to tauri.conf.json + package.json files on release.
- Prompt templates v1: `localStorage` only (`ics.promptTemplates.v1`), not in backup.
- Usage tracking: token aggregates only, no pricing table.
- Backup format v2 (folders/tags); v1 still importable.
- Multi-window: inspector window read-only; chat events targeted via `origin_window` + `emit_to`.

## Open items / blockers
- Manual NSIS install test on Win10 1809+ (no VM in this environment).
- TEST-CHECKLIST.md `Actual` column unfilled (manual).
- Real-provider confirmation of `xhigh` / `max` wire values.
- Anthropic reasoning wire values (Minimal..Maximum) unconfirmed — blocked on provider docs.
- Updater signing key not yet provisioned (GitHub Secrets `TAURI_SIGNING_PRIVATE_KEY`).
- Final app icons (placeholders in `src-tauri/icons/`).
- Manual UI checklist for chat enhancements (20 item) pending.
- Release workflow version-sync patterns still match `0.1.0` literal (stale after 0.2.0 bump).

## Recent entries
- [2026-10-01 Chat Enhancements](2026-10-01/090000-chat-enhancements.md)
- [2026-09-28 MVP-0 Windows implementation](2026-09-28/093000-mvp0-windows-implementation.md)
- [2026-09-30 About + Export/Import Backup](2026-09-30/211200-about-export-import-backup.md)
- [2026-09-30 Provider Key Rotate/Replace](2026-09-30/230800-provider-key-rotate.md)
- [2026-09-30 Release Workflow + README Overhaul](2026-09-30/233100-release-workflow-readme.md)
