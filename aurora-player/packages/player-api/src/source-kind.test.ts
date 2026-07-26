import { describe, expect, it } from 'vitest';
import { isHlsSource, isRemoteSource, sourceKind } from './source-kind.js';

describe('sourceKind', () => {
  it.each([
    ['http://example.com/clip.mp4', 'remote'],
    ['https://cdn.example.com/a/b.m3u8', 'remote'],
    ['HTTPS://CDN.EXAMPLE.COM/B.MP4', 'remote'],
    ['rtmp://live.example.com/app/stream', 'remote'],
    ['rtsp://cam.local/stream', 'remote'],
    ['  https://example.com/x.mp4  ', 'remote'],
    ['file:///data/data/pkg/files/clip.mp4', 'local'],
    ['content://media/external/video/42', 'local'],
    ['asset://bundled/intro.mp4', 'local'],
    ['ASSET://Bundled/Intro.mp4', 'local'],
    ['/data/local/tmp/clip.mp4', 'local'],
    ['clip.mp4', 'local'],
    ['C:\\Users\\me\\clip.mp4', 'local'],
    ['', 'local'],
  ] as const)('classifies %s as %s', (uri, expected) => {
    expect(sourceKind(uri)).toBe(expected);
  });
});

describe('isRemoteSource', () => {
  it('is true only for network sources', () => {
    expect(isRemoteSource('https://example.com/x.mp4')).toBe(true);
    expect(isRemoteSource('file:///x.mp4')).toBe(false);
    expect(isRemoteSource('/sdcard/x.mp4')).toBe(false);
  });
});

describe('isHlsSource', () => {
  it.each([
    ['https://cdn.example.com/live.m3u8', true],
    ['https://cdn.example.com/live.M3U8', true],
    ['https://cdn.example.com/live.m3u8?token=abc#t=10', true],
    ['file:///data/files/playlist.m3u8', true],
    ['https://cdn.example.com/clip.mp4', false],
    ['clip.m3u8.mp4', false],
    ['', false],
  ] as const)('detects %s -> %s', (uri, expected) => {
    expect(isHlsSource(uri)).toBe(expected);
  });
});
