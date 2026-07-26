/**
 * Model-agnostic key/value persistence port (plan/05 · storage).
 *
 * Deliberately generic: the core depends on this abstraction, never on a
 * concrete backend (DIP). Adapters bind it to a platform — better-sqlite3 on
 * desktop/Node, expo-sqlite or AsyncStorage on mobile, IndexedDB on web —
 * without the core changing (OCP). Every method is async so that *every*
 * conceivable backend (including async-only ones like AsyncStorage) can satisfy
 * the same contract (LSP); synchronous backends simply resolve immediately.
 *
 * Domain-specific repositories (vocabulary, review cards, …) are NOT defined
 * here — they live in their own domain packages and may be layered on top of a
 * `KeyValueStore`, keeping this port minimal (ISP).
 */
export interface KeyValueStore {
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string): Promise<void>;
  has(key: string): Promise<boolean>;
  delete(key: string): Promise<void>;
  keys(): Promise<readonly string[]>;
  clear(): Promise<void>;
}
