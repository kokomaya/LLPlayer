import type { IPlayer } from '@aurora/player-api';
import type { SubtitleWordVM } from '@aurora/presentation';

// Headless glue for tapping/clicking a word in the subtitle list or fullscreen
// view (plan/05 — no logic in `*.tsx`). It stays gesture- AND platform-neutral:
// the SAME controller backs mobile (tap→seek, long-press→menu) and desktop
// (click→seek, right-click/hover→menu). The two dictionary/vocabulary
// dependencies are injected as async function-ports supplied by each app's
// composition root, so this file (and the CI graph) never imports the heavy
// dictionary/learning packages — yet every branch is Node-testable with fakes.

/** A word gloss the menu shows. Structurally compatible with the dictionary
 * package's `DictionaryEntry`, so a composition root can pass its `lookup`
 * result straight through without this file importing `@aurora/dictionary`. */
export interface WordSense {
  readonly definition: string;
  readonly partOfSpeech?: string;
  readonly examples?: readonly string[];
}
export interface WordGloss {
  readonly headword: string;
  readonly senses: readonly WordSense[];
  readonly phonetics?: string;
}

/** Look a word up in the installed dictionaries (翻译/示例 source). */
export type WordLookup = (word: string) => Promise<WordGloss | null>;

/**
 * Hand a word off to an EXTERNAL app already installed on the device — e.g. the
 * user's translator/dictionary app via an Android `ACTION_TRANSLATE` /
 * `ACTION_PROCESS_TEXT` intent. This is the "use the OS's own dictionary"
 * pathway: instead of shipping a preset gloss table, the menu's 翻译 defers to
 * whatever the learner has installed. Injected as a function-port so this core
 * never imports `expo-intent-launcher` (that lives only in `App.tsx`). Resolves
 * `true` when an app was launched, `false` when none could handle the word.
 */
export type WordExternalLookup = (input: {
  readonly word: string;
  readonly context?: string;
}) => Promise<boolean>;

/** Context passed when saving a word, so the sentence becomes its example. */
export interface FavoriteContext {
  readonly lineText: string;
}
/** Save a word for study (收藏). Resolves once persisted. */
export type WordFavorite = (input: {
  readonly word: string;
  readonly example?: string;
}) => Promise<void>;

export interface SubtitleWordActionsDeps {
  readonly player: IPlayer;
  /** Optional — when absent, `canTranslate` is false and the menu hides 翻译/示例. */
  readonly lookup?: WordLookup;
  /** Optional — when absent, `canFavorite` is false and the menu hides 收藏. */
  readonly favorite?: WordFavorite;
  /**
   * Optional — when absent, `canLookupExternally` is false and the menu hides
   * the "open in translator app" action. When present, 翻译 can hand the word to
   * the device's installed dictionary/translator instead of an in-app gloss.
   */
  readonly externalLookup?: WordExternalLookup;
}

/** The per-word menu opened by a long-press (mobile) / right-click (desktop). */
export interface WordMenu {
  readonly word: SubtitleWordVM;
  /** 翻译 — dictionary gloss, or null on a miss / when lookup isn't wired. */
  translate(): Promise<WordGloss | null>;
  /** 示例 — example sentences flattened from the gloss (empty when none). */
  examples(): Promise<readonly string[]>;
  /** 收藏 — save the word with the line as context; false if not wired. */
  favorite(context: FavoriteContext): Promise<boolean>;
  /**
   * 翻译 (external) — hand the word (optionally with its line as context) to the
   * device's installed translator/dictionary app. Resolves `true` when an app
   * was launched, `false` when none is wired or none could handle it.
   */
  openExternal(context?: string): Promise<boolean>;
}

/** Word-level interactions for the subtitle list / fullscreen views. */
export interface SubtitleWordActions {
  /** Seek playback to the tapped/clicked word's start. */
  seekToWord(word: SubtitleWordVM): void;
  /** Open the action menu for a word (gesture-neutral). */
  openMenu(word: SubtitleWordVM): WordMenu;
  /** Whether 翻译/示例 are available (a dictionary was injected). */
  readonly canTranslate: boolean;
  /** Whether 收藏 is available (a vocabulary sink was injected). */
  readonly canFavorite: boolean;
  /** Whether 翻译 can defer to an installed translator/dictionary app. */
  readonly canLookupExternally: boolean;
}

/**
 * Build {@link SubtitleWordActions} over a live player and optional
 * dictionary/vocabulary ports. `seekToWord` uses the word's precomputed
 * `targetMs` (from the presenter), so no timing logic is re-derived here.
 */
export const createSubtitleWordActions = (
  deps: SubtitleWordActionsDeps,
): SubtitleWordActions => {
  const { player, lookup, favorite, externalLookup } = deps;

  const glossFor = (word: SubtitleWordVM): Promise<WordGloss | null> =>
    lookup ? lookup(word.text) : Promise.resolve(null);

  return {
    canTranslate: lookup !== undefined,
    canFavorite: favorite !== undefined,
    canLookupExternally: externalLookup !== undefined,
    seekToWord: (word) => {
      void player.seek(word.targetMs);
    },
    openMenu: (word) => ({
      word,
      translate: () => glossFor(word),
      examples: async () => {
        const gloss = await glossFor(word);
        return gloss === null
          ? []
          : gloss.senses.flatMap((s) => s.examples ?? []);
      },
      favorite: async (context) => {
        if (!favorite) {
          return false;
        }
        await favorite({ word: word.text, example: context.lineText });
        return true;
      },
      openExternal: (context) => {
        if (!externalLookup) {
          return Promise.resolve(false);
        }
        return externalLookup({
          word: word.text,
          ...(context !== undefined && { context }),
        });
      },
    }),
  };
};
