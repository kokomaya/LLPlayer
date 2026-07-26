import { describe, expect, it } from 'vitest';
import { RATINGS, isRating } from './rating.js';

describe('Rating', () => {
  it('lists the four grades worst→best', () => {
    expect(RATINGS).toEqual(['again', 'hard', 'good', 'easy']);
  });

  it('narrows valid rating strings and rejects others', () => {
    expect(isRating('good')).toBe(true);
    expect(isRating('again')).toBe(true);
    expect(isRating('perfect')).toBe(false);
    expect(isRating('')).toBe(false);
  });
});
