/**
 * A normalized dictionary lookup key. Ports the intent of FlyleafLib's word
 * cleanup before dictionary/AI lookups: lowercase, trim, and strip surrounding
 * punctuation/quotes while keeping intra-word marks (apostrophes, hyphens).
 */
export type Lemma = string & { readonly __brand: 'Lemma' };

// Leading/trailing runs of anything that is not a letter, number, or mark.
// Uses Unicode property escapes so it works for non-Latin scripts too.
const EDGE_PUNCT = /^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu;

export const normalizeLemma = (word: string): Lemma =>
  word.trim().replace(EDGE_PUNCT, '').toLowerCase() as Lemma;
