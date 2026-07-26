import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { KeyValueStore } from '../port.js';

/**
 * Reusable behaviour spec for {@link KeyValueStore} implementations
 * (plan/09 §1). Running this identical suite against every adapter is how LSP
 * becomes verifiable: any adapter that passes is a drop-in substitute for the
 * port everywhere it is depended upon.
 */
export interface KeyValueStoreContractCase {
  readonly name: string;
  /** Fresh, empty store per test. */
  readonly makeStore: () => KeyValueStore;
  /** Optional teardown (e.g. closing a DB handle). */
  readonly dispose?: (store: KeyValueStore) => void;
}

export const runKeyValueStoreContract = (
  testCase: KeyValueStoreContractCase,
): void => {
  describe(`KeyValueStore contract: ${testCase.name}`, () => {
    let store: KeyValueStore;

    beforeEach(() => {
      store = testCase.makeStore();
    });

    afterEach(() => {
      testCase.dispose?.(store);
    });

    it('returns undefined for a missing key', async () => {
      expect(await store.get('nope')).toBeUndefined();
      expect(await store.has('nope')).toBe(false);
    });

    it('round-trips a stored value', async () => {
      await store.set('a', '1');
      expect(await store.get('a')).toBe('1');
      expect(await store.has('a')).toBe(true);
    });

    it('overwrites an existing key (upsert)', async () => {
      await store.set('a', '1');
      await store.set('a', '2');
      expect(await store.get('a')).toBe('2');
      expect((await store.keys()).filter((k) => k === 'a')).toHaveLength(1);
    });

    it('deletes a key idempotently', async () => {
      await store.set('a', '1');
      await store.delete('a');
      expect(await store.has('a')).toBe(false);
      await store.delete('a'); // no throw on a missing key
      expect(await store.get('a')).toBeUndefined();
    });

    it('lists all keys', async () => {
      await store.set('a', '1');
      await store.set('b', '2');
      expect([...(await store.keys())].sort()).toEqual(['a', 'b']);
    });

    it('clears everything', async () => {
      await store.set('a', '1');
      await store.set('b', '2');
      await store.clear();
      expect(await store.keys()).toHaveLength(0);
    });

    it('preserves values verbatim, including empty strings and unicode', async () => {
      await store.set('empty', '');
      await store.set('u', 'héllo 🌍\n{"json":true}');
      expect(await store.get('empty')).toBe('');
      expect(await store.has('empty')).toBe(true);
      expect(await store.get('u')).toBe('héllo 🌍\n{"json":true}');
    });
  });
};
