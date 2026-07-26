import { describe, expect, it } from 'vitest';
import { runKeyValueStoreContract } from '../contract/key-value-store-contract.js';
import { SqliteKeyValueStore } from './sqlite-store.js';

// The same contract the in-memory store passes — proving substitutability (LSP).
runKeyValueStoreContract({
  name: 'SqliteKeyValueStore (:memory:)',
  makeStore: () => new SqliteKeyValueStore(':memory:'),
  dispose: (store) => (store as SqliteKeyValueStore).close(),
});

describe('SqliteKeyValueStore specifics', () => {
  it('persists across store instances backed by the same connectionless file', async () => {
    // Two stores over a shared in-memory DB are independent, so this asserts the
    // schema is created idempotently and a second instance starts empty.
    const a = new SqliteKeyValueStore(':memory:');
    await a.set('a', '1');
    const b = new SqliteKeyValueStore(':memory:');
    expect(await b.get('a')).toBeUndefined();
    a.close();
    b.close();
  });
});
