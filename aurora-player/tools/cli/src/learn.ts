import {
  isRating,
  languageCode,
  NotFoundError,
  normalizeLemma,
  type LanguageCode,
  type ReviewRepository,
  type VocabularyRepository,
} from '@aurora/domain';
import type { DictionaryRegistry } from '@aurora/dictionary';
import {
  addVocabulary,
  gradeReview,
  getDue,
  type IReviewScheduler,
} from '@aurora/learning';
import type { CliIO } from './run.js';

/**
 * Everything the learning commands need, injected at the composition root
 * (DIP). The core stays platform-free; `now` is the sole clock and callers may
 * still override it per command with `--at <ms>` for a reproducible run.
 */
export interface LearnDeps {
  readonly dictionary: DictionaryRegistry;
  readonly vocab: VocabularyRepository;
  readonly reviews: ReviewRepository;
  readonly scheduler: IReviewScheduler;
  readonly now: () => number;
}

export const LEARN_USAGE = `Learning:
  aurora define <word> --lang <c>            Look up a word in the dictionary
  aurora vocab add <word> --lang <c> [--context <t>] [--at <ms>]
                                             Save a word and seed its review card
  aurora vocab list                          List saved words
  aurora review due [--at <ms>]              List cards due at <ms> (or now)
  aurora review grade <id> <rating> [--at <ms>]
                                             Grade a card (again|hard|good|easy)
`;

/** True when `argv[0]` is one of the learning subcommands. */
export const isLearnCommand = (command: string | undefined): boolean =>
  command === 'define' || command === 'vocab' || command === 'review';

interface Parsed {
  readonly positional: readonly string[];
  readonly flags: Readonly<Record<string, string>>;
}

/** Split argv into positionals and `--flag value` / `--flag=value` pairs. */
const parse = (args: readonly string[]): Parsed => {
  const positional: string[] = [];
  const flags: Record<string, string> = {};
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]!;
    if (arg.startsWith('--')) {
      const eq = arg.indexOf('=');
      if (eq !== -1) {
        flags[arg.slice(2, eq)] = arg.slice(eq + 1);
      } else {
        flags[arg.slice(2)] = args[i + 1] ?? '';
        i += 1;
      }
    } else {
      positional.push(arg);
    }
  }
  return { positional, flags };
};

/** Resolve `--at <ms>` into an epoch-ms clock, falling back to `deps.now()`. */
const clockAt = (flags: Parsed['flags'], deps: LearnDeps): number | null => {
  if (flags.at === undefined) {
    return deps.now();
  }
  const at = Number(flags.at);
  return Number.isFinite(at) ? at : null;
};

const requireLang = (
  raw: string | undefined,
  io: CliIO,
): LanguageCode | null => {
  if (raw === undefined || raw === '') {
    io.writeError('error: --lang <code> is required\n');
    return null;
  }
  const result = languageCode(raw);
  if (!result.ok) {
    io.writeError(`error: ${result.error.message}\n`);
    return null;
  }
  return result.value;
};

const runDefine = async (
  args: readonly string[],
  io: CliIO,
  deps: LearnDeps,
): Promise<number> => {
  const { positional, flags } = parse(args);
  const word = positional[0];
  if (word === undefined) {
    io.writeError(`error: missing <word>\n${LEARN_USAGE}`);
    return 2;
  }
  const lang = requireLang(flags.lang, io);
  if (lang === null) {
    return 2;
  }
  const entry = await deps.dictionary.lookup(normalizeLemma(word), lang);
  if (entry === null) {
    io.write(`no definition for "${word}" (${lang})\n`);
    return 0;
  }
  const head = entry.phonetics ? `${entry.headword} ${entry.phonetics}` : entry.headword;
  io.write(`${head}  [${entry.sourceId}]\n`);
  for (const sense of entry.senses) {
    const pos = sense.partOfSpeech ? `(${sense.partOfSpeech}) ` : '';
    io.write(`  - ${pos}${sense.definition}\n`);
  }
  return 0;
};

const runVocab = async (
  args: readonly string[],
  io: CliIO,
  deps: LearnDeps,
): Promise<number> => {
  const sub = args[0];
  if (sub === 'list') {
    const entries = await deps.vocab.list();
    if (entries.length === 0) {
      io.write('(no saved words)\n');
      return 0;
    }
    for (const e of entries) {
      io.write(`${e.id}  ${e.lemma} [${e.status}]\n`);
    }
    return 0;
  }
  if (sub === 'add') {
    const { positional, flags } = parse(args.slice(1));
    const word = positional[0];
    if (word === undefined) {
      io.writeError(`error: missing <word>\n${LEARN_USAGE}`);
      return 2;
    }
    const lang = requireLang(flags.lang, io);
    if (lang === null) {
      return 2;
    }
    const now = clockAt(flags, deps);
    if (now === null) {
      io.writeError('error: --at must be a number\n');
      return 2;
    }
    const result = await addVocabulary(
      { vocab: deps.vocab, reviews: deps.reviews, scheduler: deps.scheduler },
      {
        lemma: normalizeLemma(word),
        lang,
        now,
        ...(flags.context !== undefined ? { context: flags.context } : {}),
      },
    );
    io.write(
      `${result.created ? 'added' : 'already saved'} ${result.entry.id} (due ${result.card.due})\n`,
    );
    return 0;
  }
  io.writeError(`error: unknown vocab subcommand\n${LEARN_USAGE}`);
  return 2;
};

const runReview = async (
  args: readonly string[],
  io: CliIO,
  deps: LearnDeps,
): Promise<number> => {
  const sub = args[0];
  if (sub === 'due') {
    const { flags } = parse(args.slice(1));
    const now = clockAt(flags, deps);
    if (now === null) {
      io.writeError('error: --at must be a number\n');
      return 2;
    }
    const due = await getDue(deps.reviews, now);
    if (due.length === 0) {
      io.write(`(nothing due at ${now})\n`);
      return 0;
    }
    for (const card of due) {
      io.write(`${card.id}  due ${card.due}  reps ${card.reps}  state ${card.state}\n`);
    }
    return 0;
  }
  if (sub === 'grade') {
    const { positional, flags } = parse(args.slice(1));
    const id = positional[0];
    const rating = positional[1];
    if (id === undefined || rating === undefined) {
      io.writeError(`error: usage: review grade <id> <rating>\n${LEARN_USAGE}`);
      return 2;
    }
    if (!isRating(rating)) {
      io.writeError('error: rating must be one of again|hard|good|easy\n');
      return 2;
    }
    const now = clockAt(flags, deps);
    if (now === null) {
      io.writeError('error: --at must be a number\n');
      return 2;
    }
    try {
      const next = await gradeReview(
        { reviews: deps.reviews, scheduler: deps.scheduler },
        { id, rating, now },
      );
      io.write(`graded ${next.id} ${rating} -> due ${next.due} (reps ${next.reps})\n`);
      return 0;
    } catch (cause) {
      if (cause instanceof NotFoundError) {
        io.writeError(`error: ${cause.message}\n`);
        return 1;
      }
      throw cause;
    }
  }
  io.writeError(`error: unknown review subcommand\n${LEARN_USAGE}`);
  return 2;
};

/** Dispatch a learning subcommand. Assumes {@link isLearnCommand}(argv[0]). */
export const runLearn = (
  argv: readonly string[],
  io: CliIO,
  deps: LearnDeps,
): Promise<number> => {
  if (argv[0] === 'define') {
    return runDefine(argv.slice(1), io, deps);
  }
  if (argv[0] === 'vocab') {
    return runVocab(argv.slice(1), io, deps);
  }
  return runReview(argv.slice(1), io, deps);
};
