import { runKeyValueStoreContract } from '../contract/key-value-store-contract.js';
import { InMemoryKeyValueStore } from './in-memory-store.js';

runKeyValueStoreContract({
  name: 'InMemoryKeyValueStore',
  makeStore: () => new InMemoryKeyValueStore(),
});
