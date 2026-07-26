import { describe, expect, it } from 'vitest';
import { runReviewSchedulerContract } from '../contract/review-scheduler-contract.js';
import { FsrsScheduler } from './fsrs-scheduler.js';

// LSP: the FSRS scheduler satisfies the shared scheduler contract.
runReviewSchedulerContract({
  name: 'FsrsScheduler',
  makeScheduler: () => new FsrsScheduler(),
});

const T0 = 1_700_000_000_000;
const DAY = 86_400_000;

describe('FsrsScheduler FSRS specifics', () => {
  it('a lapse (again after reaching review state) increments lapses', () => {
    // Disable short-term learning steps so a single good grade promotes the card
    // straight to Review state, making the subsequent "again" a true lapse.
    const s = new FsrsScheduler({ enable_short_term: false });
    let card = s.initialCard('c', 'v', T0);
    card = s.grade(card, 'good', T0);
    expect(card.state).toBe('review');
    card = s.grade(card, 'again', card.due); // lapse on a review
    expect(card.lapses).toBeGreaterThanOrEqual(1);
  });

  it('repeated good grades keep extending the interval (stability grows)', () => {
    const s = new FsrsScheduler();
    let card = s.initialCard('c', 'v', T0);
    card = s.grade(card, 'good', T0);
    const firstStability = card.stability;
    card = s.grade(card, 'good', card.due);
    expect(card.stability).toBeGreaterThanOrEqual(firstStability);
    expect(card.reps).toBe(2);
  });

  it('is deterministic across schedulers (fuzz disabled)', () => {
    const a = new FsrsScheduler().grade(
      new FsrsScheduler().initialCard('c', 'v', T0),
      'easy',
      T0,
    );
    const b = new FsrsScheduler().grade(
      new FsrsScheduler().initialCard('c', 'v', T0),
      'easy',
      T0,
    );
    expect(b.due).toBe(a.due);
    // An easy grade on a new card schedules at least a day out.
    expect(a.due).toBeGreaterThanOrEqual(T0 + DAY);
  });
});
