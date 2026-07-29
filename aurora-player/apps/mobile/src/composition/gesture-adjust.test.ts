import { describe, expect, it } from 'vitest';
import { nextLevel } from './gesture-adjust.js';

// nextLevel maps a vertical drag (up = increase) over a pane of height trackPx
// onto a new 0..1 level. These tests pin the direction, the proportional scale,
// clamping at both ends, and the degenerate zero-height / non-finite guards.

describe('nextLevel', () => {
  it('increases when dragging up (positive dragUpPx)', () => {
    // half a 200px pane upward from 0 → +0.5
    expect(nextLevel(0, 100, 200)).toBeCloseTo(0.5);
  });

  it('decreases when dragging down (negative dragUpPx)', () => {
    expect(nextLevel(0.8, -80, 200)).toBeCloseTo(0.4);
  });

  it('scales proportionally to the track height', () => {
    // same pixel drag over a shorter pane moves further
    expect(nextLevel(0, 50, 100)).toBeCloseTo(0.5);
    expect(nextLevel(0, 50, 500)).toBeCloseTo(0.1);
  });

  it('clamps at the top and bottom', () => {
    expect(nextLevel(0.9, 1000, 200)).toBe(1);
    expect(nextLevel(0.1, -1000, 200)).toBe(0);
  });

  it('returns the (clamped) current level for a zero/negative track', () => {
    expect(nextLevel(0.4, 120, 0)).toBe(0.4);
    expect(nextLevel(0.4, 120, -10)).toBe(0.4);
  });

  it('guards against non-finite inputs', () => {
    expect(nextLevel(0.4, Number.NaN, 200)).toBe(0.4);
    expect(nextLevel(0.4, 50, Number.POSITIVE_INFINITY)).toBe(0.4);
    expect(nextLevel(Number.NaN, 50, 200)).toBeCloseTo(0.25);
  });
});
