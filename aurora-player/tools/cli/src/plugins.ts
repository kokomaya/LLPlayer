import { languageCode, type LanguageCode, type VocabularyRepository } from '@aurora/domain';
import type { ImportedMedia, PluginRegistry } from '@aurora/plugins';
import type { CliIO } from './run.js';

/**
 * Everything the plugin commands need, injected at the composition root (DIP).
 * The `registry` arrives with the bundled offline plugins already registered but
 * not yet activated — {@link runPlugins} activates it (with error isolation) on
 * each invocation so `plugins list` can report per-plugin status. `writeFile` is
 * optional so tests stay pure; only `export anki --out` needs it.
 */
export interface PluginsDeps {
  readonly registry: PluginRegistry;
  readonly vocab: VocabularyRepository;
  readonly writeFile?: (path: string, data: string) => void;
}

export const PLUGINS_USAGE = `Plugins:
  aurora plugins list                        List registered plugins + capabilities
  aurora transcribe <mediaId> --lang <c>     Transcribe media via a Whisper plugin
  aurora export anki [--out <file>]          Export saved vocabulary as Anki TSV
  aurora import <manifest.json> [--out <f>]  Import media + subtitle tracks
`;

/** True when `argv[0]` is one of the plugin subcommands. */
export const isPluginsCommand = (command: string | undefined): boolean =>
  command === 'plugins' ||
  command === 'transcribe' ||
  command === 'export' ||
  command === 'import';

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

const requireLang = (raw: string | undefined, io: CliIO): LanguageCode | null => {
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

const runList = async (io: CliIO, deps: PluginsDeps): Promise<number> => {
  const report = await deps.registry.activateAll();
  const failed = new Map(report.failures.map((f) => [f.pluginId, f.error.message]));
  for (const plugin of deps.registry.discover()) {
    const caps = plugin.capabilities.join(', ');
    const status = failed.has(plugin.id)
      ? `failed: ${failed.get(plugin.id)}`
      : 'active';
    io.write(`${plugin.id} v${plugin.version} [${caps}] ${status}\n`);
  }
  return 0;
};

const runTranscribe = async (
  args: readonly string[],
  io: CliIO,
  deps: PluginsDeps,
): Promise<number> => {
  const { positional, flags } = parse(args);
  const mediaId = positional[0];
  if (mediaId === undefined) {
    io.writeError(`error: missing <mediaId>\n${PLUGINS_USAGE}`);
    return 2;
  }
  const lang = requireLang(flags.lang, io);
  if (lang === null) {
    return 2;
  }
  await deps.registry.activateAll();
  const provider = deps.registry.subtitleProviders()[0];
  if (provider === undefined) {
    io.writeError('error: no subtitle provider plugin available\n');
    return 1;
  }
  const doc = await provider.transcribe({ mediaId }, lang);
  for (const line of doc.lines) {
    io.write(`[${line.range.startMs}-${line.range.endMs}] ${line.text}\n`);
    for (const word of line.words ?? []) {
      const r = word.range;
      io.write(`    ${word.text}${r ? ` [${r.startMs}-${r.endMs}]` : ''}\n`);
    }
  }
  return 0;
};

const runExport = async (
  args: readonly string[],
  io: CliIO,
  deps: PluginsDeps,
): Promise<number> => {
  if (args[0] !== 'anki') {
    io.writeError(`error: unknown export target\n${PLUGINS_USAGE}`);
    return 2;
  }
  const { flags } = parse(args.slice(1));
  await deps.registry.activateAll();
  const exporter = deps.registry.exporters().find((e) => e.id === 'anki');
  if (exporter === undefined) {
    io.writeError('error: no Anki exporter plugin available\n');
    return 1;
  }
  const entries = await deps.vocab.list();
  const tsv = exporter.export({ entries });
  if (flags.out !== undefined && flags.out !== '') {
    if (deps.writeFile === undefined) {
      io.writeError('error: --out is not supported here\n');
      return 2;
    }
    deps.writeFile(flags.out, tsv);
    io.write(`wrote ${entries.length} card(s) to ${flags.out}\n`);
    return 0;
  }
  io.write(tsv === '' ? '(no saved words)\n' : `${tsv}\n`);
  return 0;
};

/** Render imported media as a stable, human-readable summary. */
const formatMedia = (media: ImportedMedia): string => {
  const lines = [`media: ${media.mediaId}`];
  if (media.title !== undefined) {
    lines.push(`title: ${media.title}`);
  }
  if (media.durationMs !== undefined) {
    lines.push(`duration: ${media.durationMs}ms`);
  }
  lines.push(`tracks: ${media.subtitleTracks.length}`);
  media.subtitleTracks.forEach((track, i) => {
    const words = track.hasWordTimings ? 'yes' : 'no';
    lines.push(
      `  [${i}] ${track.meta.format} ${track.lines.length} line(s) words:${words}`,
    );
  });
  return `${lines.join('\n')}\n`;
};

const runImport = async (
  args: readonly string[],
  io: CliIO,
  deps: PluginsDeps,
): Promise<number> => {
  const { positional, flags } = parse(args);
  const ref = positional[0];
  if (ref === undefined) {
    io.writeError(`error: missing <manifest.json>\n${PLUGINS_USAGE}`);
    return 2;
  }
  let content: string;
  try {
    content = io.readFile(ref);
  } catch (cause) {
    io.writeError(`error: cannot read "${ref}": ${(cause as Error).message}\n`);
    return 1;
  }
  await deps.registry.activateAll();
  const mediaRef = { uri: ref, content };
  const importer = deps.registry
    .mediaImporters()
    .find((im) => im.canImport(mediaRef));
  if (importer === undefined) {
    io.writeError(`error: no media importer can handle "${ref}"\n`);
    return 1;
  }
  let media: ImportedMedia;
  try {
    media = await importer.import(mediaRef);
  } catch (cause) {
    io.writeError(`error: import failed: ${(cause as Error).message}\n`);
    return 1;
  }
  const report = formatMedia(media);
  if (flags.out !== undefined && flags.out !== '') {
    if (deps.writeFile === undefined) {
      io.writeError('error: --out is not supported here\n');
      return 2;
    }
    deps.writeFile(flags.out, report);
    io.write(`wrote import summary to ${flags.out}\n`);
    return 0;
  }
  io.write(report);
  return 0;
};

/** Dispatch a plugin subcommand. Assumes {@link isPluginsCommand}(argv[0]). */
export const runPlugins = (
  argv: readonly string[],
  io: CliIO,
  deps: PluginsDeps,
): Promise<number> => {
  if (argv[0] === 'plugins') {
    if (argv[1] === 'list') {
      return runList(io, deps);
    }
    io.writeError(`error: unknown plugins subcommand\n${PLUGINS_USAGE}`);
    return Promise.resolve(2);
  }
  if (argv[0] === 'transcribe') {
    return runTranscribe(argv.slice(1), io, deps);
  }
  if (argv[0] === 'import') {
    return runImport(argv.slice(1), io, deps);
  }
  return runExport(argv.slice(1), io, deps);
};
