# Inference Chat Studio — Manual Install (MVP-0, Windows)

> MVP build: **unsigned**, **manual install**, **no auto-update**.
> Windows SmartScreen will show an "Unknown publisher" warning. This is
> expected for the unsigned MVP. Click **More info → Run anyway** on test
> machines only.

## Requirements

- Windows 10 version 1809 (build 17763) or newer, 64-bit.
- **Internet access once during installation.** The NSIS installer uses the
  WebView2 `embedBootstrapper`: a small bootstrapper is bundled and downloads
  the WebView2 Runtime on first install. After installation the app works
  fully offline against local servers (`http://127.0.0.1:8000/v1`) or your
  internal gateway.
- If the WebView2 download is blocked (office proxy / GPO), the installer
  shows an error instead of failing silently. Install the runtime manually
  from the official Microsoft WebView2 page, then re-run the installer.

## Install

1. Build the installer (from the repo root, with Rust + MSVC Build Tools + Node):
   `apps/desktop/node_modules/.bin/tauri build --bundles nsis`
   (run with cwd `src-tauri/`; the wrapper resolves the workspace root via cargo metadata)
2. The installer lands in `target/release/bundle/nsis/`
   (`Inference Chat Studio_0.1.0_x64-setup.exe`, ~5 MB — small because the
   WebView2 Runtime downloads at install time via `embedBootstrapper`).
3. Run it as a normal user — **no admin/UAC required**
   (`installMode: currentUser`, per-user install).
4. Launch *Inference Chat Studio* from the Start Menu.

## First run checklist

1. Add provider: name `Local`, base URL `http://127.0.0.1:8000/v1`, API key
   `local-key` (or your real key for cloud endpoints).
2. **Test connection** → expect `Connected` (or `Unauthorized` for a bad key,
   `Connection Failed` when the server is down).
3. **Refresh Models** → model dropdown fills; with the server offline the
   last cached list is still shown.
4. Send one chat message → streaming placeholder → assistant reply +
   inspector (TTFT, duration, usage when the provider returns it).
5. Close and reopen the app → providers, models, and history persist.

## Data & privacy

- Local database: per-user app data directory
  (`%APPDATA%/com.alamaby.inference-chat-studio/` or the Tauri `appDataDir`).
- API keys live in **Windows Credential Manager** under the service
  `com.alamaby.inference-chat-studio` — never in the SQLite file.
  Verify: `SELECT credential_reference FROM providers;` only shows
  `keyring:provider:…:api_key` strings, never secrets.
- Prompts **are** sent to the configured provider. Only the history and
  configuration stay local.

## Uninstall

Remove via *Settings → Apps* (per-user, no admin needed). The local data
directory may remain; delete it manually for a clean slate.
