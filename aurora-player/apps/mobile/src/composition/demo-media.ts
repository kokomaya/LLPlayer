// Pure helpers for the on-device demo (plan/05 — no platform, no I/O here). When
// a real clip is copied onto the device (see scripts/fetch-demo-media.ps1), it
// may sit next to several subtitle files — a hand-written `.srt`, an exported
// `.vtt`, and/or a WhisperX word-level `.json`. The word-level formats are what
// exercise the learning features (逐词点跳 / 词级步进); a line-only format makes
// the player interpolate words (`estimated`). So the demo shell should always
// prefer the richest track present. That choice is pure logic → it lives here,
// Node-tested, and the CI-excluded `App.tsx` just calls it after listing the
// device dir. No file reading happens here — the shell supplies the filenames.

/**
 * Subtitle file extensions the demo recognises, richest first. WhisperX carries
 * real per-word timings, plain Whisper JSON usually carries per-word too, then
 * the line-level text formats. `pickBestSubtitle` walks this order.
 */
export const SUBTITLE_EXTENSIONS: readonly string[] = [
  '.whisperx.json',
  '.whisper.json',
  '.ass',
  '.srt',
  '.vtt',
  '.lrc',
];

/**
 * Build the candidate subtitle filenames for a clip base name, richest first,
 * e.g. `subtitleCandidates('sintel')` →
 * `['sintel.whisperx.json', 'sintel.whisper.json', 'sintel.ass', …]`.
 * The shell probes the device files dir for these (in order) to find a track.
 */
export const subtitleCandidates = (base: string): string[] =>
  SUBTITLE_EXTENSIONS.map((ext) => `${base}${ext}`);

/**
 * Choose the best subtitle among the filenames actually present, preferring
 * word-level formats. Matching is by extension suffix, case-insensitive; a name
 * ending in an earlier {@link SUBTITLE_EXTENSIONS} entry wins. Returns the
 * original (un-lowercased) filename, or `null` when none match a known format.
 */
export const pickBestSubtitle = (
  filenames: readonly string[],
): string | null => {
  for (const ext of SUBTITLE_EXTENSIONS) {
    const match = filenames.find((name) => name.toLowerCase().endsWith(ext));
    if (match !== undefined) {
      return match;
    }
  }
  return null;
};

/**
 * Whether a subtitle filename is a word-level format (WhisperX / Whisper JSON).
 * The shell can use this to default portrait `list` mode to on (word-level makes
 * per-word tap-to-seek exact rather than interpolated).
 */
export const isWordLevelSubtitle = (filename: string): boolean => {
  const lower = filename.toLowerCase();
  return lower.endsWith('.whisperx.json') || lower.endsWith('.whisper.json');
};
