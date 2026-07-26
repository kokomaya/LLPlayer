//
// ⚠️  ON-DEVICE REFERENCE BINDING — NOT COMPILED / TESTED / LINTED IN CI. ⚠️
//
// Excluded from the graph for the same reasons as tauri-mpv-surface.example.ts.
// This is a DUMB view (plan/04): it renders an {@link OverlayViewState} into a
// DOM node and contains no timing/subtitle logic — every sync decision was made
// by the Node-tested `SubtitleOverlayPresenter` in `@aurora/presentation`.
// Estimated (interpolated) words are rendered without the per-word highlight so
// users can tell real word timings from guessed ones — matching the mobile
// overlay exactly, because both read the same view-state.
//
import type { OverlayViewState } from '@aurora/presentation';

/** Paint an overlay view-state into `root`. Vanilla DOM — no framework needed. */
export const renderSubtitleOverlay = (
  root: HTMLElement,
  state: OverlayViewState | null,
): void => {
  if (state === null || state.line === null) {
    root.textContent = '';
    root.style.visibility = 'hidden';
    return;
  }
  root.style.visibility = 'visible';
  root.replaceChildren();

  if (state.word === null) {
    root.textContent = state.line;
    return;
  }
  // Render the whole line with only the active word emphasised.
  const span = document.createElement('span');
  span.textContent = state.word;
  span.className = state.estimated ? 'word word--estimated' : 'word word--real';
  root.append(span);
};
