/**
 * A logical clock port. The core never reads wall-clock time directly
 * (`Date.now()` is banned in scripts and makes tests non-deterministic); a
 * clock is injected instead (DIP). Real adapters wrap the platform's media
 * clock / frame callbacks; tests use {@link ManualClock}.
 */
export interface Clock {
  /** Monotonic logical milliseconds. */
  now(): number;
}

/**
 * A test/driver clock advanced by hand. Deterministic and dependency-free — the
 * substitute a `FakePlayer` uses to derive playback position (plan/09 · "logical
 * clock, not Date.now").
 */
export class ManualClock implements Clock {
  #ms: number;

  constructor(startMs = 0) {
    this.#ms = startMs;
  }

  now(): number {
    return this.#ms;
  }

  /** Advance the clock; negative deltas are rejected to keep it monotonic. */
  advance(deltaMs: number): this {
    if (deltaMs < 0) {
      throw new RangeError(`ManualClock cannot go backwards (got ${deltaMs})`);
    }
    this.#ms += deltaMs;
    return this;
  }

  /** Jump to an absolute time; must not move backwards. */
  set(ms: number): this {
    if (ms < this.#ms) {
      throw new RangeError(`ManualClock cannot go backwards (${ms} < ${this.#ms})`);
    }
    this.#ms = ms;
    return this;
  }
}
