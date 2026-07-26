import { ValidationError } from '../errors.js';
import { err, ok, type Result } from '../result.js';

/**
 * Clock <-> milliseconds conversions shared by subtitle parsers and the CLI.
 *
 * Accepts both SRT (`HH:MM:SS,mmm`) and VTT (`HH:MM:SS.mmm` / `MM:SS.mmm`)
 * fractional separators, so a single parser serves both formats.
 */
const CLOCK_RE = /^(?:(\d+):)?(\d{1,2}):(\d{1,2})(?:[.,](\d{1,3}))?$/;

export const parseClock = (raw: string): Result<number, ValidationError> => {
  const match = CLOCK_RE.exec(raw.trim());
  if (!match) {
    return err(new ValidationError(`Invalid timestamp: "${raw}"`));
  }
  const [, hh, mm, ss, frac] = match;
  const hours = hh ? Number(hh) : 0;
  const minutes = Number(mm);
  const seconds = Number(ss);
  if (minutes > 59 || seconds > 59) {
    return err(new ValidationError(`Invalid timestamp components: "${raw}"`));
  }
  // Right-pad the fractional part so ".5" -> 500ms, ".05" -> 50ms.
  const millis = frac ? Number(frac.padEnd(3, '0')) : 0;
  return ok(((hours * 60 + minutes) * 60 + seconds) * 1000 + millis);
};

/** Formats ms as `HH:MM:SS,mmm` (SRT) by default, or `.` separator for VTT. */
export const formatClock = (
  totalMs: number,
  fractionSeparator: ',' | '.' = ',',
): string => {
  const clamped = Math.max(0, Math.round(totalMs));
  const ms = clamped % 1000;
  const totalSeconds = Math.floor(clamped / 1000);
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const hours = Math.floor(totalSeconds / 3600);
  const pad = (n: number, width = 2): string => String(n).padStart(width, '0');
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}${fractionSeparator}${pad(ms, 3)}`;
};
