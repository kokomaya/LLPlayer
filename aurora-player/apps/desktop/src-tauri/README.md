# `src-tauri/` — desktop native shell (reference, not in CI)

This directory holds the Rust/Tauri half of the desktop app. It is **not built by
the monorepo CI** (no Rust toolchain, no libmpv, no `@tauri-apps/*` in this repo)
— it is the on-device counterpart to the pure TypeScript core that CI *does* test.

- `src/lib.example.rs` — reference `#[tauri::command]`s + mpv event mapping. It
  implements the Rust side of the `DesktopVideoSurface` seam. The TypeScript port
  (`../src/adapters/desktop-video-surface.ts`) is the contract; the Node test
  against `FakeDesktopVideoSurface` is its executable spec.

To ship on a machine (see `../README.md` for the full flow): add `tauri.conf.json`,
`Cargo.toml`, a libmpv binding crate, and `main.rs`; rename `lib.example.rs` →
`lib.rs`; then `pnpm tauri dev`.

> Never commit signing keys / API keys here — use local env vars or untracked
> files (repo rule §E).
