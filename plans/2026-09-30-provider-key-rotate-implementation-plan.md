# Provider Key Rotate/Replace Implementation Plan

Created: 2026-09-30 21:30:00

## Objective
Menambah cara replace/rotate API key provider yang sudah ada dari UI, memakai IPC
`update_provider` yang sudah tersedia di backend. Key lama tidak pernah ditampilkan
(secret tidak pernah keluar backend); form hanya melakukan replace.

## Scope
- `apps/desktop/src/stores/providerStore.ts` (action baru)
- `apps/desktop/src/stores/providerStore.test.ts` (test baru)
- `apps/desktop/src/components/ProviderForm.tsx` (UI rotate per-provider)
- In scope: key-only replace. Nama/base_url tidak ikut diedit.
- Out of scope: perubahan Rust apa pun, menampilkan key saat ini, auto-test
  koneksi setelah rotate, enkripsi tambahan, migrasi DB.

## Requirement Traceability
- R1 User dapat mengganti API key provider tanpa delete/re-create
  -> Langkah 1 (store action), Langkah 2 (UI)
- R2 Setelah rotate, status koneksi lama tidak boleh menipu user
  -> Langkah 1 (reset `statusByProvider[id]` ke `"not_tested"`)
- R3 Key lama/tersimpan tidak pernah tampil di UI
  -> Langkah 2 (hanya password input kosong + hint), ada test implisit
- R4 Validasi key kosong dengan pesan jelas, tanpa request sia-sia
  -> Langkah 1 (throw sebelum invoke), Langkah 2 (cek sebelum panggil)
- R7 Tidak ada regresi provider flow yang ada
  -> Langkah 3 (verifikasi penuh)

## Decisions (eksplisit, bukan diam-diam)
- D1 Scope key-only, bukan full-edit (nama/base_url). Rationale: request user
  hanya rotate key; full-edit menambah validasi dan risiko regresi form create.
- D2 Setelah rotate sukses, status di-reset ke `"not_tested"`, TIDAK auto
  `testConnection`. Rationale: menghindari network call yang tidak diminta user
  tepat setelah ganti secret; user menekan "Test connection" sendiri seperti alur
  Add provider yang sudah ada.
- D3 Tidak ada `window.confirm` untuk rotate. Rationale: operasi non-destruktif
  (history/model tidak tersentuh; key lama tertimpa tapi itu memang tujuannya).
- D4 Bentuk argumen invoke: `invoke("update_provider", { id, input: { api_key } })`.
  Rationale: aturan Tauri v2 — nama parameter macro camelCase di sisi JS
  (`id`, `input`), sedangkan field struct Rust tetap snake_case (`api_key`).
  Mengirim `apiKey` di dalam `input` akan silently menjadi `None` dan rotate
  menjadi no-op tanpa error — ini bahaya yang harus dihindari (lihat test L1-T2).

## Tasks
- [x] Langkah 1 — Store action `rotateProviderKey` + test
- [x] Langkah 2 — UI "Rotate key" per-provider di `ProviderForm.tsx`
- [x] Langkah 3 — Verifikasi penuh + checklist manual

---

## Langkah 1 — Store action `rotateProviderKey` + test

- Tujuan langkah: satu action store yang memanggil `update_provider` dengan
  bentuk argumen yang benar, mengganti provider di list, dan me-reset status.
- Finding/requirement: F1 (tidak ada path rotate), R1, R2, R4.
- Dependency: tidak ada (backend `update_provider` sudah ada dan tidak diubah).
- File yang harus dibaca:
  - `apps/desktop/src/stores/providerStore.ts` baris 1-75 (imports, interface
    `ProviderState`, daftar action) dan baris 164-237 (pola `testConnection`
    dan `deleteProvider` sebagai contoh reset status dan update list).
  - `apps/desktop/src/stores/providerStore.test.ts` seluruh file (pola mock
    `invoke` + `useProviderStore.setState` + assertion bentuk argumen).
  - `src-tauri/src/ipc.rs` baris 167-176 (`UpdateProviderInput`: field
    `api_key: Option<String>`) dan baris 396-430 (semantik: `api_key` kosong
    ditolak backend, secret ditimpa di OS store, row lain tidak berubah).
- File yang harus diubah:
  1. `apps/desktop/src/stores/providerStore.ts`
  2. `apps/desktop/src/stores/providerStore.test.ts`
- Class, function, method, type, simbol terkait:
  - `ProviderState.rotateProviderKey : (id : string, apiKey : string) => Promise<void>`
    (nama param `apiKey` camelCase di TS; saat invoke dipetakan ke `api_key`).
  - `invoke` dari `@tauri-apps/api/core`, `ProviderDto`, `formatIpcError`
    (tidak dipakai di action ini — error dibiarkan throw ke caller seperti
    pola `deleteProvider`).
- Kondisi implementasi saat ini: interface `ProviderState` tidak punya action
  update/rotate; tidak ada pemanggilan `"update_provider"` di seluruh frontend
  (sudah diverifikasi via grep).
- Perubahan konkret (urutan di dalam `providerStore.ts`):
  1. Di interface `ProviderState`, tambah satu baris setelah baris
     `deleteProvider` (baris 56):
     `rotateProviderKey : (id : string, apiKey : string) => Promise<void>;`
  2. Di objek `create<ProviderState>(...)`, tambah implementasi tepat setelah
     blok `deleteProvider` (setelah baris 237, sebelum `setActive` baris 239):
     ```ts
     rotateProviderKey : async (id : string, apiKey : string) => {
       if (!apiKey) {
         throw new Error("API key must not be empty.");
       }
       const updated = await invoke<ProviderDto>("update_provider", {
         id,
         input : { api_key : apiKey }
       });
       set((s) => ({
         providers : s.providers.map((p) => (p.id === id ? updated : p)),
         statusByProvider : { ...s.statusByProvider, [id] : "not_tested" },
         testErrorByProvider : { ...s.testErrorByProvider, [id] : null }
       }));
     },
     ```
  3. JANGAN memanggil `loadProviders()` di dalam action (menghindari N+1
     `list_models_cmd`); JANGAN memanggil `testConnection` (keputusan D2);
     JANGAN mengubah `activeProviderId/activeModelId` (id provider tidak berubah).
- Behavior yang harus dipertahankan: urutan `providers` tetap (map in-place,
  bukan filter/sort); `modelsByProvider`, seleksi aktif, conversations, dan
  semua state lain tidak tersentuh; error dari backend di-throw apa adanya
  (komponen yang memformat via `formatIpcError`, sama seperti `deleteProvider`).
- Error handling dan edge case:
  - `apiKey === ""` -> throw `Error("API key must not be empty.")` SEBELUM
    invoke (tidak ada network/IPC call).
  - Provider id tidak ada di backend -> backend return
    `{code:"model_not_found"}`; action tidak catch; komponen menampilkan pesan.
  - `updated` dari backend menggantikan row lama utuh (termasuk `updated_at`
    baru); jika id tidak ada di list lokal (race delete), map tidak mengubah
    apa pun kecuali reset status — tidak error.
- Test yang harus ditambahkan di `providerStore.test.ts` (append
  `describe("rotateProviderKey", ...)` baru di akhir file; JANGAN ubah
  `describe("IPC argument shapes", ...)` yang ada):
  - L1-T1 "sends id and snake_case api_key, replaces provider, resets status":
    setup `useProviderStore.setState({ providers:[{id:"p1",name:"Old",...}],
    statusByProvider:{p1:"connected"}, testErrorByProvider:{p1:"boom"} })`
    (field ProviderDto lain boleh minimal selama TS lolos; contoh:
    `{ id:"p1", name:"Old", compatibility_type:"openai", api_mode:"chat_completions",
    base_url:"https://x", enabled:true, created_at:"t", updated_at:"t" }`).
    Mock `invoke.mockResolvedValueOnce({...sama, name:"Old", updated_at:"t2"})`.
    Panggil `await getState().rotateProviderKey("p1","sk-new")`.
    Expected: `mockInvoke` dipanggil tepat sekali dengan
    `("update_provider", { id:"p1", input:{ api_key:"sk-new" } })`
    (gunakan `toHaveBeenCalledWith` dengan objek persis — ini menangkap bug
    camelCase `apiKey` yang silent-no-op); `providers[0].updated_at === "t2"`;
    `statusByProvider.p1 === "not_tested"`; `testErrorByProvider.p1 === null`.
  - L1-T2 "throws before invoke on empty key":
    `await expect(getState().rotateProviderKey("p1","")).rejects.toThrow("API key must not be empty.")`
    dan `expect(mockInvoke).not.toHaveBeenCalled()`.
  - L1-T3 "propagates backend error without touching list":
    mock `invoke.mockRejectedValueOnce({code:"model_not_found",message:"nope"})`;
    `await expect(...).rejects.toEqual({code:"model_not_found",message:"nope"})`;
    `providers` tetap berisi row lama (nama `"Old"`).
- Command verifikasi:
  - `pnpm --filter inference-chat-studio-desktop typecheck` -> clean.
  - `pnpm --filter inference-chat-studio-desktop test -- src/stores/providerStore.test.ts`
    -> semua test file itu passed (4 lama + 3 baru = 7).
- Hasil verifikasi yang diharapkan: typecheck tanpa error; 7/7 passed.
- Completion criteria: tiga test baru hijau; tidak ada perubahan selain dua file
  di atas; bentuk invoke persis `{ id, input: { api_key } }`.
- File atau area yang tidak boleh diubah: `src-tauri/**`, `crates/**`,
  `packages/api-types/**`, `ProviderForm.tsx` (itu Langkah 2), action store lain,
  `capabilities/*`, migrasi DB.

## Langkah 2 — UI "Rotate key" per-provider di `ProviderForm.tsx`

- Tujuan langkah: user dapat mengganti key tiap provider dari daftar, dengan
  form inline, state busy/error per-provider, dan hint bahwa key lama tidak
  ditampilkan.
- Finding/requirement: F1 (tidak ada UI), R1, R3, R4.
- Dependency: Langkah 1 (action `rotateProviderKey` harus ada).
- File yang harus dibaca:
  - `apps/desktop/src/components/ProviderForm.tsx` seluruh file (146 baris:
    pola `deletingId`, `remove()`, tombol Test/Delete, blok error merah).
  - `apps/desktop/src/lib/ui.ts` (token `btn`, `input`, `label`, `errorText`,
    `hintText` — komponen wajib compose token ini, bukan inline style).
  - `apps/desktop/src/lib/errors.ts` (`formatIpcError`).
- File yang harus diubah:
  1. `apps/desktop/src/components/ProviderForm.tsx` (satu-satunya file)
- Class, function, method, type, simbol terkait:
  - `useProviderStore()` tambah `rotateProviderKey` ke destructure.
  - State lokal baru: `const [expandedKeyId, setExpandedKeyId] = useState<string | null>(null);`
    `const [rotatingId, setRotatingId] = useState<string | null>(null);`
    `const [newKey, setNewKey] = useState("");`
    `const [rotateError, setRotateError] = useState<string | null>(null);`
  - Fungsi baru `async function rotate(id : string)` dan
    `function toggleRotate(id : string)`.
- Kondisi implementasi saat ini: tiap item provider hanya punya tombol
  "Test connection" dan "Delete"; tidak ada input key per-provider; state lokal
  hanya `name/baseUrl/apiKey/busy/error/deletingId`.
- Perubahan konkret (urutan di dalam file):
  1. Destructure store: tambah `rotateProviderKey,` setelah `deleteProvider,`
     (baris 21).
  2. Tambah 4 state lokal setelah deklarasi `deletingId` (baris 34).
  3. Tambah fungsi setelah `remove()` (setelah baris 78, sebelum `return`):
     ```ts
     function toggleRotate(id : string) {
       setRotateError(null);
       setNewKey("");
       setExpandedKeyId((cur) => (cur === id ? null : id));
     }

     async function rotate(id : string) {
       if (!newKey) {
         setRotateError("API key must not be empty.");
         return;
       }
       setRotateError(null);
       setRotatingId(id);
       try {
         await rotateProviderKey(id, newKey);
         setNewKey("");
         setExpandedKeyId(null);
       } catch (e) {
         setRotateError(formatIpcError(e));
       } finally {
         setRotatingId(null);
       }
     }
     ```
  4. Di item provider (dalam `providers.map`, setelah blok tombol Test/Delete
     baris 118-134, sebelum blok `testErrorByProvider` baris 135), tambah:
     - Tombol `<button onClick={() => toggleRotate(p.id)} className={btn}>`
       dengan label `{expandedKeyId === p.id ? "Cancel" : "Rotate key"}`
       dan `title="Replace the stored API key (the current key is never shown)"`.
       Disabled saat `rotatingId === p.id`.
     - Jika `expandedKeyId === p.id`, render di bawahnya:
       `<p className={hintText}>` berisi tepat:
       "Mengganti key di OS store; key lama tidak dapat ditampilkan."
       `<label className={label}>New API key <input type="password"
       value={newKey} onChange={...} className={input} /></label>`
       tombol Save: `<button onClick={() => void rotate(p.id)}
       disabled={rotatingId === p.id} className={btnPrimary}>`
       label `{rotatingId === p.id ? "Saving…" : "Save new key"}`.
       Jika `rotateError`, tampilkan `<p className={errorText}>{rotateError}</p>`.
  5. JANGAN ubah form "Add provider", tombol Test/Delete, atau blok error merah
     yang sudah ada.
- Behavior yang harus dipertahankan: alur Add/Test/Delete identik; hanya satu
  form rotate terbuka dalam satu waktu (membuka yang lain menutup + mengosongkan
  draft — cegah key tertukar antar provider); tombol Save disabled saat saving;
  tidak ada `window.confirm`.
- Error handling dan edge case:
  - Key kosong -> pesan lokal `"API key must not be empty."` tanpa invoke
    (mirip validasi `submit()` baris 47).
  - Backend error (mis. provider terhapus di tengah jalan) -> tampilkan
    `formatIpcError(e)` di `rotateError`, form tetap terbuka dengan draft utuh
    agar user bisa retry.
  - Sukses -> form collapse + draft dibersihkan (secret tidak tertinggal di
    state); status badge provider kembali ke `not_tested` via store (Langkah 1),
    user menekan "Test connection" sendiri.
  - Unmount saat saving: tidak ada cleanup khusus (pola yang sama dengan
    `remove()` yang ada); `rotatingId` hanya state lokal.
- Test yang harus ditambahkan atau diperbarui: tidak ada test komponen baru
  (repo tidak punya testing-library; JANGAN tambah dependency). Cakupan logika
  dijamin test store Langkah 1. Verifikasi UI bersifat manual (Langkah 3).
- Command verifikasi:
  - `pnpm --filter inference-chat-studio-desktop typecheck` -> clean.
  - `pnpm --filter inference-chat-studio-desktop test` -> 59 passed
    (56 existing + 3 baru Langkah 1).
- Hasil verifikasi yang diharapkan: typecheck clean; full vitest hijau.
- Completion criteria: tombol "Rotate key" muncul di tiap item provider;
  expand/collapse, validasi kosong, save sukses, dan error backend semuanya
  berperilaku seperti spesifikasi di atas; tidak ada perubahan visual pada
  bagian lain panel Providers.
- File atau area yang tidak boleh diubah: `src-tauri/**`, `crates/**`,
  `packages/api-types/**`, `providerStore.ts` (sudah final di Langkah 1),
  komponen lain (`ModelSelector`, `ChatView`, `App.tsx`), `index.css`.

## Langkah 3 — Verifikasi penuh + checklist manual

- Tujuan langkah: memastikan tidak ada regresi dan fitur bekerja end-to-end.
- Finding/requirement: R7 + garansi Langkah 1-2.
- Dependency: Langkah 1 dan 2 selesai.
- File yang harus dibaca: `TEST-CHECKLIST.md` (format tabel; kolom `Actual`
  diisi manual) — hanya dibaca untuk konteks, pengisian opsional.
- File yang harus diubah: TIDAK ADA file kode. Opsional: update
  `## Progress Log` file plan ini +memory entry (di luar eksekusi model kecil;
  serahkan ke reviewer).
- Perintah verifikasi (urutan, dari root repo):
  1. `pnpm --filter inference-chat-studio-desktop typecheck`
     -> expected: clean, 0 error.
  2. `pnpm --filter inference-chat-studio-desktop test`
     -> expected: 11 file passed, 59 tests passed (56 lama + 3 baru).
  3. `cargo test -p inference-chat-studio-tauri`
     -> expected: 11 passed (tidak ada perubahan Rust; murni cek regresi).
  4. `cargo clippy -- -D warnings`
     -> expected: `Finished` tanpa error (warning pre-existing tidak ada;
     jika muncul warning baru dari file di luar scope, STOP dan laporkan,
     jangan fix di luar scope).
- Checklist manual (wajib, karena tidak ada e2e otomatis):
  1. `cargo tauri dev` (atau `pnpm tauri dev` sesuai setup lokal),
     buka panel Providers.
  2. Klik "Rotate key" pada satu provider -> form expand berisi hint
     "Mengganti key di OS store; key lama tidak dapat ditampilkan." +
     input password kosong (BUKAN terisi key lama) + tombol "Save new key".
  3. Save dengan input kosong -> pesan "API key must not be empty.",
     tidak ada invoke (cek DevTools network/IPC: tidak ada call).
  4. Isi key baru -> Save -> form collapse, badge status provider kembali
     ke "not_tested", tidak ada request jaringan otomatis.
  5. Klik "Test connection" -> badge berubah sesuai hasil (memakai key baru).
  6. Kirim satu chat memakai provider tersebut -> sukses (bukti key baru
     benar-benar dipakai `load_api_key`).
  7. Buka provider lain -> form rotate sebelumnya tertutup dan draft kosong
     (tidak ada key bocor antar item).
- Completion criteria: 4 command hijau + 7 cek manual lolos + `git status`
  hanya menunjukkan `providerStore.ts`, `providerStore.test.ts`,
  `ProviderForm.tsx` (+ file plan ini).
- File atau area yang tidak boleh diubah: semua di luar tiga file di atas
  (+ file plan ini).

## Risks
- Silent no-op jika bentuk invoke salah (`apiKey` camelCase di dalam `input`
  menjadi `None` di Rust dan rotate "sukses" palsu). Mitigasi: test L1-T1
  assert bentuk argumen persis; pelaksana DILARANG mengubah bentuk invoke.
- Secret tertinggal di state React (`newKey`) setelah sukses. Mitigasi:
  `setNewKey("")` di path sukses (spesifikasi Langkah 2); jangan simpan key
  di store global.
- Draft key tertukar antar provider jika dua form terbuka. Mitigasi: satu
  `expandedKeyId`; buka baru selalu reset draft.
- Tidak ada test komponen UI (tanpa testing-library). Risiko diterima;
  checklist manual Langkah 3 menutupnya.

## Progress Log
- 2026-09-30 21:30:00 — Plan dibuat. Belum ada implementasi.
- 2026-09-30 23:08:00 — Semua langkah diimplementasi; `cargo test` 11 passed, typecheck clean, clippy clean, vitest 59 passed (3 baru di `providerStore.test.ts`). File baru/diubah: `providerStore.ts`, `providerStore.test.ts`, `ProviderForm.tsx`. Manual e2e check pending (lihat catatan Handoff Checklist).

## Notes
- Backend `update_provider` (`src-tauri/src/ipc.rs:396-446`) sudah mendukung
  rotasi: `input.api_key = Some(k)` menimpa secret di OS store dengan
  `credential_reference` yang sama (atau membuat baru bila belum ada),
  `updated_at` di-refresh, history/model tidak tersentuh. Tidak perlu
  perubahan Rust.
- Usulan commit saat implementasi selesai (satu baris, tanpa trailer):
  `feat: add provider api key rotation`
- Handoff memori terkait: `.memory/2026-09-30/211200-about-export-import-backup.md`
  (konteks fitur backup; rotate melengkapi alur import yang providernya
  tanpa kredensial).

---

## Handoff Checklist (untuk model pelaksana kecil)
- [ ] Kerjakan Langkah 1 dulu sampai 3 test barunya hijau; baru lanjut Langkah 2.
- [ ] Bentuk invoke HARUS persis `{ id, input: { api_key } }` — jangan camelCase
  di dalam `input`, jangan tambah field lain ke `input`.
- [ ] Hanya ubah file yang terdaftar di tiap langkah; selain itu dilarang
  (terutama `src-tauri/**`, `crates/**`, `packages/api-types/**`).
- [ ] Jangan tambah dependency npm/cargo, capability, atau migrasi DB.
- [ ] Jangan menampilkan key saat ini dalam bentuk apa pun (tidak ada IPC yang
  mengembalikannya; jangan buat IPC baru).
- [ ] Setiap langkah selesai -> jalankan command verifikasi langkah itu; lanjut
  hanya jika hijau.
- [ ] Akhiri dengan Langkah 3 penuh (4 command + 7 cek manual) + centang
  Tasks di file plan ini.
