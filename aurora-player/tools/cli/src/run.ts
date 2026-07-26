import { createDefaultRegistry, type SubtitleDocument } from '@aurora/subtitle';
import { formatFrame, runPlayback, type PlaybackOptions } from './play.js';
import { formatSubsShow, querySubtitleAt } from './subs-show.js';
import { formatSubsWords, queryWordAt } from './subs-words.js';

/**
 * Side-effect boundary for the CLI. Injecting it (rather than reaching for
 * `node:fs`/`process` directly) keeps {@link run} pure and testable (DIP).
 */
export interface CliIO {
  readFile(path: string): string;
  write(text: string): void;
  writeError(text: string): void;
}

const USAGE = `aurora — Aurora Player CLI

Usage:
  aurora subs show <file> --at <ms>          Show the subtitle active at <ms>
  aurora subs words <file> --at <ms>         Show the active line + word at <ms>
  aurora play <file> --subs <sub> [--speed s] [--step ms]
                                             Deterministically "play" <file>,
                                             printing a frame per tick
  aurora define <word> --lang <c>            Look up a word in the dictionary
  aurora vocab add|list ...                  Manage saved vocabulary
  aurora review due|grade ...                Review due cards (FSRS)
`;

/** Parses argv and dispatches. Returns a process exit code. */
export const run = (argv: readonly string[], io: CliIO): number => {
  if (argv[0] === 'subs' && argv[1] === 'show') {
    return runSubsShow(argv.slice(2), io);
  }
  if (argv[0] === 'subs' && argv[1] === 'words') {
    return runSubsWords(argv.slice(2), io);
  }
  if (argv[0] === 'play') {
    return runPlay(argv.slice(1), io);
  }
  io.writeError(USAGE);
  return 2;
};

/** Reads and parses a subtitle file, writing errors to `io`. */
const loadSubtitle = (
  file: string,
  io: CliIO,
): SubtitleDocument | undefined => {
  let content: string;
  try {
    content = io.readFile(file);
  } catch (cause) {
    io.writeError(`error: cannot read "${file}": ${(cause as Error).message}\n`);
    return undefined;
  }
  const parsed = createDefaultRegistry().parse({ content, filename: file });
  if (!parsed.ok) {
    io.writeError(`error: ${parsed.error.message}\n`);
    return undefined;
  }
  return parsed.value;
};

const runSubsShow = (args: readonly string[], io: CliIO): number => {
  const positional: string[] = [];
  let atMs: number | undefined;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]!;
    if (arg === '--at') {
      atMs = Number(args[i + 1]);
      i += 1;
    } else if (arg.startsWith('--at=')) {
      atMs = Number(arg.slice('--at='.length));
    } else {
      positional.push(arg);
    }
  }

  const file = positional[0];
  if (file === undefined) {
    io.writeError(`error: missing <file>\n${USAGE}`);
    return 2;
  }
  if (atMs === undefined || !Number.isFinite(atMs)) {
    io.writeError('error: --at <ms> is required and must be a number\n');
    return 2;
  }

  const doc = loadSubtitle(file, io);
  if (doc === undefined) {
    return 1;
  }

  io.write(`${formatSubsShow(querySubtitleAt(doc, atMs))}\n`);
  return 0;
};

const runSubsWords = (args: readonly string[], io: CliIO): number => {
  const positional: string[] = [];
  let atMs: number | undefined;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]!;
    if (arg === '--at') {
      atMs = Number(args[i + 1]);
      i += 1;
    } else if (arg.startsWith('--at=')) {
      atMs = Number(arg.slice('--at='.length));
    } else {
      positional.push(arg);
    }
  }

  const file = positional[0];
  if (file === undefined) {
    io.writeError(`error: missing <file>\n${USAGE}`);
    return 2;
  }
  if (atMs === undefined || !Number.isFinite(atMs)) {
    io.writeError('error: --at <ms> is required and must be a number\n');
    return 2;
  }

  const doc = loadSubtitle(file, io);
  if (doc === undefined) {
    return 1;
  }

  io.write(`${formatSubsWords(queryWordAt(doc, atMs))}\n`);
  return 0;
};

const runPlay = (args: readonly string[], io: CliIO): number => {
  const positional: string[] = [];
  let subs: string | undefined;
  let speed: number | undefined;
  let stepMs: number | undefined;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]!;
    if (arg === '--subs') {
      subs = args[i + 1];
      i += 1;
    } else if (arg.startsWith('--subs=')) {
      subs = arg.slice('--subs='.length);
    } else if (arg === '--speed') {
      speed = Number(args[i + 1]);
      i += 1;
    } else if (arg.startsWith('--speed=')) {
      speed = Number(arg.slice('--speed='.length));
    } else if (arg === '--step') {
      stepMs = Number(args[i + 1]);
      i += 1;
    } else if (arg.startsWith('--step=')) {
      stepMs = Number(arg.slice('--step='.length));
    } else {
      positional.push(arg);
    }
  }

  const file = positional[0];
  if (file === undefined) {
    io.writeError(`error: missing <file>\n${USAGE}`);
    return 2;
  }
  if (subs === undefined) {
    io.writeError('error: --subs <file> is required\n');
    return 2;
  }
  if (speed !== undefined && (!Number.isFinite(speed) || speed <= 0)) {
    io.writeError('error: --speed must be a number > 0\n');
    return 2;
  }
  if (stepMs !== undefined && (!Number.isFinite(stepMs) || stepMs <= 0)) {
    io.writeError('error: --step must be a number > 0\n');
    return 2;
  }

  const doc = loadSubtitle(subs, io);
  if (doc === undefined) {
    return 1;
  }

  const options: PlaybackOptions = {
    ...(speed !== undefined ? { speed } : {}),
    ...(stepMs !== undefined ? { stepMs } : {}),
  };
  runPlayback(doc, file, options, (frame) => {
    io.write(`${formatFrame(frame)}\n`);
  });
  return 0;
};
