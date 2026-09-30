# Memory Index — inference-chat-studio

Last updated: 2026-09-28
Format version: 1

## Current state
MVP-0 Windows implemented per `plans/2026-09-28-inference-chat-studio-mvp0-windows-plan.md`
(all 10 steps). Gate green: 11 Rust tests di `inference-chat-studio-tauri` (3 lama + 8 baru),
30+ di workspace; 56 vitest (`backup.test.ts` 14 baru). Typecheck bersih. No commits yet
(branch `main`, untracked files pending).

## Active decisions
- rusqlite (bundled) for local store; migration `0001_init.sql` is the schema source of truth.
- Adapter order: Chat Completions → Responses → Anthropic (only the first is built).
- Reasoning 8 levels + Custom; wire `ExtraHigh=xhigh`, `Maximum=max` (unconfirmed vs real providers).
- Tauri IPC primary; Actix stub disabled. No updater, no signing in MVP.
- Secrets in Windows Credential Manager (`com.alamaby.inference-chat-studio`); DB holds only references.

## Open items / blockers
- Manual NSIS install test on Win10 1809+ (no VM in this environment).
- TEST-CHECKLIST.md `Actual` column unfilled (manual).
- Real-provider confirmation of `xhigh` / `max` wire values.
- Final app icons (placeholders in `src-tauri/icons/`).
- Initial commit pending (user decision: what to include/exclude, e.g. `target/` is gitignored).

## Recent entries
- [2026-09-28 MVP-0 Windows implementation](2026-09-28/093000-mvp0-windows-implementation.md)
- [2026-09-30 About + Export/Import Backup](2026-09-30/211200-about-export-import-backup.md)
- [2026-09-30 Provider Key Rotate/Replace](2026-09-30/230800-provider-key-rotate.md)
