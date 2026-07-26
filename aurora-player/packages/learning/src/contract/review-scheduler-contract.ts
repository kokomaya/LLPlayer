import { RATINGS } from '@aurora/domain';
import { describe, expect, it } from 'vitest';
import type { IReviewScheduler } from '../scheduler-port.js';

/**
 * Reusable behaviour spec for {@link IReviewScheduler} implementations
 * (plan/09 §1). Any scheduler that passes is a drop-in substitute (LSP). The
 * assertions are algorithm-agnostic invariants every sane spaced-repetition
 * scheduler must satisfy — so an FSRS, SM-2, or reference scheduler can share
 * this suite.
 */
export interface ReviewSchedulerContractCase {
  readonly name: string;
  readonly makeScheduler: () => IReviewScheduler;
}

const T0 = 1_700_000_000_000; // fixed epoch ms; determinism, not the wall clock

export const runReviewSchedulerContract = (
  testCase: ReviewSchedulerContractCase,
): void => {
  describe(`IReviewScheduler contract: ${testCase.name}`, () => {
    it('mints a fresh card: new, due now, zero reps/lapses, ids attached', () => {
      const card = testCase.makeScheduler().initialCard('c1', 'v1', T0);
      expect(card.id).toBe('c1');
      expect(card.vocabId).toBe('v1');
      expect(card.state).toBe('new');
      expect(card.due).toBe(T0);
      expect(card.reps).toBe(0);
      expect(card.lapses).toBe(0);
      expect(card.lastReviewedAt).toBeUndefined();
    });

    it('grading pushes due into the future and increments reps', () => {
      const s = testCase.makeScheduler();
      const card = s.initialCard('c1', 'v1', T0);
      const next = s.grade(card, 'good', T0);
      expect(next.due).toBeGreaterThan(T0);
      expect(next.reps).toBe(card.reps + 1);
      expect(next.lastReviewedAt).toBe(T0);
    });

    it('preserves id and vocabId across grading', () => {
      const s = testCase.makeScheduler();
      const card = s.initialCard('card-x', 'vocab-x', T0);
      const next = s.grade(card, 'again', T0);
      expect(next.id).toBe('card-x');
      expect(next.vocabId).toBe('vocab-x');
    });

    it('a better grade schedules no sooner than a worse one', () => {
      const s = testCase.makeScheduler();
      const base = s.initialCard('c1', 'v1', T0);
      const dueByRating = RATINGS.map((r) => s.grade(base, r, T0).due);
      for (let i = 1; i < dueByRating.length; i += 1) {
        expect(dueByRating[i]!).toBeGreaterThanOrEqual(dueByRating[i - 1]!);
      }
    });

    it('is deterministic: identical inputs yield identical scheduling', () => {
      const a = testCase.makeScheduler().grade(
        testCase.makeScheduler().initialCard('c1', 'v1', T0),
        'good',
        T0,
      );
      const b = testCase.makeScheduler().grade(
        testCase.makeScheduler().initialCard('c1', 'v1', T0),
        'good',
        T0,
      );
      expect(b).toEqual(a);
    });
  });
};
