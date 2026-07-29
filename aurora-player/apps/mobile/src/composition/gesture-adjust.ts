// Pure math for the vertical volume/brightness drag gestures (Epic ② player
// operations). The device PanResponder reports a pixel delta over a pane of a
// given height; this maps it to a new 0..1 level. Kept in core (no react-native)
// so the clamping/scaling is unit-tested and both gestures share one rule.

/**
 * Compute the next 0..1 level after a vertical drag.
 *
 * @param current  the level before the drag, expected in `[0, 1]`.
 * @param dragUpPx how far the finger moved **upward**, in pixels (up = louder /
 *                 brighter). Callers pass `-dy` since screen `dy` is positive
 *                 downward.
 * @param trackPx  the pane height mapped to the full 0→1 range. A full-height
 *                 swipe therefore covers the entire range.
 *
 * The result is clamped to `[0, 1]`. If `trackPx <= 0` (or non-finite) the
 * gesture has no scale, so `current` is returned unchanged (also clamped).
 */
export const nextLevel = (
  current: number,
  dragUpPx: number,
  trackPx: number,
): number => {
  const base = clamp01(current);
  if (!Number.isFinite(trackPx) || trackPx <= 0 || !Number.isFinite(dragUpPx)) {
    return base;
  }
  return clamp01(base + dragUpPx / trackPx);
};

/** Clamp any number into `[0, 1]`; non-finite input collapses to 0. */
const clamp01 = (n: number): number => {
  if (!Number.isFinite(n)) {
    return 0;
  }
  return Math.min(1, Math.max(0, n));
};
