# Inference Chat Studio

[![CI](https://github.com/alamaby/inference-chat-studio/actions/workflows/ci-windows.yml/badge.svg)](https://github.com/alamaby/inference-chat-studio/actions/workflows/ci-windows.yml)
[![Release](https://img.shields.io/github/v/release/alamaby/inference-chat-studio)](https://github.com/alamaby/inference-chat-studio/releases)
[![Platform](https://img.shields.io/badge/platform-Windows-blue.svg)](https://github.com/alamaby/inference-chat-studio/releases)
[![Rust](https://img.shields.io/badge/Rust-1.77+-orange.svg)](https://www.rust-lang.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6+-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

A desktop chat application for interacting with OpenAI-compatible inference endpoints. Built with **Tauri** (Rust backend + React frontend), designed for local/private LLM deployments.

---

## Features

- **Multi-provider support** — Add and manage multiple OpenAI-compatible endpoints
- **Streaming chat** — Real-time token streaming with TTFT and duration metrics
- **Model browser** — Auto-fetch available models from any provider
- **Bookmarks** — Save and quickly navigate to important messages
- **Chat history** — Persistent local storage with search and filtering
- **Export/Import** — Backup and restore providers, models, conversations, and bookmarks
- **API key rotation** — Rotate keys without losing chat history
- **Connection inspector** — Detailed request/response inspection for debugging
- **Dark mode** — Full dark theme support
- **Offline-first** — Works fully offline against local servers

---

## Requirements

| Component | Version |
|-----------|---------|
| Windows | 10 (build 17763) or newer, 64-bit |
| WebView2 | Runtime (auto-installed by NSIS installer) |
| Rust | 1.77+ |
| Node.js | 22+ |
| pnpm | 10.34.5+ |

---

## Quick Start

### Option 1: Download Release (Recommended)

1. Go to [Releases](https://github.com/alamaby/inference-chat-studio/releases)
2. Download the latest `Inference Chat Studio_*_x64-setup.exe`
3. Run the installer (no admin required)
4. Launch from Start Menu

> **Note:** Windows SmartScreen will show an "Unknown publisher" warning. This is expected for the unsigned build. Click **More info → Run anyway**.

### Option 2: Build from Source

```bash
# Clone
git clone https://github.com/alamaby/inference-chat-studio.git
cd inference-chat-studio

# Install dependencies
pnpm install --frozen-lockfile

# Build
cd src-tauri
cargo tauri build --bundles nsis
```

Installer output: `src-tauri/target/release/bundle/nsis/`

### Option 3: Development

```bash
# Install dependencies
pnpm install --frozen-lockfile

# Run dev server
cargo tauri dev
```

---

## Usage

### Adding a Provider

1. Open the **Providers** panel
2. Fill in:
   - **Name**: e.g., `Local`
   - **Base URL**: e.g., `http://127.0.0.1:8000/v1`
   - **API Key**: your key
3. Click **Add provider**
4. Click **Test connection** to verify

### Sending a Chat Message

1. Select a provider and model from the dropdowns
2. Type your message in the composer
3. Press **Enter** or click **Send**
4. View streaming response with inspector metrics

### Managing API Keys

- **Rotate key**: Click **Rotate key** on any provider, enter new key, save
- **Delete provider**: Click **Delete** (chat history is preserved)

### Export/Import Backup

- **Export**: Settings → Data Backup → Export (downloads `ics-backup-v1.json`)
- **Import**: Settings → Data Backup → Import (merge-only, new IDs assigned)

> **Note:** API keys are never exported. Re-enter keys after import.

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    React Frontend                    │
│  ┌─────────┐ ┌──────────┐ ┌──────────┐ ┌─────────┐ │
│  │ Provider│ │   Chat   │ │ Bookmark │ │ Settings│ │
│  │  Form   │ │   View   │ │   Rail   │ │  Panel  │ │
│  └────┬────┘ └────┬─────┘ └────┬─────┘ └────┬────┘ │
│       └───────────┴────────────┴─────────────┘      │
│                      Zustand Store                    │
└──────────────────────────┬──────────────────────────┘
                           │ Tauri IPC
┌──────────────────────────┴──────────────────────────┐
│                   Rust Backend (Tauri)               │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────┐ │
│  │  IPC Layer   │  │  App State   │  │  Commands  │ │
│  │   (ipc.rs)   │  │  (app.rs)    │  │  (cmd.rs)  │ │
│  └──────┬───────┘  └──────┬───────┘  └─────┬──────┘ │
│         └────────────────┴────────────────┘         │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────┐ │
│  │Conversation  │  │   Secret     │  │  Provider  │ │
│  │   Store      │  │   Store      │  │  Core      │ │
│  │ (SQLite)     │  │(Win Cred Mgr)│  │  (HTTP)    │ │
│  └──────────────┘  └──────────────┘  └────────────┘ │
└─────────────────────────────────────────────────────┘
```

### Project Structure

```
inference-chat-studio/
├── apps/
│   └── desktop/          # React frontend (Vite + Tailwind)
│       └── src/
│           ├── components/   # UI components
│           ├── stores/       # Zustand state management
│           ├── lib/          # Utilities and helpers
│           └── types/        # TypeScript types
├── crates/
│   ├── conversation-store/   # SQLite conversation persistence
│   ├── secret-store/         # OS credential manager abstraction
│   ├── provider-core/        # Provider trait definitions
│   └── provider-openai/      # OpenAI-compatible HTTP client
├── packages/
│   └── api-types/            # Shared TypeScript types
├── src-tauri/                # Tauri backend
│   ├── src/
│   │   ├── ipc.rs            # IPC command handlers
│   │   ├── app.rs            # Tauri app setup
│   │   └── cmd.rs            # Business logic commands
│   ├── Cargo.toml
│   └── tauri.conf.json
├── .github/workflows/        # CI/CD
├── Cargo.toml                # Workspace root
└── package.json              # pnpm workspace root
```

---

## Security

- **API keys** are stored in **Windows Credential Manager** (not in SQLite)
- **No telemetry** — the app does not phone home
- **Local-first** — all data stays on your machine
- **Prompts are sent** to the configured provider endpoint

Verify key storage:
```sql
SELECT credential_reference FROM providers;
-- Returns: keyring:provider:...:api_key (never the actual key)
```

---

## Development

### Prerequisites

- [Rust](https://rustup.rs/) (1.77+)
- [Node.js](https://nodejs.org/) (22+)
- [pnpm](https://pnpm.io/) (10.34.5+)
- [MSVC Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) (Windows)

### Common Commands

```bash
# Install dependencies
pnpm install --frozen-lockfile

# Typecheck
pnpm --filter inference-chat-studio-desktop typecheck

# Run tests (frontend)
pnpm --filter inference-chat-studio-desktop test

# Run tests (Rust)
cargo test --workspace

# Lint
cargo clippy -- -D warnings

# Build frontend
pnpm --filter inference-chat-studio-desktop build

# Dev mode
cargo tauri dev
```

### Project Configuration

| File | Purpose |
|------|---------|
| `src-tauri/tauri.conf.json` | Tauri app config, bundle settings |
| `src-tauri/Cargo.toml` | Rust dependencies |
| `apps/desktop/package.json` | Frontend dependencies |
| `Cargo.toml` | Rust workspace root |
| `package.json` | pnpm workspace root |

---

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'feat: add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## License

This project is licensed under the MIT License — see [LICENSE](LICENSE) for details.

---

## Acknowledgments

- [Tauri](https://tauri.app/) — Desktop app framework
- [React](https://react.dev/) — UI library
- [Zustand](https://zustand-demo.pmnd.rs/) — State management
- [Tailwind CSS](https://tailwindcss.com/) — Styling
- [Vite](https://vitejs.dev/) — Build tool
