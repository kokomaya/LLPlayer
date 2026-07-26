import type { TimedLine } from './model.js';

/**
 * Binary search over start-sorted lines, matching the contract of .NET's
 * `List<T>.BinarySearch` (as used by FlyleafLib's `SubtitleTimeStartComparer`):
 *
 * - returns the index of a line whose `startMs` equals `timeMs`, if any;
 * - otherwise returns the bitwise complement (`~`) of the *insertion point*
 *   (the index of the first line with a greater start, or `length` if none).
 *
 * The complement encoding is what lets the caller distinguish "exact hit" from
 * "would insert here" and recover the insertion point via `~ret`.
 */
export const locateByStart = (
  lines: readonly TimedLine[],
  timeMs: number,
): number => {
  let lo = 0;
  let hi = lines.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    const start = lines[mid]!.range.startMs;
    if (start === timeMs) {
      return mid;
    }
    if (start < timeMs) {
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return ~lo;
};
