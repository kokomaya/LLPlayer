import { describe, expect, it } from 'vitest';
import { isErr, isOk } from '../result.js';
import { isLanguageCode, languageCode } from './language-code.js';

describe('languageCode', () => {
  it.each([
    ['en', 'en'],
    ['EN', 'en'],
    ['eng', 'eng'],
    ['en-US', 'en-US'],
    ['en-us', 'en-US'],
    ['  fr  ', 'fr'],
  ])('normalizes %s -> %s', (raw, normalized) => {
    const r = languageCode(raw);
    expect(isOk(r)).toBe(true);
    if (isOk(r)) {
      expect(r.value).toBe(normalized);
    }
  });

  it.each(['e', 'english', '123', 'en_US', ''])(
    'rejects invalid "%s"',
    (raw) => {
      expect(isErr(languageCode(raw))).toBe(true);
    },
  );

  it('isLanguageCode acts as a guard', () => {
    expect(isLanguageCode('de')).toBe(true);
    expect(isLanguageCode('nope!')).toBe(false);
  });
});
