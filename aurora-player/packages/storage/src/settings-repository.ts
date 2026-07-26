import type { KeyValueStore } from './port.js';

/**
 * Typed convenience facade over a {@link KeyValueStore} for application
 * settings. Depends only on the abstraction (DIP) — inject any adapter. Keys
 * are namespaced so settings can share a store with other concerns.
 */
export class SettingsRepository {
  constructor(
    private readonly store: KeyValueStore,
    private readonly namespace = 'settings',
  ) {}

  #key(key: string): string {
    return `${this.namespace}:${key}`;
  }

  getString(key: string): Promise<string | undefined> {
    return this.store.get(this.#key(key));
  }

  setString(key: string, value: string): Promise<void> {
    return this.store.set(this.#key(key), value);
  }

  async getJSON<T>(key: string): Promise<T | undefined> {
    const raw = await this.store.get(this.#key(key));
    if (raw === undefined) {
      return undefined;
    }
    return JSON.parse(raw) as T;
  }

  setJSON<T>(key: string, value: T): Promise<void> {
    return this.store.set(this.#key(key), JSON.stringify(value));
  }

  remove(key: string): Promise<void> {
    return this.store.delete(this.#key(key));
  }
}
