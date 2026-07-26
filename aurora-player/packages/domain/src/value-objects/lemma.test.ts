import { describe, expect, it } from 'vitest';
import { normalizeLemma } from './lemma.js';

describe('normalizeLemma', () => {
  it.each([
    ['Hello', 'hello'],
    ['  World! ', 'world'],
    ['"quoted"', 'quoted'],
    ['(parenthetical),', 'parenthetical'],
    ["don't", "don't"], // keeps intra-word apostrophe
    ['well-known', 'well-known'], // keeps intra-word hyphen
    ['…café.', 'café'], // unicode letters preserved
    ['世界。', '世界'], // CJK preserved, trailing punctuation stripped
  ])('normalizes %s -> %s', (raw, expected) => {
    expect(normalizeLemma(raw)).toBe(expected);
  });
});
