import { describe, expect, it } from 'vitest';
import {
  err,
  isErr,
  isOk,
  map,
  mapErr,
  ok,
  unwrap,
  unwrapOr,
} from './result.js';

describe('Result', () => {
  it('constructs ok/err and narrows with guards', () => {
    const good = ok(5);
    const bad = err('boom');
    expect(isOk(good)).toBe(true);
    expect(isErr(bad)).toBe(true);
    if (isOk(good)) {
      expect(good.value).toBe(5);
    }
    if (isErr(bad)) {
      expect(bad.error).toBe('boom');
    }
  });

  it('map transforms only ok', () => {
    expect(map(ok(2), (n) => n * 3)).toEqual(ok(6));
    expect(map(err('e'), (n: number) => n * 3)).toEqual(err('e'));
  });

  it('mapErr transforms only err', () => {
    expect(mapErr(err('e'), (e) => `${e}!`)).toEqual(err('e!'));
    expect(mapErr(ok(1), (e: string) => `${e}!`)).toEqual(ok(1));
  });

  it('unwrapOr returns fallback on err', () => {
    expect(unwrapOr(ok(1), 9)).toBe(1);
    expect(unwrapOr(err('e'), 9)).toBe(9);
  });

  it('unwrap returns value or throws the error', () => {
    expect(unwrap(ok('v'))).toBe('v');
    const boom = new Error('nope');
    expect(() => unwrap(err(boom))).toThrow(boom);
    expect(() => unwrap(err('stringy'))).toThrow('stringy');
  });
});
