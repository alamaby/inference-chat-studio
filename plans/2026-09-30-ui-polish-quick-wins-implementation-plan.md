# UI Polish Quick Wins — Implementation Plan

Created: 2026-09-30 23:45:00

## Objective

Menangani 5 finding dari analisis UI/UX polish pada `apps/desktop/src`:

1. **Error boundaries** — tidak ada error boundary; satu render crash = white screen total.
2. **Bootstrap loading + error visibility** — `App.tsx` menelan error secara diam-diam dan tidak ada loading indicator saat initial load.
3. **Empty states** — pesan teks polos tanpa ilustrasi; tidak membedakan "belum ada data" vs "filter tidak match".
4. **Focus management** — tidak ada focus trap di dialog (AboutDialog, CommandPalette); tidak ada focus restoration.
5. **Tooltips / aria-label** — tombol icon-only pakai `title` native yang tidak konsisten untuk aksesibilitas.

## Scope

- `apps/desktop/src/components/ErrorBoundary.tsx` (file baru)
- `apps/desktop/src/components/App.tsx`
- `apps/desktop/src/components/ConversationList.tsx`
- `apps/desktop/src/components/MessageList.tsx`
- `apps/desktop/src/components/AboutDialog.tsx`
- `apps/desktop/src/components/CommandPalette.tsx`
- `apps/desktop/src/lib/errors.ts`
- `apps/desktop/src/lib/focus.ts` (file baru)
- `apps/desktop/src/lib/emptyState.ts` (file baru)
- `apps/desktop/src/lib/errors.test.ts`
- `apps/desktop/src/lib/focus.test.ts` (file baru)
- `apps/desktop/src/lib/emptyState.test.ts` (file baru)
- `apps/desktop/src/stores/providerStore.test.ts`

## Out of Scope

- Perubahan Rust (`src-tauri/**`, `crates/**`)
- Perubahan `packages/api-types/**`
- Penambahan dependency npm/cargo
- Testing-library atau jsdom (tidak ada di repo; test hanya untuk pure function + store action)
- Migrasi DB
- Perubahan visual design system (token `ui.ts` tidak diubah)

## Requirement Traceability

| # | Finding | Requirement | Langkah |
|---|---------|-------------|---------|
| F1 | Error boundaries | R1: App tidak boleh white-screen saat render crash | Langkah 1 |
| F2 | Bootstrap loading | R2: User mendapat feedback saat initial load; error bootstrap terlihat | Langkah 2 |
| F3 | Empty states | R3: Empty state membedakan "belum ada data" vs "filter tidak match"; ada ilustrasi | Langkah 3 |
| F4 | Focus management | R4: Dialog trap focus; focus kembali ke trigger saat dialog tertutup | Langkah 4 |
| F5 | Tooltips/aria-label | R5: Semua icon-only button punya `aria-label` | Langkah 5 |

## Decisions (eksplisit, bukan diam-diam)

- **D1: Error boundary sebagai class component.** React 18 masih mendukung `componentDidCatch` + `getDerivedStateFromError`. Tidak perlu dependency baru. Error boundary HANYA menangkap render-time crash; async error sudah ditangani try/catch + store `error` field.
- **D2: Bootstrap loading = full-screen indicator.** Saat `booting === true`, render spinner teks sederhana, bukan skeleton per-panel. Rationale: app Tauri local-first, load biasanya < 1 detik; skeleton per-panel overkill. Full-screen indicator cukup dan deterministik.
- **D3: Pure function untuk logika empty state.** Logika penentuan pesan empty state diekstrak ke `lib/emptyState.ts` sebagai pure function agar bisa di-unit-test tanpa jsdom. Component hanya memanggil function dan render hasilnya.
- **D4: Pure function untuk focus trap index logic.** Logika perhitungan index focus trap diekstrak ke `lib/focus.ts` sebagai pure function. Component hanya memanggil function untuk menentukan focus target.
- **D5: `formatBoundaryError` di `lib/errors.ts`.** Reuse pola yang sudah ada di file yang sama; tidak membuat file baru untuk satu function.
- **D6: Tidak ada test komponen React.** Repo tidak punya testing-library/jsdom. Semua test baru adalah pure function test atau store action test. Verifikasi UI komponen = manual checklist di Langkah 6.
- **D7: `aria-label` ditambahkan SELAIN `title`, bukan menggantinya.** `title` tetap untuk tooltip visual; `aria-label` untuk screen reader. Keduanya bisa koexist.

## Tasks

- [ ] Langkah 1 — Error boundary component + `formatBoundaryError`
- [ ] Langkah 2 — Bootstrap loading state + error visibility di `App.tsx`
- [ ] Langkah 3 — Empty states (pure function + component update)
- [ ] Langkah 4 — Focus management (pure function + component update)
- [ ] Langkah 5 — `aria-label` untuk icon-only buttons
- [ ] Langkah 6 — Verifikasi penuh + checklist manual

---

## Langkah 1 — Error boundary component + `formatBoundaryError`

- **Tujuan langkah:** Mencegah white screen total saat render-time crash; user melihat pesan error yang bisa dipahami + tombol retry.
- **Finding/requirement:** F1 (tidak ada error boundary), R1.
- **Dependency:** tidak ada.
- **File yang harus dibaca:**
  - `apps/desktop/src/lib/errors.ts` seluruh file (32 baris; pola `formatIpcError` sebagai contoh).
  - `apps/desktop/src/lib/errors.test.ts` seluruh file (19 baris; pola test pure function).
  - `apps/desktop/src/App.tsx` seluruh file (88 baris; struktur JSX yang akan dibungkus).
  - `apps/desktop/src/lib/ui.ts` (token `btn`, `card`, `hintText`).
- **File yang harus diubah:**
  1. `apps/desktop/src/lib/errors.ts` (tambah `formatBoundaryError`)
  2. `apps/desktop/src/lib/errors.test.ts` (tambah test untuk `formatBoundaryError`)
  3. `apps/desktop/src/components/ErrorBoundary.tsx` (file baru)
  4. `apps/desktop/src/App.tsx` (bungkus konten dengan `ErrorBoundary`)
- **Class, function, method, type, simbol terkait:**
  - `formatBoundaryError : (e : unknown) => string` di `lib/errors.ts`.
  - `class ErrorBoundary extends Component<Props, State>` di `components/ErrorBoundary.tsx`.
  - `Props { children : ReactNode }`, `State { error : Error | null }`.
  - `static getDerivedStateFromError(error : Error) : State`.
  - `componentDidCatch(error : Error, info : ErrorInfo) : void`.
- **Kondisi implementasi saat ini:** Tidak ada error boundary di seluruh codebase (grep `componentDidCatch|getDerivedStateFromError|ErrorBoundary` = 0 hasil). Satu crash render = white screen.
- **Perubahan konkret (urutan):**

  **1a. `apps/desktop/src/lib/errors.ts`** — tambah function setelah `formatIpcError` (setelah baris 32, sebelum `};` penutup file — sebenarnya file berakhir di baris 32 dengan `}` terakhir dari `formatIpcError`; tambah di bawahnya):

  ```ts
  /**
   * Format a render-time error for the ErrorBoundary fallback UI.
   * Always returns a non-empty, user-readable string.
   */
  export function formatBoundaryError(e : unknown): string {
    if (e instanceof Error) {
      return e.message || "An unexpected error occurred.";
    }
    if (typeof e === "string") {
      return e;
    }
    return "An unexpected error occurred.";
  }
  ```

  **1b. `apps/desktop/src/lib/errors.test.ts`** — tambah `describe("formatBoundaryError", ...)` baru di akhir file (setelah baris 19):

  ```ts
  describe("formatBoundaryError", () => {
    it("returns the Error message", () => {
      expect(formatBoundaryError(new Error("render boom"))).toBe("render boom");
    });

    it("returns fallback when Error has empty message", () => {
      expect(formatBoundaryError(new Error(""))).toBe("An unexpected error occurred.");
    });

    it("passes strings through", () => {
      expect(formatBoundaryError("string error")).toBe("string error");
    });

    it("returns fallback for non-Error non-string", () => {
      expect(formatBoundaryError({ code : "x" })).toBe("An unexpected error occurred.");
      expect(formatBoundaryError(null)).toBe("An unexpected error occurred.");
      expect(formatBoundaryError(undefined)).toBe("An unexpected error occurred.");
    });
  });
  ```

  **1c. `apps/desktop/src/components/ErrorBoundary.tsx`** — file baru, seluruh isi:

  ```tsx
  import { Component, type ErrorInfo, type ReactNode } from "react";
  import { formatBoundaryError } from "../lib/errors";
  import { btn, card } from "../lib/ui";

  interface Props {
    children : ReactNode;
  }

  interface State {
    error : Error | null;
  }

  export class ErrorBoundary extends Component<Props, State> {
    state : State = { error : null };

    static getDerivedStateFromError(error : Error) : State {
      return { error };
    }

    componentDidCatch(error : Error, info : ErrorInfo) : void {
      console.error("ErrorBoundary caught:", error, info.componentStack);
    }

    render() {
      if (this.state.error) {
        return (
          <div className="flex h-screen items-center justify-center bg-slate-100 p-4 dark:bg-slate-950">
            <div className={`${card} max-w-lg`} role="alert">
              <h2 className="text-base font-semibold text-red-600 dark:text-red-400">
                Something went wrong
              </h2>
              <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">
                {formatBoundaryError(this.state.error)}
              </p>
              <button
                onClick={() => this.setState({ error : null })}
                className={`${btn} mt-4`}
              >
                Try again
              </button>
            </div>
          </div>
        );
      }
      return this.props.children;
    }
  }
  ```

  **1d. `apps/desktop/src/App.tsx`** — bungkus konten utama:
  1. Tambah import di baris 1-13: `import { ErrorBoundary } from "./components/ErrorBoundary";`
  2. Bungkus seluruh konten di dalam `<ErrorBoundary>...</ErrorBoundary>`. Struktur baru:

  ```tsx
  return (
    <ErrorBoundary>
      <div className="flex h-screen flex-col bg-slate-100 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
        {/* ... semua konten yang ada ... */}
      </div>
    </ErrorBoundary>
  );
  ```

  Pastikan tag penutup `</div>` terakhir (baris 86) diikuti `</ErrorBoundary>` sebelum `);`.

- **Behavior yang harus dipertahankan:** Semua konten yang ada di dalam `App` tetap identik; `ErrorBoundary` hanya membungkus dan tidak mengubah layout. Saat tidak ada error, `render()` mengembalikan `this.props.children` apa adanya.
- **Error handling dan edge case:**
  - `getDerivedStateFromError` hanya menerima `Error` instance. Jika non-Error di-throw (mis. string), React tetap memanggilnya; `formatBoundaryError` menangani fallback.
  - `componentDidCatch` hanya log ke console; tidak ada crash reporter eksternal.
  - Tombol "Try again" me-reset state ke `{ error : null }` — jika error terjadi lagi saat re-render, boundary menangkap lagi.
  - Error boundary TIDAK menangkap async error (event handler, promise) — itu sudah ditangani pola yang ada.
- **Test yang harus ditambahkan:** Lihat 1b di atas (4 test case).
- **Input test dan expected result:**
  - `new Error("render boom")` → `"render boom"`
  - `new Error("")` → `"An unexpected error occurred."`
  - `"string error"` → `"string error"`
  - `{ code: "x" }` → `"An unexpected error occurred."`
  - `null` → `"An unexpected error occurred."`
  - `undefined` → `"An unexpected error occurred."`
- **Command verifikasi:**
  - `pnpm --filter inference-chat-studio-desktop typecheck` → clean.
  - `pnpm --filter inference-chat-studio-desktop test -- src/lib/errors.test.ts` → semua passed (3 lama + 4 baru = 7).
- **Hasil verifikasi yang diharapkan:** typecheck clean; 7/7 passed.
- **Completion criteria:** `formatBoundaryError` ada di `errors.ts` dengan 4 test hijau; `ErrorBoundary.tsx` ada dan di-export; `App.tsx` membungkus konten dengan `ErrorBoundary`; tidak ada perubahan selain 4 file di atas.
- **File atau area yang tidak boleh diubah:** `src-tauri/**`, `crates/**`, `packages/api-types/**`, `providerStore.ts`, komponen lain, `index.css`, `ui.ts`.

---

## Langkah 2 — Bootstrap loading state + error visibility di `App.tsx`

- **Tujuan langkah:** User mendapat feedback visual saat initial load; error dari `loadProviders`/`loadConversations` ditampilkan, bukan ditelan diam-diam.
- **Finding/requirement:** F2 (silent error swallow, tidak ada loading indicator), R2.
- **Dependency:** Langkah 1 (error boundary sudah membungkus App, jadi crash saat bootstrap tertangkap).
- **File yang harus dibaca:**
  - `apps/desktop/src/App.tsx` seluruh file (88 baris).
  - `apps/desktop/src/stores/providerStore.ts` baris 126-158 (`loadProviders`) dan baris 258-290 (`loadConversations`).
  - `apps/desktop/src/stores/providerStore.test.ts` seluruh file (167 baris; pola mock + setState).
  - `apps/desktop/src/lib/errors.ts` (`formatIpcError`).
- **File yang harus diubah:**
  1. `apps/desktop/src/App.tsx`
  2. `apps/desktop/src/stores/providerStore.test.ts`
- **Class, function, method, type, simbol terkait:**
  - `const [booting, setBooting] = useState(true)` di `App`.
  - `loadProviders`, `loadConversations`, `setError` dari `useProviderStore()`.
  - `formatIpcError` dari `../lib/errors`.
- **Kondisi implementasi saat ini:** `App.tsx:30-33`:
  ```ts
  useEffect(() => {
    void loadProviders().catch(() => undefined);
    void loadConversations().catch(() => undefined);
  }, [loadProviders, loadConversations]);
  ```
  Error ditelan; tidak ada loading state; konten langsung render dengan data kosong.
- **Perubahan konkret (urutan):**

  **2a. `apps/desktop/src/App.tsx`** — ganti `useEffect` bootstrap (baris 30-33) dan tambah state `booting`:

  1. Tambah state setelah baris 28 (`const [aboutOpen, setAboutOpen] = useState(false);`):
     ```ts
     const [booting, setBooting] = useState(true);
     ```

  2. Ganti `useEffect` bootstrap (baris 30-33) dengan:
     ```ts
     useEffect(() => {
       let alive = true;
       Promise.all([
         loadProviders().catch((e : unknown) => {
           if (alive) setError(formatIpcError(e));
         }),
         loadConversations().catch((e : unknown) => {
           if (alive) setError(formatIpcError(e));
         })
       ]).finally(() => {
         if (alive) setBooting(false);
       });
       return () => { alive = false; };
     }, [loadProviders, loadConversations]);
     ```

  3. Tambah import `formatIpcError` — ubah baris 13:
     ```ts
     import { btn, errorText, hintText } from "./lib/ui";
     ```
     menjadi:
     ```ts
     import { btn, errorText, hintText } from "./lib/ui";
     import { formatIpcError } from "./lib/errors";
     ```

  4. Bungkus konten utama dengan conditional rendering. Ganti baris 46-86 (dari `return (` sampai `);`) dengan:
     ```tsx
     if (booting) {
       return (
         <div className="flex h-screen items-center justify-center bg-slate-100 dark:bg-slate-950">
           <p className="text-sm text-slate-500 dark:text-slate-400">Loading...</p>
         </div>
       );
     }

     return (
       <ErrorBoundary>
         <div className="flex h-screen flex-col bg-slate-100 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
           {/* ... semua konten yang ada dari baris 48-86 ... */}
         </div>
       </ErrorBoundary>
     );
     ```

  **2b. `apps/desktop/src/stores/providerStore.test.ts`** — tambah `describe("bootstrap error propagation", ...)` di akhir file:

  ```ts
  describe("bootstrap error propagation", () => {
    beforeEach(() => {
      mockInvoke.mockReset();
    });

    it("loadProviders propagates invoke error", async () => {
      mockInvoke.mockRejectedValueOnce(new Error("db locked"));
      await expect(useProviderStore.getState().loadProviders()).rejects.toThrow("db locked");
    });

    it("loadConversations propagates invoke error", async () => {
      mockInvoke.mockRejectedValueOnce(new Error("db locked"));
      await expect(useProviderStore.getState().loadConversations()).rejects.toThrow("db locked");
    });
  });
  ```

- **Behavior yang harus dipertahankan:** `loadProviders` dan `loadConversations` tetap throw ke caller (tidak ada try/catch di dalam action); error handling ada di `App.tsx`. Field `error` di store tetap bisa di-set via `setError`. Layout setelah bootstrap identik dengan sebelumnya.
- **Error handling dan edge case:**
  - `loadProviders` gagal → `setError(formatIpcError(e))` dipanggil, `booting` tetap `false` (via `.finally`), user melihat error banner + UI kosong.
  - `loadConversations` gagal → sama.
  - Keduanya gagal → `setError` dipanggil dua kali; pesan terakhir menang (acceptable).
  - Component unmount saat bootstrap → `alive = false` mencegah `setBooting`/`setError` setelah unmount.
  - `loadConversations` sudah punya internal try/catch untuk `list_messages_cmd` dan `list_bookmarks_cmd` (baris 273-287) — itu TIDAK diubah; hanya `list_conversations` (baris 259) yang throw.
- **Test yang harus ditambahkan:** Lihat 2b di atas (2 test case).
- **Input test dan expected result:**
  - `loadProviders` dengan `invoke` reject `new Error("db locked")` → `rejects.toThrow("db locked")`
  - `loadConversations` dengan `invoke` reject `new Error("db locked")` → `rejects.toThrow("db locked")`
- **Command verifikasi:**
  - `pnpm --filter inference-chat-studio-desktop typecheck` → clean.
  - `pnpm --filter inference-chat-studio-desktop test -- src/stores/providerStore.test.ts` → semua passed (7 lama + 2 baru = 9).
- **Hasil verifikasi yang diharapkan:** typecheck clean; 9/9 passed.
- **Completion criteria:** `App.tsx` punya state `booting`, menampilkan "Loading..." saat boot, menampilkan error via `setError` jika bootstrap gagal; 2 test baru hijau; tidak ada perubahan selain 2 file di atas.
- **File atau area yang tidak boleh diubah:** `src-tauri/**`, `crates/**`, `packages/api-types/**`, `providerStore.ts` (action tidak diubah), komponen lain, `index.css`, `ui.ts`, `ErrorBoundary.tsx`.

---

## Langkah 3 — Empty states (pure function + component update)

- **Tujuan langkah:** Empty state membedakan "belum ada data" vs "filter tidak match"; ada ilustrasi SVG inline; pesan lebih informatif.
- **Finding/requirement:** F3 (empty state polos, tidak membedakan kondisi), R3.
- **Dependency:** tidak ada.
- **File yang harus dibaca:**
  - `apps/desktop/src/components/ConversationList.tsx` seluruh file (116 baris).
  - `apps/desktop/src/components/MessageList.tsx` seluruh file (182 baris).
  - `apps/desktop/src/lib/ui.ts` (token `hintText`, `btnPrimary`).
- **File yang harus diubah:**
  1. `apps/desktop/src/lib/emptyState.ts` (file baru)
  2. `apps/desktop/src/lib/emptyState.test.ts` (file baru)
  3. `apps/desktop/src/components/ConversationList.tsx`
  4. `apps/desktop/src/components/MessageList.tsx`
- **Class, function, method, type, simbol terkait:**
  - `getConversationEmptyMessage : (totalCount : number, visibleCount : number, search : string, filterProvider : string | null, filterModel : string | null) => string` di `lib/emptyState.ts`.
  - `getMessageEmptyMessage : (hasConversation : boolean) => string` di `lib/emptyState.ts`.
  - `ConversationEmptyIcon`, `MessageEmptyIcon` — komponen SVG inline di masing-masing file component.
- **Kondisi implementasi saat ini:**
  - `ConversationList.tsx:113`: `{visible.length === 0 && <p className={hintText}>No conversations match.</p>}` — satu pesan untuk semua kasus.
  - `MessageList.tsx:114-116`: `if (messages.length === 0) { return <p className={hintText}>No messages yet. Send the first one below.</p>; }` — tidak membedakan "belum ada conversation" vs "conversation kosong".
- **Perubahan konkret (urutan):**

  **3a. `apps/desktop/src/lib/emptyState.ts`** — file baru, seluruh isi:

  ```ts
  /**
   * Pure functions for empty-state messages.
   * Extracted for unit-testability without jsdom.
   */

  export function getConversationEmptyMessage(
    totalCount : number,
    visibleCount : number,
    search : string,
    filterProvider : string | null,
    filterModel : string | null
  ): string {
    if (totalCount === 0) {
      return "No conversations yet. Type a title above and press New to create one.";
    }
    if (visibleCount === 0) {
      const filters : string[] = [];
      if (search.trim()) filters.push(`search "${search.trim()}"`);
      if (filterProvider) filters.push("provider filter");
      if (filterModel) filters.push("model filter");
      return `No conversations match ${filters.join(" and ")}.`;
    }
    return "";
  }

  export function getMessageEmptyMessage(hasConversation : boolean): string {
    if (!hasConversation) {
      return "Select or create a conversation to start chatting.";
    }
    return "No messages yet. Send the first one below.";
  }
  ```

  **3b. `apps/desktop/src/lib/emptyState.test.ts`** — file baru, seluruh isi:

  ```ts
  import { describe, expect, it } from "vitest";
  import { getConversationEmptyMessage, getMessageEmptyMessage } from "./emptyState";

  describe("getConversationEmptyMessage", () => {
    it("returns creation prompt when no conversations exist", () => {
      expect(getConversationEmptyMessage(0, 0, "", null, null)).toBe(
        "No conversations yet. Type a title above and press New to create one."
      );
    });

    it("returns filter mismatch message with search", () => {
      expect(getConversationEmptyMessage(5, 0, "hello", null, null)).toBe(
        'No conversations match search "hello".'
      );
    });

    it("returns filter mismatch message with provider filter", () => {
      expect(getConversationEmptyMessage(5, 0, "", "p1", null)).toBe(
        "No conversations match provider filter."
      );
    });

    it("returns filter mismatch message with model filter", () => {
      expect(getConversationEmptyMessage(5, 0, "", null, "m1")).toBe(
        "No conversations match model filter."
      );
    });

    it("combines multiple filters", () => {
      expect(getConversationEmptyMessage(5, 0, "hi", "p1", "m1")).toBe(
        'No conversations match search "hi" and provider filter and model filter.'
      );
    });

    it("returns empty string when conversations are visible", () => {
      expect(getConversationEmptyMessage(5, 3, "", null, null)).toBe("");
    });
  });

  describe("getMessageEmptyMessage", () => {
    it("prompts to select conversation when none active", () => {
      expect(getMessageEmptyMessage(false)).toBe(
        "Select or create a conversation to start chatting."
      );
    });

    it("prompts to send first message when conversation is active", () => {
      expect(getMessageEmptyMessage(true)).toBe(
        "No messages yet. Send the first one below."
      );
    });
  });
  ```

  **3c. `apps/desktop/src/components/ConversationList.tsx`** — update empty state:

  1. Tambah import setelah baris 4:
     ```ts
     import { getConversationEmptyMessage } from "../lib/emptyState";
     ```

  2. Ganti baris 113 (`{visible.length === 0 && <p className={hintText}>No conversations match.</p>}`) dengan:
     ```tsx
     {visible.length === 0 && (
       <div className="flex flex-col items-center gap-2 py-4">
         <svg
           aria-hidden
           className="h-10 w-10 text-slate-300 dark:text-slate-600"
           fill="none"
           viewBox="0 0 24 24"
           stroke="currentColor"
           strokeWidth={1.5}
         >
           <path
             strokeLinecap="round"
             strokeLinejoin="round"
             d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm3.75 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm3.75 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0ZM21 12c0 4.556-4.03 8.25-9 8.25a9.76 9.76 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z"
           />
         </svg>
         <p className={`${hintText} max-w-52 text-center`}>
           {getConversationEmptyMessage(
             conversations.length,
             visible.length,
             conversationSearch,
             conversationFilterProvider,
             conversationFilterModel
           )}
         </p>
       </div>
     )}
     ```

  **3d. `apps/desktop/src/components/MessageList.tsx`** — update empty state:

  1. Tambah import setelah baris 9:
     ```ts
     import { getMessageEmptyMessage } from "../lib/emptyState";
     ```

  2. Ganti baris 114-116:
     ```tsx
     if (messages.length === 0) {
       return (
         <div className="flex flex-col items-center gap-2 py-8">
           <svg
             aria-hidden
             className="h-10 w-10 text-slate-300 dark:text-slate-600"
             fill="none"
             viewBox="0 0 24 24"
             stroke="currentColor"
             strokeWidth={1.5}
           >
             <path
               strokeLinecap="round"
               strokeLinejoin="round"
               d="M7.5 8.25h9m-9 3.75h5.25M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
             />
           </svg>
           <p className={`${hintText} max-w-52 text-center`}>
             {getMessageEmptyMessage(
               useProviderStore.getState().activeConversationId !== null
             )}
           </p>
         </div>
       );
     }
     ```

- **Behavior yang harus dipertahankan:** Logika filter/search/rename/delete tidak berubah; hanya bagian empty state yang di-update. SVG `aria-hidden` (dekoratif, bukan konten). Pesan tetap pakai token `hintText`.
- **Error handling dan edge case:** Tidak ada error handling khusus — pure function tidak throw. `conversations.length` dan `visible.length` selalu number valid.
- **Test yang harus ditambahkan:** Lihat 3b di atas (7 test case untuk `getConversationEmptyMessage` + 2 untuk `getMessageEmptyMessage` = 9 total).
- **Input test dan expected result:** Lihat 3b.
- **Command verifikasi:**
  - `pnpm --filter inference-chat-studio-desktop typecheck` → clean.
  - `pnpm --filter inference-chat-studio-desktop test -- src/lib/emptyState.test.ts` → 9/9 passed.
- **Hasil verifikasi yang diharapkan:** typecheck clean; 9/9 passed.
- **Completion criteria:** `emptyState.ts` ada dengan 2 pure function; 9 test hijau; `ConversationList.tsx` dan `MessageList.tsx` menggunakan pure function + SVG inline; tidak ada perubahan selain 4 file di atas.
- **File atau area yang tidak boleh diubah:** `src-tauri/**`, `crates/**`, `packages/api-types/**`, `providerStore.ts`, komponen lain, `index.css`, `ui.ts`.

---

## Langkah 4 — Focus management (pure function + component update)

- **Tujuan langkah:** Dialog (AboutDialog, CommandPalette) trap focus saat terbuka; focus kembali ke elemen trigger saat dialog tertutup.
- **Finding/requirement:** F4 (tidak ada focus trap, tidak ada focus restoration), R4.
- **Dependency:** tidak ada.
- **File yang harus dibaca:**
  - `apps/desktop/src/components/AboutDialog.tsx` seluruh file (154 baris).
  - `apps/desktop/src/components/CommandPalette.tsx` seluruh file (122 baris).
  - `apps/desktop/src/lib/ui.ts` (token `input`).
- **File yang harus diubah:**
  1. `apps/desktop/src/lib/focus.ts` (file baru)
  2. `apps/desktop/src/lib/focus.test.ts` (file baru)
  3. `apps/desktop/src/components/AboutDialog.tsx`
  4. `apps/desktop/src/components/CommandPalette.tsx`
- **Class, function, method, type, simbol terkait:**
  - `getNextFocusIndex : (currentIndex : number, focusableCount : number, shiftKey : boolean) => number` di `lib/focus.ts`.
  - `getFocusableElements : (container : HTMLElement) => HTMLElement[]` di `lib/focus.ts` (helper DOM, tidak di-test langsung).
  - `restoreFocus : (prevActive : Element | null) => void` di `lib/focus.ts` (helper DOM).
  - `triggerRef : useRef<HTMLElement | null>` di masing-masing dialog.
- **Kondisi implementasi saat ini:**
  - `AboutDialog`: tidak ada focus trap; focus hanya di-restore ke `inputRef` saat `open` berubah (baris 36 `window.setTimeout(() => inputRef.current?.focus(), 0)` — ini untuk CommandPalette, bukan AboutDialog). AboutDialog tidak auto-focus elemen apa pun saat terbuka.
  - `CommandPalette`: auto-focus ke `inputRef` saat open (baris 36), tapi tidak ada focus trap — user bisa Tab keluar dari dialog.
  - Keduanya tidak mengembalikan focus ke trigger saat tertutup.
- **Perubahan konkret (urutan):**

  **4a. `apps/desktop/src/lib/focus.ts`** — file baru, seluruh isi:

  ```ts
  /**
   * Focus trap utilities for modal dialogs.
   * Pure functions extracted for unit-testability; DOM helpers are thin wrappers.
   */

  /**
   * Compute the next focusable index in a cyclic list.
   * Tab (shiftKey=false) moves forward, wrapping to 0 at the end.
   * Shift+Tab (shiftKey=true) moves backward, wrapping to end at 0.
   * Returns 0 when there are no focusable elements.
   */
  export function getNextFocusIndex(
    currentIndex : number,
    focusableCount : number,
    shiftKey : boolean
  ): number {
    if (focusableCount <= 0) return 0;
    if (shiftKey) {
      return currentIndex <= 0 ? focusableCount - 1 : currentIndex - 1;
    }
    return currentIndex >= focusableCount - 1 ? 0 : currentIndex + 1;
  }

  /**
   * Return all focusable elements inside a container, in DOM order.
   * Filters out disabled elements and elements with tabindex="-1".
   */
  export function getFocusableElements(container : HTMLElement) : HTMLElement[] {
    const selector = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    return Array.from(container.querySelectorAll<HTMLElement>(selector)).filter(
      (el) => el.offsetParent !== null
    );
  }

  /**
   * Restore focus to the previously active element (if still in the DOM).
   */
  export function restoreFocus(prevActive : Element | null) : void {
    if (prevActive instanceof HTMLElement && document.contains(prevActive)) {
      prevActive.focus();
    }
  }
  ```

  **4b. `apps/desktop/src/lib/focus.test.ts`** — file baru, seluruh isi:

  ```ts
  import { describe, expect, it } from "vitest";
  import { getNextFocusIndex } from "./focus";

  describe("getNextFocusIndex", () => {
    it("moves forward and wraps to 0 at the end", () => {
      expect(getNextFocusIndex(0, 3, false)).toBe(1);
      expect(getNextFocusIndex(1, 3, false)).toBe(2);
      expect(getNextFocusIndex(2, 3, false)).toBe(0);
    });

    it("moves backward and wraps to end at 0", () => {
      expect(getNextFocusIndex(2, 3, true)).toBe(1);
      expect(getNextFocusIndex(1, 3, true)).toBe(0);
      expect(getNextFocusIndex(0, 3, true)).toBe(2);
    });

    it("returns 0 when no focusable elements", () => {
      expect(getNextFocusIndex(0, 0, false)).toBe(0);
      expect(getNextFocusIndex(0, 0, true)).toBe(0);
    });

    it("returns 0 for single focusable element", () => {
      expect(getNextFocusIndex(0, 1, false)).toBe(0);
      expect(getNextFocusIndex(0, 1, true)).toBe(0);
    });
  });
  ```

  **4c. `apps/desktop/src/components/AboutDialog.tsx`** — tambah focus trap + restoration:

  1. Tambah import setelah baris 5:
     ```ts
     import { getFocusableElements, getNextFocusIndex, restoreFocus } from "../lib/focus";
     ```

  2. Tambah ref untuk trigger setelah baris 23:
     ```ts
     const triggerRef = useRef<HTMLElement | null>(null);
     ```

  3. Simpan trigger sebelum open. Tambah `useEffect` baru setelah baris 68 (setelah `useEffect` Escape handler):
     ```ts
     useEffect(() => {
       if (open) {
         triggerRef.current = document.activeElement;
       } else {
         restoreFocus(triggerRef.current);
         triggerRef.current = null;
       }
     }, [open]);
     ```

  4. Tambah focus trap handler. Tambah `useEffect` baru setelah effect di atas:
     ```ts
     useEffect(() => {
       if (!open) return;
       function onKeyDown(e : KeyboardEvent) {
         if (e.key !== "Tab") return;
         const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
         if (!dialog) return;
         const focusable = getFocusableElements(dialog);
         if (focusable.length === 0) {
           e.preventDefault();
           return;
         }
         const currentIndex = focusable.indexOf(document.activeElement as HTMLElement);
         const nextIndex = getNextFocusIndex(currentIndex, focusable.length, e.shiftKey);
         e.preventDefault();
         focusable[nextIndex]?.focus();
       }
       document.addEventListener("keydown", onKeyDown);
       return () => document.removeEventListener("keydown", onKeyDown);
     }, [open]);
     ```

  5. Auto-focus elemen pertama saat dialog terbuka. Tambah `useEffect`:
     ```ts
     useEffect(() => {
       if (!open) return;
       const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
       if (dialog) {
         const focusable = getFocusableElements(dialog);
         if (focusable.length > 0) {
           window.setTimeout(() => focusable[0]!.focus(), 0);
         }
       }
     }, [open]);
     ```

  **4d. `apps/desktop/src/components/CommandPalette.tsx`** — tambah focus trap + restoration:

  1. Tambah import setelah baris 5:
     ```ts
     import { getFocusableElements, getNextFocusIndex, restoreFocus } from "../lib/focus";
     ```

  2. Tambah ref untuk trigger setelah baris 15:
     ```ts
     const triggerRef = useRef<HTMLElement | null>(null);
     ```

  3. Ganti `useEffect` yang ada (baris 32-38) dengan:
     ```ts
     useEffect(() => {
       if (open) {
         triggerRef.current = document.activeElement;
         setQuery("");
         setCursor(0);
         window.setTimeout(() => inputRef.current?.focus(), 0);
       } else {
         restoreFocus(triggerRef.current);
         triggerRef.current = null;
       }
     }, [open]);
     ```

  4. Tambah focus trap handler. Tambah `useEffect` baru setelah effect di atas:
     ```ts
     useEffect(() => {
       if (!open) return;
       function onKeyDown(e : KeyboardEvent) {
         if (e.key !== "Tab") return;
         const dialog = document.querySelector<HTMLElement>(".fixed.inset-0.z-50");
         if (!dialog) return;
         const focusable = getFocusableElements(dialog);
         if (focusable.length === 0) {
           e.preventDefault();
           return;
         }
         const currentIndex = focusable.indexOf(document.activeElement as HTMLElement);
         const nextIndex = getNextFocusIndex(currentIndex, focusable.length, e.shiftKey);
         e.preventDefault();
         focusable[nextIndex]?.focus();
       }
       document.addEventListener("keydown", onKeyDown);
       return () => document.removeEventListener("keydown", onKeyDown);
     }, [open]);
     ```

- **Behavior yang harus dipertahankan:** Escape handler yang ada tidak berubah; auto-focus ke input di CommandPalette tetap; `run()` action tetap identik; AboutDialog tetap menampilkan info/error/loading seperti sebelumnya.
- **Error handling dan edge case:**
  - Tidak ada focusable element di dialog → `e.preventDefault()` mencegah focus keluar, tidak ada crash.
  - `document.activeElement` bukan HTMLElement (mis. `document.body`) → `indexOf` return -1 → `getNextFocusIndex(-1, n, false)` return 0 (focus ke elemen pertama) atau `getNextFocusIndex(-1, n, true)` return `n-1` (focus ke elemen terakhir). Acceptable.
  - Dialog tertutup saat focus trap aktif → cleanup `removeEventListener` via return function.
  - `restoreFocus` hanya fokus jika elemen masih ada di DOM.
- **Test yang harus ditambahkan:** Lihat 4b di atas (5 test case).
- **Input test dan expected result:** Lihat 4b.
- **Command verifikasi:**
  - `pnpm --filter inference-chat-studio-desktop typecheck` → clean.
  - `pnpm --filter inference-chat-studio-desktop test -- src/lib/focus.test.ts` → 5/5 passed.
- **Hasil verifikasi yang diharapkan:** typecheck clean; 5/5 passed.
- **Completion criteria:** `focus.ts` ada dengan 3 function; 5 test hijau; AboutDialog dan CommandPalette punya focus trap + restoration; tidak ada perubahan selain 4 file di atas.
- **File atau area yang tidak boleh diubah:** `src-tauri/**`, `crates/**`, `packages/api-types/**`, `providerStore.ts`, komponen lain, `index.css`, `ui.ts`.

---

## Langkah 5 — `aria-label` untuk icon-only buttons

- **Tujuan langkah:** Semua tombol icon-only (tanpa teks terlihat) punya `aria-label` untuk screen reader.
- **Finding/requirement:** F5 (tombol icon-only pakai `title` native), R5.
- **Dependency:** tidak ada.
- **File yang harus dibaca:**
  - `apps/desktop/src/components/ChatView.tsx` baris 305-311 (error banner dengan tombol `×`).
  - `apps/desktop/src/components/BookmarkRail.tsx` baris 43-49 (tombol `×` delete bookmark).
  - `apps/desktop/src/components/MessageList.tsx` baris 145-147 (tombol Copy — punya teks, tidak perlu).
- **File yang harus diubah:**
  1. `apps/desktop/src/components/ChatView.tsx`
  2. `apps/desktop/src/components/BookmarkRail.tsx`
- **Class, function, method, type, simbol terkait:**
  - Tombol `×` dismiss error di `ChatView.tsx:310`.
  - Tombol `×` delete bookmark di `BookmarkRail.tsx:48`.
- **Kondisi implementasi saat ini:**
  - `ChatView.tsx:310`: `<button onClick={() => setError(null)} title="Dismiss" ...>×</button>` — punya `title` tapi tidak `aria-label`.
  - `BookmarkRail.tsx:48`: `<button ... title="Delete bookmark" ...>×</button>` — sama.
- **Perubahan konkret (urutan):**

  **5a. `apps/desktop/src/components/ChatView.tsx`** — baris 310, tambah `aria-label`:
  ```tsx
  <button onClick={() => setError(null)} title="Dismiss" aria-label="Dismiss error" className="rounded px-1.5 hover:bg-red-100 dark:hover:bg-red-900">×</button>
  ```

  **5b. `apps/desktop/src/components/BookmarkRail.tsx`** — baris 43-49, tambah `aria-label`:
  ```tsx
  <button
    onClick={() => void deleteBookmark(b.id).catch(() => undefined)}
    title="Delete bookmark"
    aria-label="Delete bookmark"
    className="hidden rounded px-1 text-slate-400 hover:bg-slate-200 group-hover:block dark:hover:bg-slate-700"
  >
    ×
  </button>
  ```

- **Behavior yang harus dipertahankan:** `title` tetap ada (tooltip visual); `aria-label` ditambahkan untuk screen reader. Tidak ada perubahan visual.
- **Error handling dan edge case:** Tidak ada — murni atribut tambahan.
- **Test yang harus ditambahkan:** Tidak ada test otomatis (perubahan murni presentasional). Verifikasi manual di Langkah 6.
- **Command verifikasi:**
  - `pnpm --filter inference-chat-studio-desktop typecheck` → clean.
- **Hasil verifikasi yang diharapkan:** typecheck clean.
- **Completion criteria:** Kedua tombol `×` punya `aria-label`; tidak ada perubahan selain 2 file di atas.
- **File atau area yang tidak boleh diubah:** `src-tauri/**`, `crates/**`, `packages/api-types/**`, `providerStore.ts`, komponen lain, `index.css`, `ui.ts`.

---

## Langkah 6 — Verifikasi penuh + checklist manual

- **Tujuan langkah:** Memastikan tidak ada regresi dan semua perubahan bekerja end-to-end.
- **Finding/requirement:** R1-R5 + garansi Langkah 1-5.
- **Dependency:** Langkah 1-5 selesai.
- **File yang harus dibaca:** `TEST-CHECKLIST.md` (format tabel; kolom `Actual` diisi manual) — hanya dibaca untuk konteks.
- **File yang harus diubah:** TIDAK ADA file kode. Opsional: update `## Progress Log` file plan ini + memory entry (di luar eksekusi model kecil; serahkan ke reviewer).
- **Perintah verifikasi (urutan, dari root repo):**
  1. `pnpm --filter inference-chat-studio-desktop typecheck`
     -> expected: clean, 0 error.
  2. `pnpm --filter inference-chat-studio-desktop test`
     -> expected: semua file passed. Test count baru: errors.test.ts 7 (3 lama + 4 baru), emptyState.test.ts 9 (baru), focus.test.ts 5 (baru), providerStore.test.ts 9 (7 lama + 2 baru). Total: 59 + 4 + 9 + 5 + 2 = 79 passed.
  3. `cargo test -p inference-chat-studio-tauri`
     -> expected: 11 passed (tidak ada perubahan Rust; murni cek regresi).
  4. `cargo clippy -- -D warnings`
     -> expected: `Finished` tanpa error.
- **Checklist manual (wajib, karena tidak ada e2e otomatis):**
  1. `cargo tauri dev` (atau `pnpm tauri dev` sesuai setup lokal), buka app.
  2. **Bootstrap loading:** Saat app pertama kali terbuka, harus muncul teks "Loading..." sebelum konten utama muncul. Jika DB kosong, loading cepat lalu muncul UI kosong.
  3. **Error boundary:** Buka DevTools console, jalankan `document.querySelector('#root').innerHTML = ''` atau trigger render crash → harus muncul "Something went wrong" + tombol "Try again", bukan white screen.
  4. **Empty state ConversationList:** Dengan DB kosong, panel Conversations menampilkan ikon chat bubble + pesan "No conversations yet. Type a title above and press New to create one." (bukan "No conversations match.").
  5. **Empty state ConversationList dengan filter:** Buat 1 conversation, lalu ketik search yang tidak match → pesan berubah menjadi `No conversations match search "<query>".`
  6. **Empty state MessageList:** Tanpa active conversation, area chat menampilkan ikon pesan + "Select or create a conversation to start chatting."
  7. **Focus trap AboutDialog:** Klik "About" → dialog terbuka, focus otomatis ke elemen pertama. Tekan Tab berulang → focus tetap di dalam dialog (keluar dari tombol terakhir kembali ke pertama). Tekan Escape → dialog tertutup, focus kembali ke tombol "About".
  8. **Focus trap CommandPalette:** Tekan Ctrl+K → palette terbuka, focus ke input. Tekan Tab → focus tetap di dalam palette. Tekan Escape → tertutup, focus kembali ke elemen sebelumnya.
  9. **aria-label:** Buka DevTools, inspect tombol `×` di error banner dan bookmark → harus punya atribut `aria-label`.
- **Completion criteria:** 4 command hijau + 9 cek manual lolos + `git status` hanya menunjukkan file yang terdaftar di scope.
- **File atau area yang tidak boleh diubah:** semua di luar scope.

---

## Risks

- **Error boundary tidak menangkap async error.** Mitigasi: async error sudah ditangani pola yang ada (try/catch + store `error` field). Error boundary hanya untuk render-time crash.
- **Focus trap bisa conflict dengan focus handler lain.** Mitigasi: focus trap hanya aktif saat `open === true`; cleanup via `removeEventListener`. CommandPalette sudah punya auto-focus ke input — focus trap tidak mengganggu karena input sudah di dalam dialog.
- **Bootstrap loading bisa flash terlalu cepat.** Mitigasi: acceptable untuk app local-first; jika ingin hindari flash, tambah `window.setTimeout(() => setBooting(false), 300)` — TIDAK direkomendasikan karena menambah kompleksitas tanpa manfaat signifikan.
- **SVG inline menambah ukuran bundle.** Mitigasi: dua SVG sederhana (~200 byte each), negligible.
- **Tidak ada test komponen React.** Risiko diterima; checklist manual Langkah 6 menutupnya. Jika ingin test komponen, perlu tambah testing-library + jsdom — di luar scope.

## Progress Log

- 2026-09-30 23:45:00 — Plan dibuat. Belum ada implementasi.

## Notes

- Semua pure function diekstrak ke `lib/` agar bisa di-unit-test tanpa jsdom. Component hanya memanggil function dan render hasilnya.
- Error boundary adalah class component — satu-satunya class component di codebase. Ini intentional karena React 18 belum punya hook-based error boundary.
- `getFocusableElements` dan `restoreFocus` adalah DOM helper yang tidak di-test langsung (butuh jsdom), tapi `getNextFocusIndex` (logika inti) di-test penuh.
- Usulan commit saat implementasi selesai (satu baris, tanpa trailer):
  `feat: add error boundaries, bootstrap loading, empty states, focus management, and aria-labels`

---

## Handoff Checklist (untuk model pelaksana kecil)

- [ ] Kerjakan Langkah 1 dulu sampai 4 test barunya hijau; baru lanjut Langkah 2.
- [ ] Kerjakan Langkah 2 sampai 2 test barunya hijau; baru lanjut Langkah 3.
- [ ] Kerjakan Langkah 3 sampai 9 test barunya hijau; baru lanjut Langkah 4.
- [ ] Kerjakan Langkah 4 sampai 5 test barunya hijau; baru lanjut Langkah 5.
- [ ] Kerjakan Langkah 5 (tanpa test, hanya typecheck).
- [ ] Akhiri dengan Langkah 6 penuh (4 command + 9 cek manual) + centang Tasks di file plan ini.
- [ ] Hanya ubah file yang terdaftar di tiap langkah; selain itu dilarang (terutama `src-tauri/**`, `crates/**`, `packages/api-types/**`).
- [ ] Jangan tambah dependency npm/cargo, capability, atau migrasi DB.
- [ ] Setiap langkah selesai -> jalankan command verifikasi langkah itu; lanjut hanya jika hijau.
- [ ] Jangan ubah token `ui.ts`, `index.css`, atau `providerStore.ts` (kecuali test file).
