import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PLAYER_PREFS,
  MAX_SPEED,
  MIN_SPEED,
  createPlayerPreferences,
  isSubtitleMode,
  normalizePrefs,
  normalizeSpeed,
  type PlayerPrefsData,
  type PlayerPrefsStore,
} from './player-prefs.js';

// player-prefs holds the learner's default subtitle mode + playback speed. These
// tests pin the pure guards (mode/speed validation) and the store controller's
// fallback-on-read / normalize-on-write / persist round-trip behaviour, so a
// corrupt persisted value can never break playback.

/** In-memory store + a peek at the persisted bytes, for round-trip assertions. */
const makeStore = (initial: Partial<PlayerPrefsData> = {}) => {
  let data: Partial<PlayerPrefsData> = { ...initial };
  const store: PlayerPrefsStore = {
    load: async () => data,
    save: async (d) => {
      data = { ...d };
    },
  };
  return { store, peek: () => data };
};

describe('isSubtitleMode (pure)', () => {
  it('accepts the three known modes', () => {
    expect(isSubtitleMode('overlay')).toBe(true);
    expect(isSubtitleMode('list')).toBe(true);
    expect(isSubtitleMode('fullscreen')).toBe(true);
  });

  it('rejects anything else', () => {
    expect(isSubtitleMode('off')).toBe(false);
    expect(isSubtitleMode('')).toBe(false);
    expect(isSubtitleMode(undefined)).toBe(false);
    expect(isSubtitleMode(1)).toBe(false);
  });
});

describe('normalizeSpeed (pure)', () => {
  it('passes through in-range values', () => {
    expect(normalizeSpeed(1)).toBe(1);
    expect(normalizeSpeed(1.5)).toBe(1.5);
  });

  it('clamps to the [MIN_SPEED, MAX_SPEED] band', () => {
    expect(normalizeSpeed(0.1)).toBe(MIN_SPEED);
    expect(normalizeSpeed(9)).toBe(MAX_SPEED);
  });

  it('falls back to the default for non-finite / non-number input', () => {
    expect(normalizeSpeed(Number.NaN)).toBe(DEFAULT_PLAYER_PREFS.speed);
    expect(normalizeSpeed(Number.POSITIVE_INFINITY)).toBe(DEFAULT_PLAYER_PREFS.speed);
    expect(normalizeSpeed('fast' as unknown)).toBe(DEFAULT_PLAYER_PREFS.speed);
  });
});

describe('normalizePrefs (pure)', () => {
  it('fills defaults for an empty record', () => {
    expect(normalizePrefs(undefined)).toEqual(DEFAULT_PLAYER_PREFS);
    expect(normalizePrefs({})).toEqual(DEFAULT_PLAYER_PREFS);
  });

  it('sanitizes each field independently', () => {
    expect(
      normalizePrefs({ subtitleMode: 'bogus' as never, speed: 99 }),
    ).toEqual({ subtitleMode: DEFAULT_PLAYER_PREFS.subtitleMode, speed: MAX_SPEED });
    expect(normalizePrefs({ subtitleMode: 'overlay', speed: 1.25 })).toEqual({
      subtitleMode: 'overlay',
      speed: 1.25,
    });
  });
});

describe('createPlayerPreferences', () => {
  it('get() returns defaults when nothing is persisted', async () => {
    const { store } = makeStore();
    const prefs = createPlayerPreferences({ store });
    expect(await prefs.get()).toEqual(DEFAULT_PLAYER_PREFS);
  });

  it('setSubtitleMode persists and returns the full prefs', async () => {
    const { store, peek } = makeStore();
    const prefs = createPlayerPreferences({ store });
    const next = await prefs.setSubtitleMode('fullscreen');
    expect(next).toEqual({ subtitleMode: 'fullscreen', speed: 1 });
    expect(peek()).toEqual(next);
  });

  it('setSpeed normalizes before persisting', async () => {
    const { store, peek } = makeStore({ subtitleMode: 'overlay' });
    const prefs = createPlayerPreferences({ store });
    const next = await prefs.setSpeed(5);
    expect(next).toEqual({ subtitleMode: 'overlay', speed: MAX_SPEED });
    expect(peek()).toEqual(next);
  });

  it('survives a reload over the same store', async () => {
    const { store } = makeStore();
    await createPlayerPreferences({ store }).setSubtitleMode('overlay');
    const reopened = createPlayerPreferences({ store });
    expect((await reopened.get()).subtitleMode).toBe('overlay');
  });
});
