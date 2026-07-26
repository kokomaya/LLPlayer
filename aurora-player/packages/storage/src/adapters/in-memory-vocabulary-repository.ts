import type { VocabEntry, VocabularyRepository } from '@aurora/domain';

/**
 * In-memory {@link VocabularyRepository} — the reference implementation and the
 * default for tests/ephemeral use. No platform dependency.
 */
export class InMemoryVocabularyRepository implements VocabularyRepository {
  readonly #map = new Map<string, VocabEntry>();

  upsert(entry: VocabEntry): Promise<void> {
    this.#map.set(entry.id, entry);
    return Promise.resolve();
  }

  get(id: string): Promise<VocabEntry | undefined> {
    return Promise.resolve(this.#map.get(id));
  }

  list(): Promise<readonly VocabEntry[]> {
    return Promise.resolve([...this.#map.values()]);
  }

  delete(id: string): Promise<void> {
    this.#map.delete(id);
    return Promise.resolve();
  }

  clear(): Promise<void> {
    this.#map.clear();
    return Promise.resolve();
  }
}
