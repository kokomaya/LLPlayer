// Headless "default subtitle mode + default playback speed" preferences (Epic ③
// settings). Mirrors `recent-sources.ts`: the list/normalization logic is pure,
// and persistence is an injected port so this core never touches the filesystem.
// No clock is needed — preferences are static values, not events — so there is
// no `Date.now()` here either (rule ①: no wall clock in core).

import type { SubtitleDisplayMode } from '@aurora/presentation';

/** The learner's persisted playback defaults, applied when a video first opens. */
export interface PlayerPrefsData {
  /** Subtitle surface to start in (`overlay` | `list` | `fullscreen`). */
  readonly subtitleMode: SubtitleDisplayMode;
  /** Playback rate, always within [{@link MIN_SPEED}, {@link MAX_SPEED}]. */
  readonly speed: number;
}

/** Bounds for the playback rate; writes outside are clamped by {@link normalizeSpeed}. */
export const MIN_SPEED = 0.5;
export const MAX_SPEED = 2;

/** Factory defaults used when nothing is persisted (or a field is missing/invalid). */
export const DEFAULT_PLAYER_PREFS: PlayerPrefsData = {
  subtitleMode: 'list',
  speed: 1,
};

/** The three surfaces the subtitle presenter understands (kept in sync with `SubtitleDisplayMode`). */
const SUBTITLE_MODES: readonly SubtitleDisplayMode[] = [
  'overlay',
  'list',
  'fullscreen',
];

// ── Pure validation/normalization (exported for direct unit testing) ────────

/** Type guard: is `v` one of the known subtitle display modes? */
export const isSubtitleMode = (v: unknown): v is SubtitleDisplayMode =>
  typeof v === 'string' &&
  (SUBTITLE_MODES as readonly string[]).includes(v);

/**
 * Coerce any input into a legal playback rate: finite numbers are clamped to
 * `[MIN_SPEED, MAX_SPEED]`; anything else (NaN, non-number) falls back to the
 * default speed. So a corrupt persisted value can never break playback.
 */
export const normalizeSpeed = (n: unknown): number => {
  if (typeof n !== 'number' || !Number.isFinite(n)) {
    return DEFAULT_PLAYER_PREFS.speed;
  }
  return Math.min(MAX_SPEED, Math.max(MIN_SPEED, n));
};

/** Merge a possibly-partial/corrupt persisted record onto the defaults, field-validated. */
export const normalizePrefs = (
  raw: Partial<PlayerPrefsData> | undefined,
): PlayerPrefsData => ({
  subtitleMode: isSubtitleMode(raw?.subtitleMode)
    ? raw.subtitleMode
    : DEFAULT_PLAYER_PREFS.subtitleMode,
  speed: raw?.speed === undefined ? DEFAULT_PLAYER_PREFS.speed : normalizeSpeed(raw.speed),
});

// ── Controller over the store ──────────────────────────────────────────────

/** Persistence port — device wires this to an `expo-file-system` JSON file. */
export interface PlayerPrefsStore {
  /** Load whatever is persisted; may be partial or empty on first run. */
  load(): Promise<Partial<PlayerPrefsData>>;
  save(data: PlayerPrefsData): Promise<void>;
}

export interface PlayerPrefsDeps {
  readonly store: PlayerPrefsStore;
}

/** Default subtitle-mode / playback-speed preferences, backed by the store. */
export interface PlayerPreferences {
  /** Current defaults, with the factory defaults filled in for anything missing. */
  get(): Promise<PlayerPrefsData>;
  /** Persist a new default subtitle mode; returns the full updated prefs. */
  setSubtitleMode(mode: SubtitleDisplayMode): Promise<PlayerPrefsData>;
  /** Persist a new default speed (clamped/normalized); returns the full updated prefs. */
  setSpeed(speed: number): Promise<PlayerPrefsData>;
}

/**
 * Build a {@link PlayerPreferences} over an injected {@link PlayerPrefsStore}.
 * Reads always fall back to {@link DEFAULT_PLAYER_PREFS}; writes normalize the
 * changed field, persist the whole record, and return it so callers can render
 * without a reload.
 */
export const createPlayerPreferences = (
  deps: PlayerPrefsDeps,
): PlayerPreferences => {
  const { store } = deps;

  const current = async (): Promise<PlayerPrefsData> =>
    normalizePrefs(await store.load());

  const write = async (next: PlayerPrefsData): Promise<PlayerPrefsData> => {
    await store.save(next);
    return next;
  };

  return {
    get: current,
    setSubtitleMode: async (mode) =>
      write({ ...(await current()), subtitleMode: mode }),
    setSpeed: async (speed) =>
      write({ ...(await current()), speed: normalizeSpeed(speed) }),
  };
};
