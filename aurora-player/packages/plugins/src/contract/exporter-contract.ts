import { describe, expect, it } from 'vitest';
import type { ExportInput, IExporter } from '../exporter/port.js';

/**
 * Reusable behaviour spec for {@link IExporter} implementations (plan/09 §1). Any
 * exporter — Anki now, CSV/Quizlet later — must pass this suite, proving it is a
 * pure, deterministic, substitutable transform (LSP): same input → same string,
 * one output record per entry, and empty input → empty output.
 */
export interface ExporterContractCase {
  readonly name: string;
  readonly makeExporter: () => IExporter;
  readonly sample: ExportInput;
}

export const runExporterContract = (testCase: ExporterContractCase): void => {
  describe(`IExporter contract: ${testCase.name}`, () => {
    it('exposes a non-empty id and format', () => {
      const exporter = testCase.makeExporter();
      expect(exporter.id.length).toBeGreaterThan(0);
      expect(exporter.format.length).toBeGreaterThan(0);
    });

    it('is pure — same input yields byte-identical output', () => {
      const a = testCase.makeExporter().export(testCase.sample);
      const b = testCase.makeExporter().export(testCase.sample);
      expect(b).toBe(a);
    });

    it('emits one record per entry', () => {
      const out = testCase.makeExporter().export(testCase.sample);
      const records = out === '' ? [] : out.split('\n');
      expect(records.length).toBe(testCase.sample.entries.length);
    });

    it('returns empty output for empty input', () => {
      const out = testCase.makeExporter().export({ entries: [] });
      expect(out).toBe('');
    });
  });
};
