import { describe, expect, it } from 'vitest';
import { flattenText } from './text-util.js';

// Ported verbatim from FlyleafLibTests/Utils/SubtitleTextUtilTests.cs
// (plan/06 §2 — port the C# behaviour, not the code).
describe('flattenText (ported from SubtitleTextUtilTests)', () => {
  it.each([
    ['', ''],
    ['   ', '   '], // assume trim done beforehand
    ['Hello', 'Hello'],
    ['Hello\nWorld', 'Hello World'],
    ['Hello\r\nWorld', 'Hello World'],
    ['Hello\n\nWorld', 'Hello World'],
    ['Hello\r\n\r\nWorld', 'Hello World'],
    ['Hello\n  \nWorld', 'Hello    World'],

    ['- Hello\n- How are you?', '- Hello\n- How are you?'],
    ['- Hello\n - How are you?', '- Hello  - How are you?'],
    ['- Hello\r- How are you?', '- Hello\r- How are you?'],
    ['- Hello\n\n- How are you?', '- Hello\n\n- How are you?'],
    ['- Hello\r\n- How are you?', '- Hello\r\n- How are you?'],
    ['- Hello\nWorld', '- Hello World'],
    ['- こんにちは\n- 世界', '- こんにちは\n- 世界'],
    ['- こんにちは\n世界', '- こんにちは 世界'],

    ['こんにちは\n世界', 'こんにちは 世界'],
    ['🙂\n🙃', '🙂 🙃'],
    ['<i>Hello</i>\n<i>World</i>', '<i>Hello</i> <i>World</i>'],

    ['- Hello\n- Good\nbye', '- Hello\n- Good bye'],
    ['- Hello\nWorld\n- Good\nbye', '- Hello World\n- Good bye'],

    ['Hello\n- Good\n- bye', 'Hello - Good - bye'],
    [' -Hello\n- Good\n- bye', ' -Hello - Good - bye'],

    ['- Hello\n- aa-bb-cc dd', '- Hello\n- aa-bb-cc dd'],
    ['- Hello\naa-bb-cc dd', '- Hello aa-bb-cc dd'],

    ['- Hello\n- Goodbye', '- Hello\n- Goodbye'], // hyphen
    ['– Hello\n– Goodbye', '– Hello\n– Goodbye'], // en dash
    ['- Hello\n– Goodbye', '- Hello – Goodbye'], // hyphen + en dash
  ])('flattenText(%j) === %j', (input, expected) => {
    expect(flattenText(input)).toBe(expected);
  });
});
