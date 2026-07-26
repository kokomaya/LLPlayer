import { describe, expect, it } from 'vitest';
import { InMemoryKeyValueStore } from './adapters/in-memory-store.js';
import { SettingsRepository } from './settings-repository.js';

const makeRepo = (): { repo: SettingsRepository; store: InMemoryKeyValueStore } => {
  const store = new InMemoryKeyValueStore();
  return { repo: new SettingsRepository(store), store };
};

describe('SettingsRepository', () => {
  it('round-trips strings', async () => {
    const { repo } = makeRepo();
    await repo.setString('lang', 'en');
    expect(await repo.getString('lang')).toBe('en');
    expect(await repo.getString('missing')).toBeUndefined();
  });

  it('round-trips JSON values', async () => {
    const { repo } = makeRepo();
    await repo.setJSON('prefs', { speed: 1.25, subs: ['en', 'ja'] });
    expect(await repo.getJSON<{ speed: number; subs: string[] }>('prefs')).toEqual({
      speed: 1.25,
      subs: ['en', 'ja'],
    });
    expect(await repo.getJSON('none')).toBeUndefined();
  });

  it('namespaces keys in the backing store', async () => {
    const { repo, store } = makeRepo();
    await repo.setString('lang', 'en');
    expect(await store.get('settings:lang')).toBe('en');
    expect(await store.get('lang')).toBeUndefined();
  });

  it('removes a key', async () => {
    const { repo } = makeRepo();
    await repo.setString('lang', 'en');
    await repo.remove('lang');
    expect(await repo.getString('lang')).toBeUndefined();
  });

  it('supports a custom namespace', async () => {
    const store = new InMemoryKeyValueStore();
    const repo = new SettingsRepository(store, 'player');
    await repo.setString('volume', '0.8');
    expect(await store.get('player:volume')).toBe('0.8');
  });
});
