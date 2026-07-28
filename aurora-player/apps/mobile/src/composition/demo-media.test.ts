import { describe, expect, it } from 'vitest';
import {
  SUBTITLE_EXTENSIONS,
  isWordLevelSubtitle,
  pickBestSubtitle,
  subtitleCandidates,
} from './demo-media.js';

describe('subtitleCandidates', () => {
  it('lists every known extension for the base, richest first', () => {
    expect(subtitleCandidates('sintel')).toEqual([
      'sintel.whisperx.json',
      'sintel.whisper.json',
      'sintel.ass',
      'sintel.srt',
      'sintel.vtt',
      'sintel.lrc',
    ]);
  });

  it('covers the full extension table', () => {
    expect(subtitleCandidates('x')).toHaveLength(SUBTITLE_EXTENSIONS.length);
  });
});

describe('pickBestSubtitle', () => {
  it('returns null when no known subtitle is present', () => {
    expect(pickBestSubtitle(['sintel.mp4', 'notes.txt'])).toBeNull();
    expect(pickBestSubtitle([])).toBeNull();
  });

  it('prefers WhisperX over every line-level format', () => {
    expect(
      pickBestSubtitle(['sintel.srt', 'sintel.vtt', 'sintel.whisperx.json']),
    ).toBe('sintel.whisperx.json');
  });

  it('prefers Whisper JSON over ass/srt/vtt/lrc when no WhisperX exists', () => {
    expect(pickBestSubtitle(['sintel.lrc', 'sintel.srt', 'sintel.whisper.json'])).toBe(
      'sintel.whisper.json',
    );
  });

  it('falls back down the ranking: ass > srt > vtt > lrc', () => {
    expect(pickBestSubtitle(['sintel.lrc', 'sintel.vtt', 'sintel.srt', 'sintel.ass'])).toBe(
      'sintel.ass',
    );
    expect(pickBestSubtitle(['sintel.lrc', 'sintel.vtt'])).toBe('sintel.vtt');
    expect(pickBestSubtitle(['sintel.lrc'])).toBe('sintel.lrc');
  });

  it('matches case-insensitively but returns the original filename', () => {
    expect(pickBestSubtitle(['SINTEL.SRT'])).toBe('SINTEL.SRT');
    expect(pickBestSubtitle(['Clip.WhisperX.Json', 'Clip.srt'])).toBe('Clip.WhisperX.Json');
  });

  it('does not confuse .whisper.json with .whisperx.json ranking', () => {
    // A plain whisper.json ends with `.whisper.json` but NOT `.whisperx.json`.
    expect(pickBestSubtitle(['a.whisper.json'])).toBe('a.whisper.json');
  });
});

describe('isWordLevelSubtitle', () => {
  it('is true for WhisperX and Whisper JSON', () => {
    expect(isWordLevelSubtitle('sintel.whisperx.json')).toBe(true);
    expect(isWordLevelSubtitle('sintel.whisper.json')).toBe(true);
    expect(isWordLevelSubtitle('SINTEL.WHISPERX.JSON')).toBe(true);
  });

  it('is false for line-level formats', () => {
    expect(isWordLevelSubtitle('sintel.srt')).toBe(false);
    expect(isWordLevelSubtitle('sintel.vtt')).toBe(false);
    expect(isWordLevelSubtitle('sintel.ass')).toBe(false);
    expect(isWordLevelSubtitle('sintel.lrc')).toBe(false);
  });
});
