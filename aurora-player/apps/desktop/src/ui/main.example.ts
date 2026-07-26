//
// ⚠️  ON-DEVICE REFERENCE BOOTSTRAP — NOT COMPILED / TESTED / LINTED IN CI. ⚠️
//
// The desktop entry point, assembled the same way the mobile `<VideoScreen>` is:
// build the platform surface, hand it to the pure composition root, and paint
// the overlay from the presenter's view-state. Everything of substance is in
// the Node-tested core; this file is just glue.
//
import type { MediaSource } from '@aurora/player-api';
import type { SubtitleDocument } from '@aurora/subtitle';
import { createDesktopRuntime } from '../index.js';
import { createTauriMpvSurface } from './tauri-mpv-surface.example.js';
import { renderSubtitleOverlay } from './subtitle-overlay-view.example.js';

/** Mount the player + overlay into `overlayRoot` and start playback. */
export const startDesktopPlayer = (opts: {
  readonly media: MediaSource;
  readonly document: SubtitleDocument;
  readonly overlayRoot: HTMLElement;
}): (() => void) => {
  const surface = createTauriMpvSurface();
  const runtime = createDesktopRuntime({
    surface,
    media: opts.media,
    document: opts.document,
  });
  const off = runtime.presenter.onChange((s) => renderSubtitleOverlay(opts.overlayRoot, s));
  void runtime.open().then(() => runtime.player.play());
  return () => {
    off();
    runtime.dispose();
  };
};
