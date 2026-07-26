import { ValidationError } from '../errors.js';
import { err, ok, type Result } from '../result.js';

/**
 * A validated ISO 639-1/639-2 language code, optionally with an ISO 3166-1
 * region suffix (e.g. `en`, `eng`, `en-US`). Branded so a raw string cannot be
 * passed where a validated code is required.
 */
export type LanguageCode = string & { readonly __brand: 'LanguageCode' };

const LANGUAGE_RE = /^[a-z]{2,3}(?:-[A-Z]{2})?$/;

export const languageCode = (
  raw: string,
): Result<LanguageCode, ValidationError> => {
  const [langPart, regionPart] = raw.trim().split('-');
  const normalized =
    regionPart !== undefined
      ? `${(langPart ?? '').toLowerCase()}-${regionPart.toUpperCase()}`
      : (langPart ?? '').toLowerCase();
  if (!LANGUAGE_RE.test(normalized)) {
    return err(new ValidationError(`Invalid language code: "${raw}"`));
  }
  return ok(normalized as LanguageCode);
};

export const isLanguageCode = (raw: string): raw is LanguageCode =>
  languageCode(raw).ok;
