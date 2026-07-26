/**
 * Text cleanup ported from FlyleafLib `SubtitleTextUtil.FlattenText`
 * (semantic port, not a code translation — see plan/06 §1). Operates on UTF-16
 * code units, exactly like the original C# `char`-based scan, so behaviour is
 * identical for the ported test corpus.
 *
 * Rules:
 *  - No newlines -> returned unchanged.
 *  - If *every* non-empty line starts with the same dash character -> treated as
 *    a dialogue list and returned unchanged.
 *  - Otherwise, in "list mode" each dash line starts a new line and
 *    continuation lines are joined with a space; in default mode every run of
 *    newlines collapses to a single space.
 */
const DASH_CHARS = new Set([
  '-',
  '⁃', // ⁃ hyphen bullet
  '‐', // ‐ hyphen
  '‒', // ‒ figure dash
  '–', // – en dash
  '—', // — em dash
  '―', // ― horizontal bar
  '−', // − minus sign
]);

const isDash = (c: string | undefined): boolean =>
  c !== undefined && DASH_CHARS.has(c);

export const flattenText = (text: string): string => {
  if (!text.includes('\n') && !text.includes('\r')) {
    return text;
  }

  const length = text.length;
  const startDash = length > 0 && isDash(text[0]);

  if (startDash) {
    const dashChar = text[0]!;

    // Pass 1: are all non-empty lines led by the same dash char?
    let allDash = true;
    let atLineStart = true;
    for (let i = 0; i < length; i++) {
      const ch = text[i]!;
      if (atLineStart) {
        if (ch === '\r' || ch === '\n') {
          continue; // skip empty lines
        }
        if (ch !== dashChar) {
          allDash = false;
          break;
        }
        atLineStart = false;
      } else if (ch === '\r') {
        if (i + 1 < length && text[i + 1] === '\n') {
          i++;
        }
        atLineStart = true;
      } else if (ch === '\n') {
        atLineStart = true;
      }
    }

    if (allDash) {
      return text;
    }

    // Pass 2: list mode.
    let sb = '';
    let firstItem = true;
    let i = 0;
    while (i < length) {
      const ch = text[i]!;
      if (ch === dashChar) {
        if (!firstItem) {
          sb += '\n';
        }
        const start = i;
        while (i < length && text[i] !== '\r' && text[i] !== '\n') {
          i++;
        }
        sb += text.slice(start, i);
        firstItem = false;
        continue;
      }
      if (ch === '\r' || ch === '\n') {
        i++;
        continue;
      }
      const start = i;
      while (i < length && text[i] !== '\r' && text[i] !== '\n') {
        i++;
      }
      sb += ' ' + text.slice(start, i);
    }
    return sb;
  }

  // Default mode: collapse each run of newlines into a single space.
  let out = '';
  let lastWasNewline = false;
  for (let i = 0; i < length; i++) {
    const c = text[i]!;
    if (c === '\r' || c === '\n') {
      if (!lastWasNewline) {
        out += ' ';
        lastWasNewline = true;
      }
    } else {
      out += c;
      lastWasNewline = false;
    }
  }
  return out;
};
