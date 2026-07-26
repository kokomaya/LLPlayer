import type { ReviewCard, ReviewRepository } from '@aurora/domain';

/**
 * In-memory {@link ReviewRepository} — reference implementation. `listDue`
 * applies the same `due <= now`, ascending-by-due ordering the SQLite adapter
 * does, so both satisfy one contract (LSP).
 */
export class InMemoryReviewRepository implements ReviewRepository {
  readonly #map = new Map<string, ReviewCard>();

  upsert(card: ReviewCard): Promise<void> {
    this.#map.set(card.id, card);
    return Promise.resolve();
  }

  get(id: string): Promise<ReviewCard | undefined> {
    return Promise.resolve(this.#map.get(id));
  }

  list(): Promise<readonly ReviewCard[]> {
    return Promise.resolve([...this.#map.values()]);
  }

  listDue(now: number): Promise<readonly ReviewCard[]> {
    return Promise.resolve(
      [...this.#map.values()]
        .filter((c) => c.due <= now)
        .sort((a, b) => a.due - b.due || a.id.localeCompare(b.id)),
    );
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
