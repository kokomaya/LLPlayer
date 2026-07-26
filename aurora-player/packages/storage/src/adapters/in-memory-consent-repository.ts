import {
  emptyConsent,
  withConsent,
  type ConsentRepository,
  type ConsentState,
  type DataUse,
} from '@aurora/domain';

/**
 * In-memory {@link ConsentRepository} — the reference implementation and the
 * default for tests / ephemeral use. State is an immutable {@link ConsentState}
 * rebuilt on each write; `load` hands back the current snapshot. `at` is the
 * caller's injected epoch-ms timestamp (never a wall clock, rule ①.C.13).
 */
export class InMemoryConsentRepository implements ConsentRepository {
  #state: ConsentState = emptyConsent();

  load(): Promise<ConsentState> {
    return Promise.resolve(this.#state);
  }

  grant(use: DataUse, at: number): Promise<void> {
    this.#state = withConsent(this.#state, use, true, at);
    return Promise.resolve();
  }

  revoke(use: DataUse, at: number): Promise<void> {
    this.#state = withConsent(this.#state, use, false, at);
    return Promise.resolve();
  }

  clear(): Promise<void> {
    this.#state = emptyConsent();
    return Promise.resolve();
  }
}
