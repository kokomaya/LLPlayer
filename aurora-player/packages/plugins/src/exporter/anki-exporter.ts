import type { ExportInput, IExporter } from './port.js';
import type { Plugin, PluginContext } from '../plugin.js';

/** Anki's TSV import treats TAB as the field separator and NL as the record
 * separator, so any field content carrying either must be flattened. */
const clean = (value: string): string => value.replace(/[\t\r\n]+/g, ' ').trim();

/**
 * Turns saved vocabulary into an Anki-importable TSV (plan/05 · plugins ·
 * `IExporter`). Pure and deterministic: `front <TAB> back <TAB> tags`, one card
 * per line, rows sorted by `id` so the same vocabulary always yields byte-identical
 * output (testable without a clock, a file, or Anki itself). Front = the word,
 * back = the sentence it was captured in, tags = language + mastery status.
 */
export class AnkiExporter implements IExporter {
  readonly id = 'anki';
  readonly format = 'anki-tsv';

  export(input: ExportInput): string {
    const rows = [...input.entries]
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      .map((e) => {
        const front = clean(e.lemma);
        const back = clean(e.context ?? '');
        const tags = `${e.lang} ${e.status}`;
        return `${front}\t${back}\t${tags}`;
      });
    return rows.join('\n');
  }
}

/**
 * Plugin wrapper that contributes the {@link AnkiExporter} under the `exporter`
 * capability. Activation is trivial (no I/O), so it can never fail — but it
 * still goes through the registry's isolated activation like any other plugin.
 */
export class AnkiExporterPlugin implements Plugin {
  readonly id = 'anki-exporter';
  readonly version = '1.0.0';
  readonly capabilities = ['exporter'] as const;

  activate(ctx: PluginContext): void {
    ctx.registerExporter(new AnkiExporter());
    ctx.log('registered Anki TSV exporter');
  }
}
