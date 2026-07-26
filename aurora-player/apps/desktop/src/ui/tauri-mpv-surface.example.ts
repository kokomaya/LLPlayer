//
// ⚠️  ON-DEVICE REFERENCE BINDING — NOT COMPILED / TESTED / LINTED IN CI. ⚠️
//
// This file is intentionally excluded from the project graph:
//   • tsconfig.json `exclude` lists `src/**/*.example.ts`
//   • eslint.config.mjs ignores `**/*.example.ts`
//   • vitest coverage excludes `src/**/*.example.*`
// because `@tauri-apps/api` is NOT installed in this repo (it is a device/
// toolchain dependency). To run on a machine, follow README.md: install the
// Tauri deps, then drop the `.example` segment from this filename.
//
// It is the THIN native leaf of the ports-&-adapters design (plan/04): all it
// does is bridge Tauri IPC (`invoke` for commands, `listen` for mpv events) to
// the pure `DesktopVideoSurface` port. Zero playback/subtitle logic lives here —
// that all sits in the Node-tested `MpvPlayer` core. The Rust side that answers
// these `invoke`s and emits these events is sketched in `src-tauri/`.
//
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type {
  DesktopVideoCallbacks,
  DesktopVideoSurface,
  EndFileReason,
  UnbindDesktopCallbacks,
} from '../adapters/desktop-video-surface.js';

/**
 * Build a {@link DesktopVideoSurface} backed by the Rust/libmpv side over Tauri
 * IPC. libmpv reports/accepts times in SECONDS, which is exactly what the port
 * declares — so no unit conversion happens here; the adapter core owns the
 * seconds↔ms boundary.
 */
export const createTauriMpvSurface = (): DesktopVideoSurface => ({
  commands: {
    loadFile: (uri) => void invoke('mpv_load_file', { uri }),
    setPaused: (paused) => void invoke('mpv_set_paused', { paused }),
    seekAbsolute: (positionSec) => void invoke('mpv_seek_absolute', { positionSec }),
    setSpeed: (rate) => void invoke('mpv_set_speed', { rate }),
    destroy: () => void invoke('mpv_destroy'),
  },
  bind: (callbacks: DesktopVideoCallbacks): UnbindDesktopCallbacks => {
    const unlisten: Promise<UnlistenFn>[] = [
      listen<{ durationSec: number; positionSec?: number }>('mpv:file-loaded', (e) =>
        callbacks.onFileLoaded(e.payload),
      ),
      listen<{ positionSec: number }>('mpv:time-pos', (e) =>
        callbacks.onTimePos(e.payload),
      ),
      listen<{ positionSec: number }>('mpv:seek-finished', (e) =>
        callbacks.onSeekFinished(e.payload),
      ),
      listen<{ reason: EndFileReason; error?: string }>('mpv:end-file', (e) =>
        callbacks.onEndFile(e.payload),
      ),
    ];
    return () => {
      for (const p of unlisten) {
        void p.then((off) => off());
      }
    };
  },
});
