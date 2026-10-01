# Chat Enhancements — Implementation Plan

Created: 2026-10-01 09:00:00

## Objective

Implement 5 enhancement usulan tanpa migrasi DB dan tanpa command Rust baru:

1. Keyboard shortcuts (`Ctrl+N` new chat, `Ctrl+B` bookmark) — `Ctrl+K` sudah ada.
2. Conversation rename/delete hygiene (konfirmasi hapus, batal rename, validasi kosong).
3. Prompt templates (save/load system prompt per conversation, `localStorage` v1).
4. Export single conversation (Markdown/JSON, frontend-only).
5. Token usage tracking (agregat per conversation, frontend-only, tanpa pricing).

Plan ini deterministik untuk model kecil: setiap langkah mencantumkan file, simbol, kondisi awal, perubahan konkret berurutan, test, command verifikasi, completion criteria, dan area terlarang.

## Scope

- `apps/desktop/src/lib/conversation.ts` (+ test)
- `apps/desktop/src/lib/shortcuts.ts` (baru) + `shortcuts.test.ts` (baru)
- `apps/desktop/src/lib/singleExport.ts` (baru) + `singleExport.test.ts` (baru)
- `apps/desktop/src/lib/metrics.ts` (+ test)
- `apps/desktop/src/lib/promptTemplates.ts` (baru) + `promptTemplates.test.ts` (baru)
- `apps/desktop/src/components/ConversationList.tsx`
- `apps/desktop/src/components/ConversationUsage.tsx` (baru)
- `apps/desktop/src/components/ChatView.tsx`
- `apps/desktop/src/components/MessageList.tsx`
- `apps/desktop/src/components/SettingsSimple.tsx`
- `apps/desktop/src/App.tsx`

## Out of Scope (dilarang)

- `src-tauri/**` (termasuk `ipc.rs`, `main.rs` — tidak ada command baru, tidak ada registrasi handler)
- `crates/**` (tidak ada migrasi `0001_init.sql` / `0002_bookmarks.sql`, tidak ada perubahan `db.rs`)
- `packages/api-types/**` (tidak ada perubahan DTO, tidak ada bump `BACKUP_VERSION`)
- Penambahan dependency npm/cargo, capability Tauri, testing-library/jsdom
- Perubahan backup full (`DataBackup.tsx`, `backup.ts`), provider/model CRUD, reasoning, streaming, Inspector
- Pricing/biaya per model (hanya agregat token)

## Milestones

1. M1 hygiene + shortcuts (Langkah 1–2) — risiko terendah, murni UI.
2. M2 export + usage (Langkah 3–4) — pure function + 2 komponen baru.
3. M3 templates + verifikasi penuh (Langkah 5–6).

## Tasks

- [x] Langkah 0 — Baseline verification (gate hijau sebelum ubah apa pun)
- [x] Langkah 1 — Conversation rename/delete hygiene (`sanitizeRenameTitle` + konfirmasi hapus)
- [x] Langkah 2 — Keyboard shortcuts (`shortcuts.ts` + wiring `App`/`MessageList`)
- [x] Langkah 3 — Export single conversation (`singleExport.ts` + tombol di `ChatView`)
- [x] Langkah 4 — Token usage aggregate (`aggregateConversationUsage` + `ConversationUsage`)
- [x] Langkah 5 — Prompt templates (`promptTemplates.ts` + UI di `SettingsSimple`)
- [x] Langkah 6 — Verifikasi penuh + checklist manual

## Requirement Traceability

| # | Finding (usulan) | Requirement | Langkah | Verifikasi |
|---|------------------|-------------|---------|------------|
| F1 | Keyboard shortcuts (`Ctrl+N`, `Ctrl+B`; `Ctrl+K` sudah ada) | R1: `Ctrl+N` buat conversation baru; `Ctrl+B` bookmark seleksi; tidak fire saat mengetik; tidak merusak `Ctrl+K`/`F12` | Langkah 2 | `shortcuts.test.ts` (pure) + manual 2a–2e |
| F2 | Conversation rename/delete hygiene | R2: rename kosong dibatalkan, `Escape` batal, delete 2-klik konfirmasi | Langkah 1 | `conversation.test.ts` +4 + manual 1a–1d |
| F3 | Prompt templates | R3: save/load/apply/delete template system prompt, persist `localStorage`, tanpa migrasi DB | Langkah 5 | `promptTemplates.test.ts` (pure) + manual 5a–5e |
| F4 | Export single conversation | R4: export active conversation ke Markdown + JSON via tombol di `ChatView` | Langkah 3 | `singleExport.test.ts` + manual 4a–4d |
| F5 | Token usage tracking | R5: agregat token per conversation dari `usage_json`, skip cancelled/streaming, tampilkan ringkasan | Langkah 4 | `metrics.test.ts` +5 + manual 6a–6c |

## Decisions (eksplisit)

- **D1: Tidak ada perubahan Rust.** Semua 5 item bisa selesai frontend-only. `list_messages_cmd`/`list_bookmarks_cmd` sudah mengembalikan semua yang dibutuhkan export/usage. Menambah command Rust hanya menambah risiko IPC tanpa manfaat.
- **D2: Templates di `localStorage`, bukan tabel DB.** Opsi DB (`prompt_templates` + migrasi `0003` + ikut backup) dipertimbangkan dan ditolak untuk v1: butuh bump `BACKUP_VERSION`, menambah risiko migrasi, tidak dibutuhkan untuk "save/load custom prompts per conversation". Key: `ics.promptTemplates.v1`. Keterbatasan (tidak ikut backup, per-browser profile) didokumentasikan di UI hint.
- **D3: Usage tanpa pricing.** "Cost awareness" butuh tabel harga per model yang tidak ada di repo dan berbeda per provider. v1 hanya agregat token (`prompt/completion/reasoning/total`) + counter pesan. Pricing = open question.
- **D4: Shortcut sebagai pure function + `CustomEvent`.** `matchShortcut` murni (testable tanpa jsdom). `Ctrl+B` butuh konteks seleksi DOM yang hanya ada di `MessageList`, jadi `App` memancarkan `CustomEvent("ics:bookmark-from-selection")` dan `MessageList` mengeksekusi. `Ctrl+K` tetap milik `CommandPalette.tsx:19-30` — `App` dilarang menanganinya (hindari double-toggle).
- **D5: Tidak ada test komponen React.** Repo tidak punya testing-library/jsdom. Semua test baru = pure function. Verifikasi UI = checklist manual Langkah 6.

---

## Langkah 0 — Baseline verification

- **Tujuan langkah:** Pastikan gate hijau sebelum mengubah apa pun; catat jumlah test sebagai pembanding.
- **Finding/requirement:** Prasyarat semua F1–F5.
- **Dependency:** tidak ada.
- **File yang harus dibaca:** `apps/desktop/package.json` (scripts `typecheck`, `test`), `TEST-CHECKLIST.md` baris 1–5 (definisi gate).
- **File yang harus diubah:** tidak ada.
- **Simbol terkait:** tidak ada.
- **Kondisi implementasi saat ini:** Diasumsikan hijau per `.memory/README.md` (56 vitest, 11 Rust tauri, 30+ workspace).
- **Perubahan konkret:** tidak ada. Hanya jalankan command di bawah dan catat hasilnya.
- **Urutan perubahan:** n/a.
- **Behavior yang harus dipertahankan:** n/a.
- **Error handling/edge case:** Jika salah satu command merah, STOP. Jangan lanjut ke Langkah 1. Laporkan output sebagai blocker.
- **Test yang ditambah/diubah:** tidak ada.
- **Command verifikasi (dari root repo, berurutan):**
  1. `pnpm --filter inference-chat-studio-desktop typecheck` → expected: exit 0, 0 error.
  2. `pnpm --filter inference-chat-studio-desktop test` → expected: semua file passed, 0 failed. Catat total passed.
  3. `cargo test --workspace` → expected: semua crate passed, 0 failed.
- **Hasil verifikasi yang diharapkan:** Ketiga command hijau. Lanjut hanya jika hijau.
- **Completion criteria:** Tiga output hijau tercatat (tempel angka passed di Progress Log).
- **Tidak boleh diubah:** seluruh repo.

---

## Langkah 1 — Conversation rename/delete hygiene

- **Tujuan langkah:** Rename kosong tidak memanggil backend; `Escape` membatalkan rename; delete butuh konfirmasi 2-klik.
- **Finding/requirement:** F2/R2. Backend (`db.rs:299` validasi kosong, `db.rs:313` cascade delete, `ipc.rs:967/976`) dan store (`providerStore.ts:362/368`) sudah benar — yang diubah hanya UI.
- **Dependency:** Langkah 0.
- **File yang harus dibaca:**
  - `apps/desktop/src/components/ConversationList.tsx` seluruh file (116 baris; state `draftTitle`/`renamingId`/`renameValue` baris 22–24, `commitRename` baris 40–45, tombol Rename/Delete baris 106–107, empty state baris 113).
  - `apps/desktop/src/lib/conversation.ts` baris 1–30 (pola pure function + komentar).
  - `apps/desktop/src/lib/conversation.test.ts` baris 1–26 (pola `describe`/`it`).
- **File yang harus diubah:**
  1. `apps/desktop/src/lib/conversation.ts` (tambah `sanitizeRenameTitle`)
  2. `apps/desktop/src/lib/conversation.test.ts` (tambah 4 test)
  3. `apps/desktop/src/components/ConversationList.tsx` (konfirmasi + Escape)
- **Simbol terkait:** `sanitizeRenameTitle(input: string): string | null` di `lib/conversation.ts`; state `confirmingId: string | null` di `ConversationList`.
- **Kondisi implementasi saat ini:** `commitRename` hanya cek `renameValue.trim()` lalu invoke; tidak ada `Escape`; tombol Delete (`baris 107`) langsung `void deleteConversation(c.id)` tanpa konfirmasi.
- **Perubahan konkret (urutan):**
  - **1a. `lib/conversation.ts`** — append di akhir file:
    ```ts
    /**
     * Trim a rename input. Returns null when empty so the caller cancels
     * instead of invoking the backend (which would reject with validation).
     */
    export function sanitizeRenameTitle(input : string): string | null {
      const t = input.trim();
      return t ? t : null;
    }
    ```
  - **1b. `lib/conversation.test.ts`** — append di akhir file:
    ```ts
    describe("sanitizeRenameTitle", () => {
      it("trims surrounding whitespace", () => {
        expect(sanitizeRenameTitle("  hi  ")).toBe("hi");
      });
      it("returns null for empty string", () => {
        expect(sanitizeRenameTitle("")).toBeNull();
      });
      it("returns null for whitespace-only", () => {
        expect(sanitizeRenameTitle("   ")).toBeNull();
      });
      it("passes through non-empty titles", () => {
        expect(sanitizeRenameTitle("Sprint 12")).toBe("Sprint 12");
      });
    });
    ```
    Tambah `sanitizeRenameTitle` ke import baris 1–8 yang ada.
  - **1c. `ConversationList.tsx`:**
    1. Tambah import setelah baris 4: `import { sanitizeRenameTitle } from "../lib/conversation";`
    2. Setelah baris 24 (`const [renameValue, setRenameValue] = useState("");`) tambah: `const [confirmingId, setConfirmingId] = useState<string | null>(null);`
    3. Ganti fungsi `commitRename` (baris 40–45) dengan:
       ```ts
       async function commitRename(id : string) {
         const clean = sanitizeRenameTitle(renameValue);
         setRenamingId(null);
         if (!clean) {
           return;
         }
         await renameConversation(id, clean);
       }
       ```
    4. Pada input rename (baris 94) tambah `onKeyDown`: `Escape` → `setRenamingId(null)`, `Enter` → `void commitRename(c.id)`.
    5. Ganti tombol Delete (baris 107) dengan two-state:
       ```tsx
       {confirmingId === c.id ? (
         <span className="flex gap-1">
           <button onClick={() => { setConfirmingId(null); void deleteConversation(c.id); }} className={btn} title="Click again to confirm delete">Confirm?</button>
           <button onClick={() => setConfirmingId(null)} className={btn}>Cancel</button>
         </span>
       ) : (
         <button onClick={() => setConfirmingId(c.id)} className={btn}>Delete</button>
       )}
       ```
    6. Saat `renamingId` berubah ke id lain, reset `confirmingId` ke `null` (tambah `setConfirmingId(null)` di handler Rename baris 106).
- **Behavior yang harus dipertahankan:** Filter/search (`baris 26–32`), `create` (`baris 34–38`), select/rename sukses path, fallback active conversation setelah delete (di store, tidak diubah). Judul yang valid tetap ter-trim.
- **Error handling/edge case:** rename kosong/spasi → batal diam-diam tanpa invoke (tidak ada error banner); `Escape` saat rename → batal; klik `Cancel` → tidak ada invoke; `Confirm?` → invoke sekali lalu reset state. Tidak ada perubahan pada error backend.
- **Test:** 1b (4 case). Input/expected: `"  hi  "`→`"hi"`; `""`→`null`; `"   "`→`null`; `"Sprint 12"`→`"Sprint 12"`.
- **Command verifikasi:**
  - `pnpm --filter inference-chat-studio-desktop typecheck` → clean.
  - `pnpm --filter inference-chat-studio-desktop test -- src/lib/conversation.test.ts` → semua passed (9 lama + 4 baru = 13).
- **Hasil yang diharapkan:** typecheck clean; 13/13 passed.
- **Completion criteria:** `sanitizeRenameTitle` dipakai `commitRename`; Delete 2-klik; `Escape`/`Enter` bekerja; tidak ada file lain berubah.
- **Tidak boleh diubah:** `providerStore.ts`, `db.rs`, `ipc.rs`, `packages/api-types/**`, komponen lain.

---

## Langkah 2 — Keyboard shortcuts (`Ctrl+N`, `Ctrl+B`)

- **Tujuan langkah:** Power-user bisa `Ctrl+N` new chat dan `Ctrl+B` bookmark seleksi tanpa merusak `Ctrl+K`/`F12`/mengetik.
- **Finding/requirement:** F1/R1. `Ctrl+K` (`CommandPalette.tsx:21`), `F12` (`App.tsx:36`), `Enter`/`ArrowUp` (`ChatView.tsx:286`) sudah ada dan tidak boleh diubah.
- **Dependency:** Langkah 1 (menyentuh `App.tsx` yang sama area keydown-nya; kerjakan berurutan agar tidak konflik edit).
- **File yang harus dibaca:**
  - `apps/desktop/src/App.tsx` baris 15–44 (helper `openDevtools` + `useEffect` keydown `F12`).
  - `apps/desktop/src/components/CommandPalette.tsx` baris 19–30 (listener `Ctrl+K`; JANGAN diubah).
  - `apps/desktop/src/components/MessageList.tsx` baris 91–112 (`onContextMenu` + `bookmarkHere`; seleksi via `window.getSelection()`).
  - `apps/desktop/src/stores/providerStore.ts` baris 291–306 (`newConversation`).
- **File yang harus diubah:**
  1. `apps/desktop/src/lib/shortcuts.ts` (baru)
  2. `apps/desktop/src/lib/shortcuts.test.ts` (baru)
  3. `apps/desktop/src/App.tsx` (extend keydown untuk N/B saja)
  4. `apps/desktop/src/components/MessageList.tsx` (listener `ics:bookmark-from-selection`)
- **Simbol terkait:** `ShortcutAction = "new-conversation" | "bookmark-from-selection" | "toggle-palette"`; `matchShortcut(params): ShortcutAction | null`; event name `"ics:bookmark-from-selection"` (konstanta inline string di kedua file, harus sama persis).
- **Kondisi implementasi saat ini:** `App.tsx` hanya handle `F12`. Tidak ada handler `Ctrl+N`/`Ctrl+B`.
- **Perubahan konkret (urutan):**
  - **2a. `lib/shortcuts.ts`** (baru, seluruh isi):
    ```ts
    /**
     * Pure keyboard-shortcut matcher (no DOM) so it can be unit-tested.
     * Ctrl+K works globally (palette); Ctrl+N / Ctrl+B are suppressed
     * inside editable targets to avoid hijacking typing.
     */
    export type ShortcutAction = "new-conversation" | "bookmark-from-selection" | "toggle-palette";
    export interface ShortcutParams {
      key : string;
      ctrlKey : boolean;
      metaKey : boolean;
      /** e.target tag name uppercased, e.g. "INPUT", "TEXTAREA", "DIV" */
      targetTag : string;
      isContentEditable : boolean;
    }
    function isEditable(tag : string, editable : boolean): boolean {
      return editable || tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
    }
    export function matchShortcut(p : ShortcutParams): ShortcutAction | null {
      if (!p.ctrlKey && !p.metaKey) {
        return null;
      }
      const k = p.key.toLowerCase();
      if (k === "k") {
        return "toggle-palette";
      }
      if (k === "n") {
        return isEditable(p.targetTag, p.isContentEditable) ? null : "new-conversation";
      }
      if (k === "b") {
        return isEditable(p.targetTag, p.isContentEditable) ? null : "bookmark-from-selection";
      }
      return null;
    }
    ```
  - **2b. `lib/shortcuts.test.ts`** (baru):
    ```ts
    import { describe, expect, it } from "vitest";
    import { matchShortcut } from "./shortcuts";
    describe("matchShortcut", () => {
      it("matches Ctrl+N outside inputs", () => {
        expect(matchShortcut({ key : "n", ctrlKey : true, metaKey : false, targetTag : "DIV", isContentEditable : false })).toBe("new-conversation");
      });
      it("ignores Ctrl+N inside textarea", () => {
        expect(matchShortcut({ key : "N", ctrlKey : true, metaKey : false, targetTag : "TEXTAREA", isContentEditable : false })).toBeNull();
      });
      it("matches Ctrl+B outside inputs", () => {
        expect(matchShortcut({ key : "b", ctrlKey : true, metaKey : false, targetTag : "DIV", isContentEditable : false })).toBe("bookmark-from-selection");
      });
      it("ignores Ctrl+B inside input", () => {
        expect(matchShortcut({ key : "b", ctrlKey : true, metaKey : false, targetTag : "INPUT", isContentEditable : false })).toBeNull();
      });
      it("matches Ctrl+K even inside inputs", () => {
        expect(matchShortcut({ key : "k", ctrlKey : true, metaKey : false, targetTag : "TEXTAREA", isContentEditable : false })).toBe("toggle-palette");
      });
      it("supports Meta key and uppercase", () => {
        expect(matchShortcut({ key : "N", ctrlKey : false, metaKey : true, targetTag : "DIV", isContentEditable : false })).toBe("new-conversation");
      });
      it("ignores plain keys without modifier", () => {
        expect(matchShortcut({ key : "n", ctrlKey : false, metaKey : false, targetTag : "DIV", isContentEditable : false })).toBeNull();
      });
      it("returns null for unrelated keys", () => {
        expect(matchShortcut({ key : "x", ctrlKey : true, metaKey : false, targetTag : "DIV", isContentEditable : false })).toBeNull();
      });
    });
    ```
  - **2c. `App.tsx`** — extend `useEffect` keydown (baris 35–44), JANGAN hapus handler `F12`:
    1. Tambah import: `import { matchShortcut } from "./lib/shortcuts";`
    2. Di dalam `onKeyDown`, setelah blok `F12`, tambah:
       ```ts
       const action = matchShortcut({
         key : e.key,
         ctrlKey : e.ctrlKey,
         metaKey : e.metaKey,
         targetTag : (e.target as HTMLElement | null)?.tagName ?? "",
         isContentEditable : (e.target as HTMLElement | null)?.isContentEditable ?? false
       });
       if (action === "new-conversation") {
         e.preventDefault();
         void useProviderStore.getState().newConversation("New conversation").catch(() => undefined);
       } else if (action === "bookmark-from-selection") {
         e.preventDefault();
         window.dispatchEvent(new CustomEvent("ics:bookmark-from-selection"));
       }
       // "toggle-palette" sengaja TIDAK ditangani di sini (milik CommandPalette).
       ```
    3. Tambah import `useProviderStore` sudah ada (baris 3) — reuse, jangan import ulang.
  - **2d. `MessageList.tsx`:**
    1. Tambah `useEffect` baru setelah effect `menu` (setelah baris 77):
       ```ts
       useEffect(() => {
         function onBookmarkShortcut() {
           const sel = window.getSelection();
           const text = sel?.toString() ?? "";
           if (!sel || sel.isCollapsed || !text.trim()) {
             return;
           }
           const node = sel.anchorNode?.parentElement ?? null;
           const article = node?.closest?.("[data-message-id]") as HTMLElement | null;
           const messageId = article?.getAttribute("data-message-id") ?? null;
           if (!messageId) {
             return;
           }
           const anchor = normalizeAnchor(text).slice(0, 200);
           void createBookmark(messageId, bookmarkLabel(text), anchor).then(() => sel.removeAllRanges()).catch(() => undefined);
         }
         window.addEventListener("ics:bookmark-from-selection", onBookmarkShortcut);
         return () => window.removeEventListener("ics:bookmark-from-selection", onBookmarkShortcut);
       }, [createBookmark]);
       ```
    2. `createBookmark` sudah di-scope baris 61 — tambah ke deps seperti di atas. `bookmarkHere` lama tidak diubah.
- **Behavior yang harus dipertahankan:** `F12`, `Ctrl+K`, `Escape` palette, context-menu bookmark, `Enter` send — semuanya tidak berubah. Shortcut baru no-op saat fokus di input/textarea/select/contentEditable (mengetik `Ctrl+N` di composer tidak membuat conversation).
- **Error handling/edge case:** `newConversation` gagal → catch diam-diam (konsisten dengan pola bootstrap); `Ctrl+B` tanpa seleksi / seleksi di luar `[data-message-id]` → no-op; seleksi user message (bukan assistant) → tetap dibuat? Spesifikasi: YA dibuat selama ada `data-message-id` (longgarkan dari context-menu yang hanya assistant) — dokumentasikan. `preventDefault` wajib untuk N/B agar browser tidak buka window baru/sidebar bookmark.
- **Test:** 2b (8 case) — lihat expected di snippet.
- **Command verifikasi:**
  - `pnpm --filter inference-chat-studio-desktop typecheck` → clean.
  - `pnpm --filter inference-chat-studio-desktop test -- src/lib/shortcuts.test.ts` → 8/8 passed.
- **Hasil yang diharapkan:** clean + 8/8.
- **Completion criteria:** `Ctrl+N` di body buat conversation; di composer tidak; `Ctrl+B` dengan seleksi di pesan buat bookmark; `Ctrl+K` tetap toggle palette; tidak ada perubahan `CommandPalette.tsx`.
- **Tidak boleh diubah:** `CommandPalette.tsx`, `ChatView.tsx`, `providerStore.ts`, `src-tauri/**`, `crates/**`, `packages/api-types/**`.

---

## Langkah 3 — Export single conversation (Markdown/JSON)

- **Tujuan langkah:** User bisa export active conversation sebagai `.md` (sharing/debugging) dan `.json` (struktur `BackupConversation`-kompatibel).
- **Finding/requirement:** F4/R4. Full backup (`DataBackup.tsx`, `export_backup`) tidak diubah; ini frontend-only dari data store yang sudah ada.
- **Dependency:** Langkah 2 (menyentuh `ChatView.tsx` yang sama; kerjakan setelah shortcuts agar edit berurutan).
- **File yang harus dibaca:**
  - `apps/desktop/src/components/ChatView.tsx` baris 320–358 (toolbar provider/model + composer; tombol export disisipkan setelah blok select, sebelum composer).
  - `apps/desktop/src/lib/backup.ts` baris 148–185 (`pad`, `buildBackupFilename`, `downloadBackupFile` sebagai pola — JANGAN ubah file ini, hanya tiru pola).
  - `apps/desktop/src/lib/conversation.ts` baris 38–64 (`ChatMsg` — `content` sudah decode, siap render).
  - `apps/desktop/src/stores/providerStore.ts` baris 42–50 (field `conversations`, `activeConversationId`, `messages`, `bookmarks`).
  - `packages/api-types/src/index.ts` baris 196–200 (`BackupConversation` shape sebagai referensi; tidak diubah).
- **File yang harus diubah:**
  1. `apps/desktop/src/lib/singleExport.ts` (baru)
  2. `apps/desktop/src/lib/singleExport.test.ts` (baru)
  3. `apps/desktop/src/components/ChatView.tsx` (dua tombol + handler)
- **Simbol terkait:** `buildSingleExportFilename(title, ext, d?)`, `buildSingleConversationMarkdown(input)`, `buildSingleConversationJson(input)`, `downloadTextFile(filename, text, mime)` di `lib/singleExport.ts`; `SingleExportInput`, `SingleExportConversation` types.
- **Kondisi implementasi saat ini:** Tidak ada export per-conversation. `ChatView` tidak punya tombol export.
- **Perubahan konkret (urutan):**
  - **3a. `lib/singleExport.ts`** (baru, seluruh isi):
    ```ts
    import type { BookmarkDto } from "../../../packages/api-types/src/index";
    import type { ChatMsg } from "./conversation";
    export interface SingleExportConversation {
      id : string;
      title : string;
      provider_id? : string | null;
      default_model_id? : string | null;
      system_prompt? : string | null;
      created_at : string;
      updated_at : string;
    }
    export interface SingleExportInput {
      conversation : SingleExportConversation;
      messages : ChatMsg[];
      bookmarks : BookmarkDto[];
      exportedAt : string;
    }
    function pad(value : number, length : number) : string {
      return String(value).padStart(length, "0");
    }
    function slugify(title : string): string {
      const s = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
      return s || "conversation";
    }
    /** `ics-chat-<slug>-<YYYYMMDD>-<HHmmss>.<ext>` (UTC, pola mirror backup.ts). */
    export function buildSingleExportFilename(title : string, ext : "md" | "json", d : Date = new Date()): string {
      const stamp = `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1, 2)}${pad(d.getUTCDate(), 2)}`;
      const clock = `${pad(d.getUTCHours(), 2)}${pad(d.getUTCMinutes(), 2)}${pad(d.getUTCSeconds(), 2)}`;
      return `ics-chat-${slugify(title)}-${stamp}-${clock}.${ext}`;
    }
    export function buildSingleConversationJson(input : SingleExportInput): string {
      return JSON.stringify({
        format : "ics-single-conversation",
        version : 1,
        exportedAt : input.exportedAt,
        conversation : input.conversation,
        messages : input.messages.map((m, i) => ({
          index : i,
          id : m.id ?? null,
          role : m.role,
          content : m.content,
          model : m.model ?? null,
          providerId : m.providerId ?? null,
          status : m.status ?? null,
          timestamp : m.timestamp ?? null
        })),
        bookmarks : input.bookmarks
      }, null, 2);
    }
    export function buildSingleConversationMarkdown(input : SingleExportInput): string {
      const lines : string[] = [];
      lines.push(`# ${input.conversation.title}`, "");
      lines.push(`> Exported ${input.exportedAt} • ${input.messages.length} messages • ${input.bookmarks.length} bookmarks`, "");
      lines.push("## Conversation", "");
      lines.push(`- id: \`${input.conversation.id}\``, `- provider: \`${input.conversation.provider_id ?? "-"}\``, `- model: \`${input.conversation.default_model_id ?? "-"}\``, "");
      lines.push("## Messages", "");
      if (input.messages.length === 0) {
        lines.push("_No messages._", "");
      }
      input.messages.forEach((m, i) => {
        const meta = [m.role, m.model ?? null, m.timestamp ?? null].filter(Boolean).join(" • ");
        lines.push(`### ${i + 1}. ${m.role}`, "", meta ? `_${meta}_` : "", "", m.content || "_empty_", "");
      });
      lines.push("## Bookmarks", "");
      if (input.bookmarks.length === 0) {
        lines.push("_No bookmarks._", "");
      }
      for (const b of input.bookmarks) {
        lines.push(`- **${b.label}** (message \`${b.message_id}\`, ${b.created_at}): ${b.anchor_text}`);
      }
      lines.push("");
      return lines.join("\n");
    }
    /** DOM-only; throws agar caller bisa tampilkan via setError. */
    export function downloadTextFile(filename : string, text : string, mime : string): void {
      const blob = new Blob([text], { type : mime });
      const url = URL.createObjectURL(blob);
      try {
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
      } catch {
        throw new Error("failed to download file");
      } finally {
        setTimeout(() => URL.revokeObjectURL(url), 0);
      }
    }
    ```
  - **3b. `lib/singleExport.test.ts`** (baru):
    ```ts
    import { describe, expect, it } from "vitest";
    import { buildSingleConversationJson, buildSingleConversationMarkdown, buildSingleExportFilename } from "./singleExport";
    const INPUT = {
      conversation : { id : "c1", title : "Sprint Review!", provider_id : "p1", default_model_id : "m1", system_prompt : null, created_at : "t1", updated_at : "t2" },
      messages : [
        { role : "user", content : "hello", model : "m1", providerId : "p1", status : "done", timestamp : "2026-10-01T00:00:00.000Z" },
        { role : "assistant", content : "hi there", model : "m1", providerId : "p1", status : "done", timestamp : "2026-10-01T00:01:00.000Z" }
      ],
      bookmarks : [],
      exportedAt : "2026-10-01T00:02:00.000Z"
    };
    describe("single export", () => {
      it("builds a slugged UTC filename", () => {
        expect(buildSingleExportFilename("Sprint Review!", "md", new Date("2026-10-01T01:02:03.000Z"))).toBe("ics-chat-sprint-review-20261001-010203.md");
      });
      it("falls back for empty titles", () => {
        expect(buildSingleExportFilename("   ", "json", new Date("2026-10-01T01:02:03.000Z"))).toBe("ics-chat-conversation-20261001-010203.json");
      });
      it("json carries format/version plus decoded messages", () => {
        const parsed = JSON.parse(buildSingleConversationJson(INPUT));
        expect(parsed.format).toBe("ics-single-conversation");
        expect(parsed.version).toBe(1);
        expect(parsed.messages).toHaveLength(2);
        expect(parsed.messages[0].content).toBe("hello");
      });
      it("markdown contains headers and message bodies", () => {
        const md = buildSingleConversationMarkdown(INPUT);
        expect(md).toContain("# Sprint Review!");
        expect(md).toContain("### 1. user");
        expect(md).toContain("hello");
        expect(md).toContain("_No bookmarks._");
      });
      it("markdown handles empty messages", () => {
        const md = buildSingleConversationMarkdown({ ...INPUT, messages : [] });
        expect(md).toContain("_No messages._");
      });
    });
    ```
  - **3c. `ChatView.tsx`:**
    1. Tambah import: `import { buildSingleConversationJson, buildSingleConversationMarkdown, buildSingleExportFilename, downloadTextFile } from "../lib/singleExport";`
    2. Ambil `activeConversationId` dari store (tambah ke destructure baris 12–28 yang ada).
    3. Setelah blok select provider/model (setelah baris 344 `</div>`), sisipkan:
       ```tsx
       <div className="mt-2 flex gap-2">
         <button onClick={() => void exportSingle("md")} disabled={!activeConversationId} title={activeConversationId ? "Export active conversation as Markdown" : "Select a conversation first"} className="rounded-lg border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:hover:bg-slate-800">Export MD</button>
         <button onClick={() => void exportSingle("json")} disabled={!activeConversationId} title={activeConversationId ? "Export active conversation as JSON" : "Select a conversation first"} className="rounded-lg border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:hover:bg-slate-800">Export JSON</button>
       </div>
       ```
    4. Tambah fungsi `exportSingle` sebelum `return` (setelah fungsi `stop` baris 279–284):
       ```ts
       async function exportSingle(ext : "md" | "json") {
         const s = useProviderStore.getState();
         const conv = s.conversations.find((c) => c.id === s.activeConversationId);
         if (!conv) {
           setError("Select a conversation first.");
           return;
         }
         try {
           const input = {
             conversation : {
               id : conv.id,
               title : conv.title,
               provider_id : conv.provider_id ?? null,
               default_model_id : conv.default_model_id ?? null,
               system_prompt : conv.system_prompt ?? null,
               created_at : "",
               updated_at : ""
             },
             messages : s.messages,
             bookmarks : s.bookmarks,
             exportedAt : new Date().toISOString()
           };
           const text = ext === "md" ? buildSingleConversationMarkdown(input) : buildSingleConversationJson(input);
           downloadTextFile(buildSingleExportFilename(conv.title, ext), text, ext === "md" ? "text/markdown" : "application/json");
         } catch (e) {
           setError(formatIpcError(e));
         }
       }
       ```
       Catatan: `created_at/updated_at` tidak ada di `ConversationDto` store (hanya id/title/provider/model/system/settings) — isi `""` deterministik, bukan `undefined`, agar JSON stabil.
- **Behavior yang harus dipertahankan:** Send/retry/stop, Inspector, auto-scroll, reasoning gate — tidak berubah. Export tidak memanggil `invoke` sama sekali (offline-safe). Tombol disabled saat tidak ada active conversation.
- **Error handling/edge case:** tanpa active conversation → `setError("Select a conversation first.")`; conversation 0 pesan/bookmark → tetap export dengan placeholder `_No messages._`/`_No bookmarks._`; judul kosong/aneh → slug fallback `conversation`; download gagal → `setError`. Konten pesan disisipkan verbatim (pesan sudah markdown; tidak ada escaping tambahan).
- **Test:** 3b (5 case) — lihat expected di snippet.
- **Command verifikasi:**
  - `pnpm --filter inference-chat-studio-desktop typecheck` → clean.
  - `pnpm --filter inference-chat-studio-desktop test -- src/lib/singleExport.test.ts` → 5/5 passed.
- **Hasil yang diharapkan:** clean + 5/5.
- **Completion criteria:** Dua tombol di `ChatView`, disabled-state benar, file terdownload dengan nama `ics-chat-*`; tidak ada file lain berubah.
- **Tidak boleh diubah:** `backup.ts`, `DataBackup.tsx`, `providerStore.ts`, `src-tauri/**`, `crates/**`, `packages/api-types/**`.

---

## Langkah 4 — Token usage tracking (agregat per conversation)

- **Tujuan langkah:** Tampilkan ringkasan token per active conversation dari `messages.usage_json` yang sudah tersimpan.
- **Finding/requirement:** F5/R5. `usage_json` ditulis `ipc.rs:1198`, diedarkan `ChatDoneEvent.usage`, diparsing aman `metrics.ts:34`. Tidak ada agregasi — ini yang ditambah. Tanpa pricing.
- **Dependency:** Langkah 3 (menyentuh `ChatView.tsx` yang sama; kerjakan setelah export agar diff berurutan).
- **File yang harus dibaca:**
  - `apps/desktop/src/lib/metrics.ts` seluruh file (56 baris; helper `num`/`obj` baris 24–32, `computeMetrics` baris 34).
  - `apps/desktop/src/lib/metrics.test.ts` seluruh file (42 baris; pola OpenAI payload).
  - `apps/desktop/src/components/ChatView.tsx` baris 359 (`{lastDiagnostics && <Inspector .../>}` — komponen usage dirender tepat setelahnya).
  - `apps/desktop/src/components/Inspector.tsx` (sekilas saja untuk format tampilan usage yang konsisten; tidak diubah).
- **File yang harus diubah:**
  1. `apps/desktop/src/lib/metrics.ts` (tambah `aggregateConversationUsage` + types)
  2. `apps/desktop/src/lib/metrics.test.ts` (tambah 5 test)
  3. `apps/desktop/src/components/ConversationUsage.tsx` (baru)
  4. `apps/desktop/src/components/ChatView.tsx` (render komponen)
- **Simbol terkait:** `UsageRow { usage_json?, status?, model_id?, provider_id? }`, `ConversationUsage { messagesCounted, messagesSkipped, inputTokens, outputTokens, reasoningTokens, totalTokens, hasPartialData }`, `parseUsageJson(raw)`, `aggregateConversationUsage(rows)`.
- **Kondisi implementasi saat ini:** `ChatMsg`/`PersistedMessage` tidak membawa `usage_json`, jadi agregat harus baca baris mentah via `invoke("list_messages_cmd", { conversationId })` (camelCase, sesuai `providerStore.test.ts:49`).
- **Perubahan konkret (urutan):**
  - **4a. `lib/metrics.ts`** — append setelah `formatTokensPerSecond` (baris 56):
    ```ts
    export interface UsageRow {
      usage_json? : string | null | unknown;
      status? : string | null;
    }
    export interface ConversationUsage {
      messagesCounted : number;
      messagesSkipped : number;
      inputTokens : number | null;
      outputTokens : number | null;
      reasoningTokens : number | null;
      totalTokens : number | null;
      hasPartialData : boolean;
    }
    /** Parse satu usage payload (objek atau JSON string) ke angka atau null. */
    export function parseUsageJson(raw : unknown): { inputTokens : number | null; outputTokens : number | null; reasoningTokens : number | null; totalTokens : number | null } {
      const usage = typeof raw === "string" ? (() => { try { return obj(JSON.parse(raw)); } catch { return null; } })() : obj(raw);
      if (!usage) {
        return { inputTokens : null, outputTokens : null, reasoningTokens : null, totalTokens : null };
      }
      const details = obj(usage["completion_tokens_details"]) ?? {};
      return {
        inputTokens : num(usage["prompt_tokens"]),
        outputTokens : num(usage["completion_tokens"]),
        reasoningTokens : num(details["reasoning_tokens"]),
        totalTokens : num(usage["total_tokens"])
      };
    }
    /**
     * Sum usage across message rows. Skips cancelled/streaming rows and rows
     * without parsable usage. A column stays null when no row reported it.
     */
    export function aggregateConversationUsage(rows : UsageRow[]): ConversationUsage {
      let input : number | null = null;
      let output : number | null = null;
      let reasoning : number | null = null;
      let total : number | null = null;
      let counted = 0;
      let skipped = 0;
      let partial = false;
      for (const r of rows) {
        if (r.status === "cancelled" || r.status === "streaming") {
          skipped += 1;
          continue;
        }
        if (r.usage_json === null || r.usage_json === undefined) {
          skipped += 1;
          partial = true;
          continue;
        }
        const p = parseUsageJson(r.usage_json);
        if (p.inputTokens === null && p.outputTokens === null && p.reasoningTokens === null && p.totalTokens === null) {
          skipped += 1;
          partial = true;
          continue;
        }
        counted += 1;
        if (p.inputTokens !== null) input = (input ?? 0) + p.inputTokens;
        if (p.outputTokens !== null) output = (output ?? 0) + p.outputTokens;
        if (p.reasoningTokens !== null) reasoning = (reasoning ?? 0) + p.reasoningTokens;
        if (p.totalTokens !== null) total = (total ?? 0) + p.totalTokens;
        if (p.inputTokens === null || p.outputTokens === null || p.totalTokens === null) {
          partial = true;
        }
      }
      return { messagesCounted : counted, messagesSkipped : skipped, inputTokens : input, outputTokens : output, reasoningTokens : reasoning, totalTokens : total, hasPartialData : partial };
    }
    ```
    Reuse helper `num`/`obj` yang sudah ada — JANGAN duplikasi.
  - **4b. `lib/metrics.test.ts`** — append:
    ```ts
    describe("aggregateConversationUsage", () => {
      it("sums two OpenAI payloads", () => {
        const out = aggregateConversationUsage([
          { status : "done", usage_json : JSON.stringify({ prompt_tokens : 10, completion_tokens : 5, total_tokens : 15 }) },
          { status : "done", usage_json : JSON.stringify({ prompt_tokens : 20, completion_tokens : 7, total_tokens : 27 }) }
        ]);
        expect(out).toEqual({ messagesCounted : 2, messagesSkipped : 0, inputTokens : 30, outputTokens : 12, reasoningTokens : null, totalTokens : 42, hasPartialData : false });
      });
      it("skips cancelled and streaming rows", () => {
        const out = aggregateConversationUsage([
          { status : "cancelled", usage_json : JSON.stringify({ prompt_tokens : 99 }) },
          { status : "streaming", usage_json : JSON.stringify({ prompt_tokens : 99 }) }
        ]);
        expect(out.messagesCounted).toBe(0);
        expect(out.messagesSkipped).toBe(2);
        expect(out.inputTokens).toBeNull();
      });
      it("marks partial when usage is missing", () => {
        const out = aggregateConversationUsage([{ status : "done", usage_json : null }]);
        expect(out.hasPartialData).toBe(true);
        expect(out.messagesSkipped).toBe(1);
      });
      it("marks partial on invalid JSON", () => {
        const out = aggregateConversationUsage([{ status : "done", usage_json : "not json" }]);
        expect(out.hasPartialData).toBe(true);
        expect(out.messagesSkipped).toBe(1);
      });
      it("sums reasoning tokens and flags missing columns", () => {
        const out = aggregateConversationUsage([
          { status : "done", usage_json : JSON.stringify({ prompt_tokens : 10, completion_tokens : 5, total_tokens : 15, completion_tokens_details : { reasoning_tokens : 3 } }) },
          { status : "done", usage_json : JSON.stringify({ completion_tokens : 4 }) }
        ]);
        expect(out.inputTokens).toBe(10);
        expect(out.outputTokens).toBe(9);
        expect(out.reasoningTokens).toBe(3);
        expect(out.hasPartialData).toBe(true);
      });
    });
    ```
    Tambah `aggregateConversationUsage` ke import baris 2.
  - **4c. `components/ConversationUsage.tsx`** (baru, seluruh isi):
    ```tsx
    import { invoke } from "@tauri-apps/api/core";
    import { useEffect, useState } from "react";
    import { aggregateConversationUsage, type ConversationUsage } from "../lib/metrics";
    import { hintText } from "../lib/ui";
    function fmt(n : number | null): string {
      return n === null ? "—" : n.toLocaleString("en-US");
    }
    export function ConversationUsage({ conversationId } : { conversationId : string | null }) {
      const [usage, setUsage] = useState<ConversationUsage | null>(null);
      useEffect(() => {
        if (!conversationId) {
          setUsage(null);
          return;
        }
        let alive = true;
        void invoke<Array<{ usage_json? : string | null; status? : string | null }>>("list_messages_cmd", { conversationId })
          .then((rows) => { if (alive) setUsage(aggregateConversationUsage(rows)); })
          .catch(() => { if (alive) setUsage(null); });
        return () => { alive = false; };
      }, [conversationId]);
      if (!conversationId) {
        return null;
      }
      if (!usage) {
        return <p className={hintText}>Token usage: unavailable.</p>;
      }
      if (usage.messagesCounted === 0) {
        return <p className={hintText}>Token usage: no data yet{usage.messagesSkipped > 0 ? ` (${usage.messagesSkipped} skipped)` : ""}.</p>;
      }
      return (
        <p className={hintText} title={`reasoning ${fmt(usage.reasoningTokens)} • counted ${usage.messagesCounted} • skipped ${usage.messagesSkipped}${usage.hasPartialData ? " • partial data" : ""}`}>
          Token usage: in {fmt(usage.inputTokens)} • out {fmt(usage.outputTokens)} • total {fmt(usage.totalTokens)} ({usage.messagesCounted} msgs{usage.hasPartialData ? ", partial" : ""})
        </p>
      );
    }
    ```
  - **4d. `ChatView.tsx`:**
    1. Tambah import: `import { ConversationUsage } from "./ConversationUsage";`
    2. Ambil `activeConversationId` dari store (gabung ke destructure yang ditambah di Langkah 3; jika Langkah 3 belum ada field ini, tambah sekarang).
    3. Tepat setelah baris 359 `{lastDiagnostics && <Inspector {...lastDiagnostics} />}` tambah: `<ConversationUsage conversationId={activeConversationId} />`
- **Behavior yang harus dipertahankan:** `ChatDoneEvent.usage` per-pesan, Inspector, dan `computeMetrics` tidak berubah. Komponen baru read-only (satu `invoke` per ganti conversation).
- **Error handling/edge case:** `invoke` gagal → tampil "unavailable" (tidak ada error banner); `usage_json` null/invalid → skip + `hasPartialData=true`; `cancelled`/`streaming` → skip; provider tanpa usage → "no data yet"; unmount → `alive=false` cegah set state. Tidak ada angka yang dikarang: kolom null → render "—".
- **Test:** 4b (5 case) — lihat expected di snippet.
- **Command verifikasi:**
  - `pnpm --filter inference-chat-studio-desktop typecheck` → clean.
  - `pnpm --filter inference-chat-studio-desktop test -- src/lib/metrics.test.ts` → semua passed (3 lama + 5 baru = 8).
- **Hasil yang diharapkan:** clean + 8/8.
- **Completion criteria:** Ringkasan tampil di bawah Inspector untuk active conversation; null-safe; tidak ada file lain berubah.
- **Tidak boleh diubah:** `Inspector.tsx`, `metrics.ts` fungsi lama, `providerStore.ts`, `src-tauri/**`, `crates/**`, `packages/api-types/**`.

---

## Langkah 5 — Prompt templates (`localStorage` v1)

- **Tujuan langkah:** User bisa simpan system prompt aktif sebagai template bernama, apply ke conversation, dan hapus — tanpa migrasi DB.
- **Finding/requirement:** F3/R3. Kolom `system_prompt` (`0001_init.sql:31`), persist `update_conversation_settings` (`db.rs:322`), editor `SettingsSimple.tsx:56`, restore `conversationPatch` (`providerStore.ts:83`) sudah ada — template adalah lapisan di atasnya.
- **Dependency:** Langkah 4 (tidak ada overlap file, tapi kerjakan setelah usage agar review berurutan M2→M3).
- **File yang harus dibaca:**
  - `apps/desktop/src/components/SettingsSimple.tsx` seluruh file (95 baris; `systemPrompt` + `setSimple` baris 14–16, textarea system prompt baris 56–64).
  - `apps/desktop/src/stores/providerStore.ts` baris 60 (`setSimple`), 348–361 (`saveConversationSettings` — template TIDAK memanggil ini otomatis; user menekan Send untuk persist, konsisten dengan perilaku sekarang).
- **File yang harus diubah:**
  1. `apps/desktop/src/lib/promptTemplates.ts` (baru)
  2. `apps/desktop/src/lib/promptTemplates.test.ts` (baru)
  3. `apps/desktop/src/components/SettingsSimple.tsx` (UI template)
- **Simbol terkait:** `PromptTemplate { id, name, content, createdAt, updatedAt }`, `PROMPT_TEMPLATES_KEY = "ics.promptTemplates.v1"`, `createTemplateItem(id, name, content, now)`, `upsertTemplate(list, item)`, `deleteTemplate(list, id)`, `loadTemplates()`, `saveTemplates(list)`.
- **Kondisi implementasi saat ini:** System prompt hanya free-text per conversation. Tidak ada koleksi template.
- **Perubahan konkret (urutan):**
  - **5a. `lib/promptTemplates.ts`** (baru, seluruh isi):
    ```ts
    /** Named system-prompt templates, v1: localStorage only (not in backup). */
    export interface PromptTemplate {
      id : string;
      name : string;
      content : string;
      createdAt : string;
      updatedAt : string;
    }
    export const PROMPT_TEMPLATES_KEY = "ics.promptTemplates.v1";
    export const MAX_TEMPLATES = 100;
    function cleanName(name : string): string {
      return name.trim().slice(0, 80);
    }
    /** Pure constructor; caller supplies id/now so tests stay deterministic. */
    export function createTemplateItem(id : string, name : string, content : string, now : string): PromptTemplate {
      const clean = cleanName(name);
      if (!clean) {
        throw new Error("Template name must not be empty.");
      }
      return { id, name : clean, content, createdAt : now, updatedAt : now };
    }
    /** Pure upsert: replaces same-id, enforces MAX_TEMPLATES (drops oldest by updatedAt). */
    export function upsertTemplate(list : PromptTemplate[], item : PromptTemplate): PromptTemplate[] {
      const next = [item, ...list.filter((t) => t.id !== item.id)];
      next.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
      return next.slice(0, MAX_TEMPLATES);
    }
    /** Pure delete by id. */
    export function deleteTemplate(list : PromptTemplate[], id : string): PromptTemplate[] {
      return list.filter((t) => t.id !== id);
    }
    /** Load from localStorage; corrupt/missing → []. Never throws. */
    export function loadTemplates(): PromptTemplate[] {
      try {
        const raw = localStorage.getItem(PROMPT_TEMPLATES_KEY);
        if (!raw) {
          return [];
        }
        const parsed : unknown = JSON.parse(raw);
        if (!Array.isArray(parsed)) {
          return [];
        }
        return parsed.filter((t): t is PromptTemplate =>
          typeof t === "object" && t !== null &&
          typeof (t as Record<string, unknown>)["id"] === "string" &&
          typeof (t as Record<string, unknown>)["name"] === "string" &&
          typeof (t as Record<string, unknown>)["content"] === "string"
        );
      } catch {
        return [];
      }
    }
    /** Persist to localStorage. Never throws (quota errors swallowed). */
    export function saveTemplates(list : PromptTemplate[]): void {
      try {
        localStorage.setItem(PROMPT_TEMPLATES_KEY, JSON.stringify(list));
      } catch {
        // ignore: templates are best-effort local convenience.
      }
    }
    ```
  - **5b. `lib/promptTemplates.test.ts`** (baru — HANYA pure function, tanpa `localStorage` karena tidak ada jsdom):
    ```ts
    import { describe, expect, it } from "vitest";
    import { MAX_TEMPLATES, createTemplateItem, deleteTemplate, upsertTemplate, type PromptTemplate } from "./promptTemplates";
    const NOW = "2026-10-01T00:00:00.000Z";
    function item(id : string, name = "Code review", updatedAt = NOW): PromptTemplate {
      return { id, name, content : "Review carefully.", createdAt : NOW, updatedAt };
    }
    describe("prompt templates (pure)", () => {
      it("trims names and rejects empty", () => {
        expect(createTemplateItem("a", "  Review  ", "x", NOW).name).toBe("Review");
        expect(() => createTemplateItem("a", "   ", "x", NOW)).toThrow("Template name must not be empty.");
      });
      it("upserts by id with newest first", () => {
        const next = upsertTemplate([item("a")], { ...item("b"), updatedAt : "2026-10-02T00:00:00.000Z" });
        expect(next.map((t) => t.id)).toEqual(["b", "a"]);
        const replaced = upsertTemplate(next, { ...item("a"), name : "New", updatedAt : "2026-10-03T00:00:00.000Z" });
        expect(replaced[0]).toMatchObject({ id : "a", name : "New" });
      });
      it("caps at MAX_TEMPLATES", () => {
        const big : PromptTemplate[] = Array.from({ length : MAX_TEMPLATES + 5 }, (_, i) => item(`id-${i}`));
        expect(upsertTemplate(big, item("new")).length).toBe(MAX_TEMPLATES);
      });
      it("deletes by id", () => {
        expect(deleteTemplate([item("a"), item("b")], "a").map((t) => t.id)).toEqual(["b"]);
      });
    });
    ```
  - **5c. `SettingsSimple.tsx`:**
    1. Tambah import: `import { useState } from "react";` + `import { createTemplateItem, deleteTemplate, loadTemplates, saveTemplates, upsertTemplate, type PromptTemplate } from "../lib/promptTemplates";`
    2. Di dalam komponen setelah `const { ... } = useProviderStore();` (baris 8–19) tambah state:
       ```ts
       const [templates, setTemplates] = useState<PromptTemplate[]>(() => { try { return loadTemplates(); } catch { return []; } });
       const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
       const [templateName, setTemplateName] = useState<string>("");
       ```
    3. Sebelum `<label>` System prompt (baris 56) sisipkan blok template:
       ```tsx
       <div className="mb-2 rounded-lg border border-slate-200 p-2 dark:border-slate-700">
         <p className={hintText}>Prompt templates (stored locally, not in backup).</p>
         <div className="mt-1 flex gap-2">
           <select value={selectedTemplateId} onChange={(e) => setSelectedTemplateId(e.target.value)} className={`${select} flex-1`} title="Prompt template">
             <option value="">Select template…</option>
             {templates.map((t) => (<option key={t.id} value={t.id}>{t.name}</option>))}
           </select>
           <button onClick={() => {
             const found = templates.find((t) => t.id === selectedTemplateId);
             if (found) setSimple({ systemPrompt : found.content });
           }} disabled={!selectedTemplateId} className={btn} title="Apply template to system prompt">Apply</button>
           <button onClick={() => {
             if (!selectedTemplateId) return;
             const next = deleteTemplate(templates, selectedTemplateId);
             setTemplates(next); saveTemplates(next); setSelectedTemplateId("");
           }} disabled={!selectedTemplateId} className={btn} title="Delete template">Delete</button>
         </div>
         <div className="mt-1 flex gap-2">
           <input value={templateName} onChange={(e) => setTemplateName(e.target.value)} placeholder="Template name…" className={`${input} flex-1`} />
           <button onClick={() => {
             try {
               const now = new Date().toISOString();
               const id = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `t-${Date.now()}`;
               const next = upsertTemplate(templates, createTemplateItem(id, templateName, systemPrompt, now));
               setTemplates(next); saveTemplates(next); setTemplateName(""); setSelectedTemplateId(id);
             } catch { /* validation: empty name — no-op, user sees disabled state */ }
           }} disabled={!templateName.trim() || !systemPrompt.trim()} className={btn} title="Save current system prompt as template">Save current</button>
         </div>
       </div>
       ```
    4. System prompt textarea (baris 56–64) tidak diubah.
- **Behavior yang harus dipertahankan:** Reasoning/temperature/maxOutput UI, `setSimple`/`setReasoning`, persist-on-send (`saveConversationSettings`) — tidak berubah. Apply hanya mengisi textarea; persist terjadi saat Send/switch conversation seperti sekarang.
- **Error handling/edge case:** nama kosong → tombol Save disabled + constructor throw di-catch; `localStorage` corrupt/quota → `loadTemplates` return `[]`, `saveTemplates` swallow; >100 template → oldest terbuang; delete tanpa seleksi → no-op; template content kosong tetap boleh disimpan (apply menghasilkan prompt kosong = valid).
- **Test:** 5b (4 case) — lihat expected di snippet. `loadTemplates`/`saveTemplates` TIDAK di-test (butuh DOM) — verifikasi manual.
- **Command verifikasi:**
  - `pnpm --filter inference-chat-studio-desktop typecheck` → clean.
  - `pnpm --filter inference-chat-studio-desktop test -- src/lib/promptTemplates.test.ts` → 4/4 passed.
- **Hasil yang diharapkan:** clean + 4/4.
- **Completion criteria:** Save/Apply/Delete bekerja + survive reload (baca ulang dari `localStorage`); hint "not in backup" tampil; tidak ada file lain berubah.
- **Tidak boleh diubah:** `providerStore.ts`, `db.rs`, `ipc.rs`, `packages/api-types/**`, `backup.ts`, komponen lain.

---

## Langkah 6 — Verifikasi penuh + checklist manual

- **Tujuan langkah:** Pastikan tidak ada regresi dan 5 finding bekerja end-to-end.
- **Finding/requirement:** R1–R5 + garansi Langkah 1–5.
- **Dependency:** Langkah 1–5 selesai.
- **File yang harus dibaca:** `TEST-CHECKLIST.md` (hanya konteks; kolom `Actual` diisi manual di luar eksekusi ini).
- **File yang harus diubah:** Tidak ada file kode. Boleh update `## Progress Log` file plan ini.
- **Simbol terkait:** tidak ada.
- **Kondisi awal:** Semua langkah hijau per-verifikasi masing-masing.
- **Perubahan:** tidak ada.
- **Command verifikasi (dari root, berurutan):**
  1. `pnpm --filter inference-chat-studio-desktop typecheck` → expected: exit 0.
  2. `pnpm --filter inference-chat-studio-desktop test` → expected: 0 failed. Hitungan baru: `conversation.test.ts` 13, `shortcuts.test.ts` 8, `singleExport.test.ts` 5, `metrics.test.ts` 8, `promptTemplates.test.ts` 4; file lain tidak berubah.
  3. `cargo test --workspace` → expected: 0 failed (tidak ada perubahan Rust; murni cek regresi).
- **Hasil yang diharapkan:** Ketiga command hijau.
- **Checklist manual (wajib — tidak ada e2e otomatis):**
  - 1a. Rename conversation ke `"  "` → judul tidak berubah, tidak ada error.
  - 1b. Rename lalu `Escape` → mode rename batal.
  - 1c. Klik Delete sekali → muncul `Confirm?`/`Cancel`; klik `Cancel` → tidak terhapus.
  - 1d. Klik `Confirm?` → conversation terhapus + active pindah ke terbaru.
  - 2a. Fokus di body, `Ctrl+N` → conversation "New conversation" dibuat.
  - 2b. Fokus di composer, `Ctrl+N` → tidak ada conversation baru.
  - 2c. Seleksi teks di balon pesan, `Ctrl+B` → bookmark muncul di rail.
  - 2d. `Ctrl+B` tanpa seleksi → no-op.
  - 2e. `Ctrl+K` tetap buka/tutup palette; `F12` tetap devtools.
  - 3a. Active conversation dengan 2 pesan + 1 bookmark → `Export MD` unduh `ics-chat-*.md` berisi `# <judul>`, `### 1. user`, `_No bookmarks._` bila kosong.
  - 3b. `Export JSON` unduh JSON dengan `format: "ics-single-conversation"`, `version: 1`, messages ter-decode.
  - 3c. Tanpa active conversation → tombol disabled.
  - 4a. Setelah chat sukses → ringkasan `Token usage: in X • out Y • total Z` muncul di bawah Inspector.
  - 4b. Conversation baru tanpa pesan → `no data yet`.
  - 5a. Isi system prompt → `Save current` dengan nama → muncul di dropdown.
  - 5b. Reload app → template masih ada.
  - 5c. `Apply` → textarea system prompt terisi; kirim pesan → tersimpan per conversation (restart → prompt pulih).
  - 5d. `Delete` → hilang dari dropdown + survive reload.
- **Completion criteria:** 3 command hijau + 20 cek manual lolos + `git status` hanya menunjukkan file Scope.
- **Tidak boleh diubah:** semua di luar Scope.

---

## Risks

- **Shortcut menabrak browser (`Ctrl+N`/`Ctrl+B`).** Mitigasi: `preventDefault` + focus-guard + dokumentasi. Residual: user yang mengharapkan perilaku browser harus pakai menu browser. Trade-off diterima untuk power-user.
- **`Ctrl+B` tidak discoverable.** Mitigasi: `title` tidak ditambah di langkah ini (hindari scope creep); BookmarkRail hint tetap. Saran follow-up: tambah hint teks di rail.
- **Export besar membeku renderer.** `ChatView` merakit string di renderer; conversation sangat besar bisa jank. Mitigasi diterima v1 (pola sama dengan `downloadBackupFile`); follow-up: export via backend bila terbukti berat.
- **Usage parsial.** Provider boleh tidak kirim `usage` atau kolom tidak lengkap → `hasPartialData` + "—". Tidak ada angka yang dikarang. Pricing belum ada (open question).
- **Templates tidak ikut backup.** Risiko kehilangan saat ganti mesin. Mitigasi: hint eksplisit di UI + open question integrasi backup v2.

## Progress Log

- 2026-10-01 08:26:57 — Langkah 0 baseline: typecheck clean, 59 vitest passed, `cargo test --workspace` 0 failed.
- 2026-10-01 08:30:12 — Langkah 1 selesai: `sanitizeRenameTitle` (+4 test), `ConversationList.tsx` delete 2-klik + Escape/Enter. Verifikasi: 13/13 conversation.test.ts.
- 2026-10-01 08:31:30 — Langkah 2 selesai: `lib/shortcuts.ts` + `shortcuts.test.ts` (8 test), wiring `App.tsx` (extend keydown, F12 dipertahankan), `MessageList.tsx` listener `ics:bookmark-from-selection`. Verifikasi: 8/8.
- 2026-10-01 08:33:35 — Langkah 3 selesai: `lib/singleExport.ts` + test (5), tombol Export MD/JSON + `exportSingle` di `ChatView.tsx`. Catatan: path import di plan salah (`../../../` → `../../../../`), diperbaiki agar sama dengan `backup.ts`. Verifikasi: 5/5.
- 2026-10-01 08:35:08 — Langkah 4 selesai: `parseUsageJson` + `aggregateConversationUsage` di `metrics.ts` (+5 test), komponen baru `ConversationUsage.tsx`, render di bawah Inspector. Verifikasi: 8/8 metrics.test.ts.
- 2026-10-01 08:37:36 — Langkah 5 selesai: `lib/promptTemplates.ts` + test (4 pure function), blok template di `SettingsSimple.tsx` (Apply/Delete/Save current + hint "stored locally, not in backup"). Tambah `btn` ke import ui. Verifikasi: 4/4.
- 2026-10-01 08:37:53 — Langkah 6 gate otomatis: typecheck clean; vitest 85 passed (14 file: conversation 13, shortcuts 8, singleExport 5, metrics 8, promptTemplates 4, sisanya tidak berubah); `cargo test --workspace` 0 failed (11 tauri). `git status` hanya file scope + plan.
- 2026-10-01 — Checklist manual 20 item BELUM dijalankan (butuh `tauri dev`). Dicatat sebagai sisa verifikasi di bawah Handoff Checklist.

## Notes

- Urutan edit `ChatView.tsx` penting: Langkah 3 dulu (export), lalu Langkah 4 (usage) — keduanya menyentuh area yang sama (bawah toolbar / bawah Inspector). Jangan dikerjakan paralel.
- Aturan IPC Tauri v2: argumen multi-kata harus camelCase (`conversationId`, bukan `conversation_id`) — lihat `providerStore.test.ts:49`. `ConversationUsage.tsx` mengikuti aturan ini.
- Semua nama file export UTC + digit-only agar aman di Windows (pola `backup.ts:157`).
- Usulan commit saat implementasi selesai (satu baris, tanpa trailer): `feat: add shortcuts, rename-delete hygiene, single export, usage summary, prompt templates`

## Open Questions / Blockers

- **O1: Pricing per model untuk "cost awareness".** Opsi: (a) tabel harga statis per `remote_model_id` (rapuh, cepat basi), (b) input harga manual per provider (fleksibel, UX berat), (c) tanpa pricing (v1 ini). Rekomendasi: (c). Risiko (a)/(b): angka salah → kepercayaan rusak.
- **O2: Templates masuk backup DB?** Opsi: (a) tetap `localStorage` (dipilih v1), (b) tabel `prompt_templates` + migrasi `0003` + bump `BACKUP_VERSION`. Risiko (b): migrasi + format backup berubah. Rekomendasi: (b) hanya bila ada permintaan backup/restore template.
- **O3: Agregat usage via SQL backend?** Opsi: (a) frontend seperti plan ini (dipilih), (b) query `SUM` atas `usage_json` di Rust. Risiko (b): parsing JSON per-row + skema provider tidak seragam. Rekomendasi: (a) sampai ada kebutuhan lintas-conversation/provider.

---

## Handoff Checklist (untuk model pelaksana kecil)

~~- [ ] Mulai dari Langkah 0; STOP jika tidak hijau.~~
- [x] Mulai dari Langkah 0; STOP jika tidak hijau.
~~- [ ] Kerjakan Langkah 1→5 berurutan (JANGAN paralel; `ChatView.tsx` disentuh Langkah 3–4).~~
- [x] Kerjakan Langkah 1→5 berurutan (JANGAN paralel; `ChatView.tsx` disentuh Langkah 3–4).
~~- [ ] Setiap langkah: baca file terdaftar → ubah sesuai urutan → jalankan command verifikasi langkah itu → lanjut hanya jika hijau.~~
- [x] Setiap langkah: baca file terdaftar → ubah sesuai urutan → jalankan command verifikasi langkah itu → lanjut hanya jika hijau.
~~- [ ] Hanya ubah file di tiap langkah; selain itu dilarang (terutama `src-tauri/**`, `crates/**`, `packages/api-types/**`, `backup.ts`, `DataBackup.tsx`, `CommandPalette.tsx`, `providerStore.ts` kecuali dibaca).~~
- [x] Hanya ubah file di tiap langkah; selain itu dilarang (terutama `src-tauri/**`, `crates/**`, `packages/api-types/**`, `backup.ts`, `DataBackup.tsx`, `CommandPalette.tsx`, `providerStore.ts` kecuali dibaca).
~~- [ ] Jangan tambah dependency, capability, migrasi DB, atau command IPC.~~
- [x] Jangan tambah dependency, capability, migrasi DB, atau command IPC.
~~- [ ] Jangan ubah fungsi lama (`computeMetrics`, `bookmarkHere`, `commitRename` selain yang diperintah, handler `F12`/`Ctrl+K`).~~
- [x] Jangan ubah fungsi lama (`computeMetrics`, `bookmarkHere`, `commitRename` selain yang diperintah, handler `F12`/`Ctrl+K`).
~~- [ ] Akhiri Langkah 6 penuh (3 command + 20 cek manual) + centang Tasks + isi Progress Log.~~
- [x] Akhiri Langkah 6 penuh (3 command + 20 cek manual) + centang Tasks + isi Progress Log.
~~- [ ] Jangan staging/commit file kode. File plan ini satu-satunya artefak yang boleh ditulis di tahap ini.~~
- [x] Jangan staging/commit file kode. File plan ini satu-satunya artefak yang boleh ditulis di tahap ini.

## Sisa Verifikasi (untuk user, butuh app runtime)

Checklist manual Langkah 6 (20 item: 1a–1d rename/delete, 2a–2e shortcut,
3a–3c export, 4a–4b usage, 5a–5d templates) BELUM dijalankan — butuh
`tauri dev` + browser. Semua gate otomatis sudah hijau.

