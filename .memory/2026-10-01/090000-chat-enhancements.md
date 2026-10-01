# Chat Enhancements (5 usulan) — Implementation

Date: 2026-10-01
Plan: `plans/2026-10-01-chat-enhancements-implementation-plan.md`

## Task

Implement 5 enhancement usulan, frontend-only (tanpa migrasi DB, tanpa command Rust baru):

1. Keyboard shortcuts `Ctrl+N` (new chat) + `Ctrl+B` (bookmark seleksi); `Ctrl+K` sudah ada.
2. Conversation rename/delete hygiene (konfirmasi hapus, batal rename, validasi kosong).
3. Prompt templates (save/load system prompt, `localStorage` v1).
4. Export single conversation (Markdown/JSON).
5. Token usage tracking (agregat per conversation, tanpa pricing).

## Key files changed

- `apps/desktop/src/lib/conversation.ts` — `sanitizeRenameTitle`
- `apps/desktop/src/lib/shortcuts.ts` (baru) — `matchShortcut` pure
- `apps/desktop/src/lib/singleExport.ts` (baru) — filename/JSON/Markdown/download
- `apps/desktop/src/lib/metrics.ts` — `parseUsageJson` + `aggregateConversationUsage`
- `apps/desktop/src/lib/promptTemplates.ts` (baru) — CRUD template `localStorage`
- `apps/desktop/src/components/ConversationList.tsx` — delete 2-klik, Escape/Enter rename
- `apps/desktop/src/components/ChatView.tsx` — tombol Export MD/JSON + `exportSingle`
- `apps/desktop/src/components/ConversationUsage.tsx` (baru) — ringkasan token
- `apps/desktop/src/components/MessageList.tsx` — listener `ics:bookmark-from-selection`
- `apps/desktop/src/components/SettingsSimple.tsx` — blok template Apply/Delete/Save
- `apps/desktop/src/App.tsx` — extend keydown (F12 dipertahankan)
- Test baru: `shortcuts.test.ts` (8), `singleExport.test.ts` (5), `promptTemplates.test.ts` (4); diperbarui: `conversation.test.ts` (+4), `metrics.test.ts` (+5)

## Decisions / risks

- D1: tidak ada perubahan Rust — semua frontend-only.
- D2: templates di `localStorage` (`ics.promptTemplates.v1`), tidak ikut backup (hint di UI).
- D3: usage tanpa pricing (tabel harga tidak ada di repo).
- D4: `Ctrl+B` via `CustomEvent` dari `App` ke `MessageList`; `Ctrl+K` tetap milik `CommandPalette`.
- Koreksi plan: path import `singleExport.ts` harus `../../../../packages/...` (bukan `../../../`).
- `SettingsSimple.tsx` perlu import `btn` yang sebelumnya tidak ada.

## Verification

- `pnpm --filter inference-chat-studio-desktop typecheck` → clean
- `pnpm --filter inference-chat-studio-desktop test` → 85 passed (14 file)
- `cargo test --workspace` → 0 failed
- Checklist manual 20 item (butuh `tauri dev`) belum dijalankan — tercatat di plan.

## Version bump

0.1.0/0.1.1 → **0.2.0** di: `src-tauri/Cargo.toml` (single source), `src-tauri/tauri.conf.json`, `package.json`, `apps/desktop/package.json`, `packages/api-types/package.json`, `Cargo.lock`.

## Commit proposal

`feat: add shortcuts, rename-delete hygiene, single export, usage summary, and prompt templates`
