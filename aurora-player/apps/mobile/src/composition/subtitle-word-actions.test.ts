import { describe, expect, it, vi } from 'vitest';
import type { IPlayer } from '@aurora/player-api';
import type { SubtitleWordVM } from '@aurora/presentation';
import {
  createSubtitleWordActions,
  type WordGloss,
} from './subtitle-word-actions.js';

const WORD: SubtitleWordVM = {
  text: 'brave',
  wordIndex: 1,
  targetMs: 2000,
  estimated: false,
};

const GLOSS: WordGloss = {
  headword: 'brave',
  senses: [
    { definition: 'ready to face danger', examples: ['a brave knight', 'be brave'] },
    { definition: 'to endure', examples: ['brave the storm'] },
  ],
};

const makePlayer = () => {
  const seek = vi.fn(() => Promise.resolve());
  return { player: { seek } as unknown as IPlayer, seek };
};

describe('createSubtitleWordActions · seek', () => {
  it('seeks to the word start', () => {
    const { player, seek } = makePlayer();
    createSubtitleWordActions({ player }).seekToWord(WORD);
    expect(seek).toHaveBeenCalledWith(2000);
  });
});

describe('createSubtitleWordActions · capabilities', () => {
  it('reflects which ports were injected', () => {
    const { player } = makePlayer();
    const none = createSubtitleWordActions({ player });
    expect(none.canTranslate).toBe(false);
    expect(none.canFavorite).toBe(false);

    const full = createSubtitleWordActions({
      player,
      lookup: async () => null,
      favorite: async () => {
        /* no-op sink */
      },
    });
    expect(full.canTranslate).toBe(true);
    expect(full.canFavorite).toBe(true);
  });

  it('canLookupExternally reflects the externalLookup port', () => {
    const { player } = makePlayer();
    expect(createSubtitleWordActions({ player }).canLookupExternally).toBe(false);
    const withExternal = createSubtitleWordActions({
      player,
      externalLookup: async () => true,
    });
    expect(withExternal.canLookupExternally).toBe(true);
  });
});

describe('createSubtitleWordActions · menu', () => {
  it('translate returns the gloss from the injected dictionary', async () => {
    const { player } = makePlayer();
    const lookup = vi.fn(async (w: string) => (w === 'brave' ? GLOSS : null));
    const menu = createSubtitleWordActions({ player, lookup }).openMenu(WORD);
    expect(await menu.translate()).toEqual(GLOSS);
    expect(lookup).toHaveBeenCalledWith('brave');
  });

  it('examples flattens example sentences across senses', async () => {
    const { player } = makePlayer();
    const menu = createSubtitleWordActions({
      player,
      lookup: async () => GLOSS,
    }).openMenu(WORD);
    expect(await menu.examples()).toEqual(['a brave knight', 'be brave', 'brave the storm']);
  });

  it('translate/examples degrade to null/[] without a dictionary', async () => {
    const { player } = makePlayer();
    const menu = createSubtitleWordActions({ player }).openMenu(WORD);
    expect(await menu.translate()).toBeNull();
    expect(await menu.examples()).toEqual([]);
  });

  it('favorite saves the word with the line as example', async () => {
    const { player } = makePlayer();
    const favorite = vi.fn(async () => {
      /* no-op sink */
    });
    const menu = createSubtitleWordActions({ player, favorite }).openMenu(WORD);
    expect(await menu.favorite({ lineText: 'Hello brave world' })).toBe(true);
    expect(favorite).toHaveBeenCalledWith({ word: 'brave', example: 'Hello brave world' });
  });

  it('favorite returns false when no sink is wired', async () => {
    const { player } = makePlayer();
    const menu = createSubtitleWordActions({ player }).openMenu(WORD);
    expect(await menu.favorite({ lineText: 'x' })).toBe(false);
  });

  it('openExternal forwards the word + context and passes the result through', async () => {
    const { player } = makePlayer();
    const externalLookup = vi.fn(async () => true);
    const menu = createSubtitleWordActions({ player, externalLookup }).openMenu(WORD);
    expect(await menu.openExternal('Be brave, my friend')).toBe(true);
    expect(externalLookup).toHaveBeenCalledWith({
      word: 'brave',
      context: 'Be brave, my friend',
    });
  });

  it('openExternal omits context when not supplied and relays a false result', async () => {
    const { player } = makePlayer();
    const externalLookup = vi.fn(async () => false);
    const menu = createSubtitleWordActions({ player, externalLookup }).openMenu(WORD);
    expect(await menu.openExternal()).toBe(false);
    expect(externalLookup).toHaveBeenCalledWith({ word: 'brave' });
  });

  it('openExternal returns false when no external port is wired', async () => {
    const { player } = makePlayer();
    const menu = createSubtitleWordActions({ player }).openMenu(WORD);
    expect(await menu.openExternal('ctx')).toBe(false);
  });
});
