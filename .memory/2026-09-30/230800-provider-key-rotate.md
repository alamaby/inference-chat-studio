# Provider Key Rotate/Replace

Date: 2026-09-30 23:08:00
Plan: `plans/2026-09-30-provider-key-rotate-implementation-plan.md` (3 langkah, semua done).

## Task
Add provider API key rotation from the existing Providers panel — replace stored key via `update_provider` without showing the old key or deleting the provider.

## Files changed
- `apps/desktop/src/stores/providerStore.ts` — interface + implementation of `rotateProviderKey`: validates non-empty, invokes `update_provider` with `{ id, input: { api_key } }`, replaces provider in list, resets status to `"not_tested"` and clears error. Also fixed `loadProviders` selection logic (previous edit referenced out-of-scope vars — now reads from `get()`).
- `apps/desktop/src/stores/providerStore.test.ts` — appended `describe("rotateProviderKey")` with 3 tests: valid rotate checks exact invoke shape + state reset; empty key throws before invoke; backend error propagates without touching list.
- `apps/desktop/src/components/ProviderForm.tsx` — new destructure binding, 4 local states (`expandedKeyId`, `rotatingId`, `newKey`, `rotateError`), functions `toggleRotate` / `rotate`, Rotate key button per item (disabled while rotating), expandable inline form with hint ("Mengganti key di OS store; key lama tidak dapat ditampilkan.") and Save/Delete disabled states, error display via `formatIpcError`. Delete button also disables during a concurrent rotate.
- `plans/2026-09-30-provider-key-rotate-implementation-plan.md` — tasks + progress log updated.

## Decisions kept
- Key-only scope (no full-edit); no auto-test after rotate; no `window.confirm`; one-open-form mutex.
- Invoke shape verified by test L1-T1: `{ id, input: { api_key } }` — prevents silent no-op from camelCase typo inside `input`.

## Risks
- Silent no-op if invoke shape is wrong → caught by L1-T1.
- Secret lingering in React state → cleared on success path.
- Draft cross-contamination between providers → single-expanded-key mutex.
- No component tests → manual checklist covers it.

## Verification performed
- `pnpm --filter inference-chat-studio-desktop typecheck` → clean.
- `pnpm --filter inference-chat-studio-desktop test` → 59 passed (3 baru).
- `cargo test -p inference-chat-studio-tauri` → 11 passed (regresi).
- `cargo clippy -- -D warnings` → Finished bersih.

## Manual verification needed (before commit)
1. `cargo tauri dev` → panel Providers, klik "Rotate key" pada satu provider.
2. Form expand: input password kosong (BUKAN terisi key lama), tombol "Save new key", hint teks muncul.
3. Save kosong → pesan lokal "API key must not be empty.", tidak ada invoke IPC.
4. Isi key baru → Save → form collapse, draft kosong; badge provider jadi "not_tested"; tidak ada request otomatis.
5. Klik "Test connection" → badge berubah sesuai hasil.
6. Kirim satu chat pakai provider tersebut → sukses (key baru benar).
7. Buka provider lain → form rotate sebelumnya tertutup dan draft kosong.

## Commit proposal
`feat: add provider api key rotation`

## Related
- Plan: `plans/2026-09-30-provider-key-rotate-implementation-plan.md`
- Backup feature (sebelumnya): `.memory/2026-09-30/211200-about-export-import-backup.md` — provider yang di-import tanpa key bisa di-rotate setelahnya.
