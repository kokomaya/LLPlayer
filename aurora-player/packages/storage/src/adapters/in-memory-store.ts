import type { KeyValueStore } from '../port.js';

/**
 * In-memory {@link KeyValueStore} adapter. The reference implementation and the
 * default for tests and ephemeral use — no platform dependency at all.
 */
export class InMemoryKeyValueStore implements KeyValueStore {
  readonly #map = new Map<string, string>();

  get(key: string): Promise<string | undefined> {
    return Promise.resolve(this.#map.get(key));
  }

  set(key: string, value: string): Promise<void> {
    this.#map.set(key, value);
    return Promise.resolve();
  }

  has(key: string): Promise<boolean> {
    return Promise.resolve(this.#map.has(key));
  }

  delete(key: string): Promise<void> {
    this.#map.delete(key);
    return Promise.resolve();
  }

  keys(): Promise<readonly string[]> {
    return Promise.resolve([...this.#map.keys()]);
  }

  clear(): Promise<void> {
    this.#map.clear();
    return Promise.resolve();
  }
}
