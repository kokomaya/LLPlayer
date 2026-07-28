import { describe, expect, it } from 'vitest';
import { parseUrlSource, titleFromUrl } from './url-source.js';

describe('parseUrlSource · acceptance', () => {
  it('accepts an https video URL and normalizes to a uri SourceInput', () => {
    const result = parseUrlSource('https://cdn.example.com/media/lesson.mp4');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.input).toEqual({
      kind: 'uri',
      uri: 'https://cdn.example.com/media/lesson.mp4',
      title: 'lesson.mp4',
    });
    expect(result.hls).toBe(false);
  });

  it('trims surrounding whitespace before validating', () => {
    const result = parseUrlSource('   https://example.com/a.mp4  ');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.input.uri).toBe('https://example.com/a.mp4');
  });

  it('flags an HLS playlist and accepts streaming schemes', () => {
    const hls = parseUrlSource('https://example.com/live/stream.m3u8?token=x');
    expect(hls.ok && hls.hls).toBe(true);
    expect(parseUrlSource('rtmp://example.com/live/key').ok).toBe(true);
    expect(parseUrlSource('rtsp://example.com/stream').ok).toBe(true);
  });

  it('uses an explicit title over the derived one', () => {
    const result = parseUrlSource('https://example.com/x.mp4', '  My Clip  ');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.input.title).toBe('My Clip');
  });
});

describe('parseUrlSource · rejection', () => {
  it('rejects an empty / whitespace-only string', () => {
    expect(parseUrlSource('')).toEqual({ ok: false, reason: 'empty' });
    expect(parseUrlSource('   ')).toEqual({ ok: false, reason: 'empty' });
  });

  it('rejects a bare/local path (that comes from the file picker, not here)', () => {
    expect(parseUrlSource('C:\\videos\\clip.mp4')).toEqual({
      ok: false,
      reason: 'not-a-url',
    });
    expect(parseUrlSource('/data/media/clip.mp4')).toEqual({
      ok: false,
      reason: 'not-a-url',
    });
    expect(parseUrlSource('file:///data/clip.mp4')).toEqual({
      ok: false,
      reason: 'not-a-url',
    });
  });
});

describe('titleFromUrl', () => {
  it('takes the last path segment, decoded', () => {
    expect(titleFromUrl('https://example.com/a/b/My%20Clip.mp4')).toBe('My Clip.mp4');
  });

  it('ignores query and fragment', () => {
    expect(titleFromUrl('https://example.com/clip.mp4?t=1#top')).toBe('clip.mp4');
  });

  it('falls back to the host when there is no path segment', () => {
    expect(titleFromUrl('https://example.com')).toBe('example.com');
  });

  it('falls back to the trimmed input when there is nothing after the scheme', () => {
    expect(titleFromUrl('  https://  ')).toBe('https://');
  });

  it('returns the raw segment when it cannot be percent-decoded', () => {
    expect(titleFromUrl('https://example.com/bad%E0%A4.mp4')).toBe('bad%E0%A4.mp4');
  });
});
