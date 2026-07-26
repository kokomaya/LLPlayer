import { languageCode, type CacheRepository, type LanguageCode } from '@aurora/domain';
import {
  createLLMRuntime,
  explainGrammar,
  explainWord,
  translateLine,
  type ILLMProvider,
  type LLMMode,
} from '@aurora/ai';
import type { CliIO } from './run.js';

/**
 * Everything the AI commands need, injected at the composition root (DIP). The
 * core stays platform-free and, by default, offline: `offline` is always
 * present so `translate`/`explain` run with no network and no API key; an
 * `online` provider is wired in only off-CI once a key is configured.
 */
export interface AiDeps {
  readonly offline: ILLMProvider;
  readonly online?: ILLMProvider;
  readonly cache: CacheRepository;
  readonly now: () => number;
}

export const AI_USAGE = `AI:
  aurora translate <text> --to <lang> [--mode offline|online|hybrid] [--provider <id>]
  aurora explain grammar <text> [--mode ...] [--provider <id>]
  aurora explain word <word> [--context <t>] [--mode ...] [--provider <id>]
`;

/** True when `argv[0]` is one of the AI subcommands. */
export const isAiCommand = (command: string | undefined): boolean =>
  command === 'translate' || command === 'explain';

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

/** Resolve `--provider`/`--mode` into a single runtime provider (OCP seam). */
const buildProvider = (
  flags: Parsed['flags'],
  deps: AiDeps,
  io: CliIO,
): ILLMProvider | null => {
  if (flags.provider !== undefined) {
    if (flags.provider === deps.offline.id) {
      return deps.offline;
    }
    if (deps.online !== undefined && flags.provider === deps.online.id) {
      return deps.online;
    }
    io.writeError(`error: unknown provider "${flags.provider}"\n`);
    return null;
  }
  const mode = flags.mode ?? 'offline';
  if (mode !== 'offline' && mode !== 'online' && mode !== 'hybrid') {
    io.writeError('error: --mode must be offline|online|hybrid\n');
    return null;
  }
  if (mode === 'online' && deps.online === undefined) {
    io.writeError('error: no online provider configured (set an API key off-CI)\n');
    return null;
  }
  return createLLMRuntime({
    mode: mode as LLMMode,
    offline: deps.offline,
    ...(deps.online !== undefined ? { online: deps.online } : {}),
  });
};

const requireTo = (raw: string | undefined, io: CliIO): LanguageCode | null => {
  if (raw === undefined || raw === '') {
    io.writeError('error: --to <lang> is required\n');
    return null;
  }
  const result = languageCode(raw);
  if (!result.ok) {
    io.writeError(`error: ${result.error.message}\n`);
    return null;
  }
  return result.value;
};

/** Print a completion plus a `[provider · cached]` provenance tag. */
const emit = (io: CliIO, text: string, providerId: string, cached: boolean): void => {
  io.write(`${text}\n[${providerId}${cached ? ' · cached' : ''}]\n`);
};

const runTranslate = async (
  args: readonly string[],
  io: CliIO,
  deps: AiDeps,
): Promise<number> => {
  const { positional, flags } = parse(args);
  const text = positional.join(' ');
  if (text === '') {
    io.writeError(`error: missing <text>\n${AI_USAGE}`);
    return 2;
  }
  const to = requireTo(flags.to, io);
  if (to === null) {
    return 2;
  }
  const provider = buildProvider(flags, deps, io);
  if (provider === null) {
    return 2;
  }
  const r = await translateLine(
    { provider, cache: deps.cache, now: deps.now },
    { text, targetLang: to },
  );
  emit(io, r.text, r.providerId, r.cached);
  return 0;
};

const runExplain = async (
  args: readonly string[],
  io: CliIO,
  deps: AiDeps,
): Promise<number> => {
  const sub = args[0];
  const { positional, flags } = parse(args.slice(1));
  const provider = buildProvider(flags, deps, io);
  if (provider === null) {
    return 2;
  }
  const cdeps = { provider, cache: deps.cache, now: deps.now };

  if (sub === 'grammar') {
    const text = positional.join(' ');
    if (text === '') {
      io.writeError(`error: missing <text>\n${AI_USAGE}`);
      return 2;
    }
    const r = await explainGrammar(cdeps, { text });
    emit(io, r.text, r.providerId, r.cached);
    return 0;
  }
  if (sub === 'word') {
    const word = positional[0];
    if (word === undefined) {
      io.writeError(`error: missing <word>\n${AI_USAGE}`);
      return 2;
    }
    const r = await explainWord(cdeps, {
      word,
      ...(flags.context !== undefined ? { context: flags.context } : {}),
    });
    emit(io, r.text, r.providerId, r.cached);
    return 0;
  }
  io.writeError(`error: unknown explain subcommand\n${AI_USAGE}`);
  return 2;
};

/** Dispatch an AI subcommand. Assumes {@link isAiCommand}(argv[0]). */
export const runAi = (
  argv: readonly string[],
  io: CliIO,
  deps: AiDeps,
): Promise<number> => {
  if (argv[0] === 'translate') {
    return runTranslate(argv.slice(1), io, deps);
  }
  return runExplain(argv.slice(1), io, deps);
};
