import type { LanguageCode, Lemma } from '@aurora/domain';

/**
 * Deterministic identity for a vocabulary item: one entry per (language, lemma).
 * Deriving the id from its natural key keeps `addVocabulary` idempotent and the
 * whole loop reproducible without a random/UUID source (plan/09 · determinism).
 * The review card shares the entry's id (1:1).
 */
export const vocabId = (lang: LanguageCode, lemma: Lemma): string =>
  `${lang}:${lemma}`;
