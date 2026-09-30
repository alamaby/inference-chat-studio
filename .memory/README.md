# Memory Index — inference-chat-studio

Last updated: 2026-09-28
Format version: 1

## Current state
MVP-0 Windows implemented per `plans/2026-09-28-inference-chat-studio-mvp0-windows-plan.md`
(all 10 steps). Gate green: 30 Rust tests, 6 vitest, typecheck clean,
clippy clean, NSIS installer built (unsigned, 4.96 MiB). No commits yet
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
