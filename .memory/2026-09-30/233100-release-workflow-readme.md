# Release Workflow + README Overhaul

Date: 2026-09-30 23:31:00
Commit: `101cd34 feat: add release workflow, README, and license`

## Task
1. GitHub Actions workflow untuk build Windows + create release saat tag `v*` di-push
2. README dirapikan agar GitHub-friendly dengan badge, rekomendasi tools

## Files changed
- `.github/workflows/release.yml` — new. Trigger: push tag `v*`. Steps: extract version, sync version ke Cargo.toml/tauri.conf.json/package.json, setup Rust+Node+pnpm, install, typecheck, test, clippy, build frontend, build Tauri NSIS, create GitHub Release (published) dengan installer sebagai asset.
- `README.md` — new (root, English). Badges: CI, Release, Platform, Rust, TypeScript, License. Sections: Features, Requirements, Quick Start (3 options), Usage, Architecture (ASCII diagram + project structure), Security, Development, Contributing, License, Acknowledgments.
- `LICENSE` — new (MIT, Copyright 2026 Alam Aby Bashit).
- `src-tauri/Cargo.toml` — removed `devtools` feature dari tauri dependency (perlu di-drop sebelum public release).

## Decisions
- Release trigger: tag `v*` (e.g. `v0.2.0`)
- Release type: published langsung (bukan draft)
- Version sync: auto-sync dari tag ke semua file version sebelum build
- README language: English
- License: MIT

## Verification
- `cargo clippy -- -D warnings` → clean
- `cargo test --workspace` → all passed
- `pnpm --filter inference-chat-studio-desktop typecheck` → clean
- `pnpm --filter inference-chat-studio-desktop test` → 59 passed

## Related
- `README-INSTALL.md` tetap ada, di-reference dari README utama
- CI workflow existing: `.github/workflows/ci-windows.yml`
