import { ValidationError } from '../errors.js';
import { err, ok, type Result } from '../result.js';

/**
 * A half-open-agnostic time interval in milliseconds. `startMs <= endMs`.
 *
 * Inclusivity is decided by the *consumer*: `contains` here is inclusive on both
 * ends, but the timeline cursor deliberately applies its own comparisons to
 * preserve the exact semantics ported from FlyleafLib's `SubManager`.
 */
export interface TimeRange {
  readonly startMs: number;
  readonly endMs: number;
}

export const createTimeRange = (
  startMs: number,
  endMs: number,
): Result<TimeRange, ValidationError> => {
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    return err(new ValidationError('TimeRange bounds must be finite numbers'));
  }
  if (startMs < 0) {
    return err(new ValidationError(`TimeRange.startMs must be >= 0 (got ${startMs})`));
  }
  if (endMs < startMs) {
    return err(
      new ValidationError(
        `TimeRange.endMs (${endMs}) must be >= startMs (${startMs})`,
      ),
    );
  }
  return ok({ startMs, endMs });
};

export const durationMs = (range: TimeRange): number =>
  range.endMs - range.startMs;

/** Inclusive on both ends: `start <= t <= end`. */
export const contains = (range: TimeRange, timeMs: number): boolean =>
  range.startMs <= timeMs && timeMs <= range.endMs;

export const overlaps = (a: TimeRange, b: TimeRange): boolean =>
  a.startMs <= b.endMs && b.startMs <= a.endMs;
