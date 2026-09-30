# Inference Chat Studio — MVP-0 Windows build

Date: 2026-09-28
Plan: `plans/2026-09-28-inference-chat-studio-mvp0-windows-plan.md` (all 10 steps done)

## Task
Implement MVP-0 greenfield per plan: Tauri + React desktop app, OpenAI
Chat Completions adapter only, SQLite history, Windows Credential Manager
secrets, NSIS embedBootstrapper installer, unsigned manual install.

## Key files created
- `Cargo.toml`, `package.json`, `pnpm-workspace.yaml` (workspace roots)
- `src-tauri/` — `main.rs`, `ipc.rs` (12 commands), `tauri.conf.json`
  (nsis currentUser + embedBootstrapper), placeholder icons
- `crates/conversation-store/` — migration `0001_init.sql`, `db.rs`
- `crates/secret-store/` — `SecretStore` trait + `WindowsCredentialStore`
  + test-only `InMemoryStore` (`test-utils` feature)
- `crates/provider-core/` — error taxonomy, reasoning 8+Custom enum
- `crates/provider-openai/` — Chat Completions adapter (models, test,
  SSE stream, reasoning map `ExtraHigh→xhigh`, `Maximum→max`)
- `crates/actix-api/` — disabled stub
- `apps/desktop/src/` — ProviderForm, ModelSelector, SettingsSimple
  (capability-gated), ChatView, MessageList, ConversationList, Inspector
- `packages/api-types/` — TS mirror of IPC DTOs
- `.github/workflows/ci-windows.yml`, `README-INSTALL.md`,
  `TEST-CHECKLIST.md`, `.gitignore`

## Decisions / assumptions
- `rusqlite` (bundled) chosen over sqlx at Step 2; locked.
- TTFT measured in-adapter (send → first content delta), persisted and
  emitted via `chat-done`.
- Per-delta `chat-chunk` events deferred; `ChatChunkEvent` type reserved.
- Streaming is collect-then-emit: UI shows "Waiting for response…" then
  the full reply (honest placeholder, no fake token animation).
- `beforeBuildCommand` uses `pnpm --filter` (cwd-independent); build must
  run from repo root or `src-tauri/`.
- Installer artifact path is `target/release/bundle/nsis/` (workspace
  root), not `src-tauri/target/...`.

## Risks / open items
- Manual install verification on Win10 1809+ and TEST-CHECKLIST `Actual`
  column need a real machine/VM (none in this environment).
- Open questions from plan Notes unresolved: `xhigh` vs `extra_high`,
  `max` vs `maximal` wire values — need a real provider response to
  confirm; `Custom` is the escape hatch.
- Icons are placeholders; final artwork needed before public release.
- Unsigned build → SmartScreen warning (expected, documented).

## Verification performed
- `cargo test --workspace`: 30 passed, 0 failed
- `pnpm typecheck`: exit 0; `vitest`: 6 passed
- `cargo clippy --workspace --all-targets`: 0 warnings
- NSIS build: `Inference Chat Studio_0.1.0_x64-setup.exe` (4.96 MiB),
  SHA256 `03F7B6B91BB30C42A9384833671C0E7487C1A8CABB99696A415F5898DEF8D4CC`

## Conventional commit proposal
`feat: implement MVP-0 Windows inference workspace`
