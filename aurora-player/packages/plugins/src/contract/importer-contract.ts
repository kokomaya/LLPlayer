import type { SubtitleDocument } from '@aurora/subtitle';
import { describe, expect, it } from 'vitest';
import type { IMediaImporter, MediaRef } from '../importer/port.js';

/**
 * Reusable behaviour spec for {@link IMediaImporter} implementations (plan/09 §1
 * "contract tests"). Every source — the offline manifest importer now, a real
 * YouTube backend later — must pass this same suite so LSP is verifiable in CI:
 * `canImport` discriminates supported refs, and `import` yields a structurally
 * valid {@link ImportedMedia} whose subtitle tracks are well-formed
 * {@link SubtitleDocument}s the timeline/learning loop can consume unchanged.
 * Offline importers must also be deterministic (same ref → equal result).
 */
export interface MediaImporterContractCase {
  readonly name: string;
  readonly makeImporter: () => IMediaImporter;
  /** A ref this importer must accept. */
  readonly supported: MediaRef;
  /** A ref this importer must reject (a different source's scheme). */
  readonly unsupported: MediaRef;
  readonly minTracks?: number;
  /** True when the importer is offline/pure and must return equal results. */
  readonly deterministic?: boolean;
}

/** Assert a single subtitle track is a well-formed, start-sorted document. */
const expectValidTrack = (doc: SubtitleDocument): void => {
  const ids = new Set<string>();
  let prevStart = Number.NEGATIVE_INFINITY;
  let anyWords = false;
  for (const line of doc.lines) {
    expect(line.id.length).toBeGreaterThan(0);
    expect(ids.has(line.id)).toBe(false);
    ids.add(line.id);
    expect(line.range.endMs).toBeGreaterThanOrEqual(line.range.startMs);
    expect(line.range.startMs).toBeGreaterThanOrEqual(prevStart);
    prevStart = line.range.startMs;
    for (const word of line.words ?? []) {
      if (word.range) {
        anyWords = true;
        expect(word.range.endMs).toBeGreaterThanOrEqual(word.range.startMs);
        expect(word.range.startMs).toBeGreaterThanOrEqual(line.range.startMs);
        expect(word.range.endMs).toBeLessThanOrEqual(line.range.endMs);
      }
    }
  }
  expect(doc.hasWordTimings).toBe(anyWords);
  expect(doc.meta.format.length).toBeGreaterThan(0);
};

export const runMediaImporterContract = (
  testCase: MediaImporterContractCase,
): void => {
  describe(`IMediaImporter contract: ${testCase.name}`, () => {
    it('exposes a non-empty id', () => {
      expect(testCase.makeImporter().id.length).toBeGreaterThan(0);
    });

    it('accepts supported refs and rejects foreign ones', () => {
      const importer = testCase.makeImporter();
      expect(importer.canImport(testCase.supported)).toBe(true);
      expect(importer.canImport(testCase.unsupported)).toBe(false);
    });

    it('imports a structurally valid ImportedMedia', async () => {
      const media = await testCase.makeImporter().import(testCase.supported);
      expect(media.mediaId.length).toBeGreaterThan(0);
      expect(media.subtitleTracks.length).toBeGreaterThanOrEqual(
        testCase.minTracks ?? 1,
      );
      for (const track of media.subtitleTracks) {
        expectValidTrack(track);
      }
    });

    it('is deterministic — same ref yields an equal result', async () => {
      if (!testCase.deterministic) {
        return;
      }
      const a = await testCase.makeImporter().import(testCase.supported);
      const b = await testCase.makeImporter().import(testCase.supported);
      expect(b).toEqual(a);
    });
  });
};
