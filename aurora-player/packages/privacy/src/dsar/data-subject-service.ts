import type {
  ConsentRepository,
  DataExport,
  ReviewRepository,
  VocabularyRepository,
} from '@aurora/domain';
import { dataExport } from '@aurora/domain';
import {
  isSupportedVersion,
  UnsupportedSnapshotVersionError,
  type DataImportOptions,
  type DataImportReport,
} from './import.js';

/**
 * The kernel repository ports a {@link DataSubjectService} coordinates. All three
 * live in the kernel, so this service — and `@aurora/privacy` as a whole — stays
 * kernel-only and never depends on `@aurora/storage` (rule ①.A.2). The concrete
 * adapters are injected at the composition root (DIP).
 */
export interface DataSubjectRepositories {
  readonly vocab: VocabularyRepository;
  readonly reviews: ReviewRepository;
  readonly consent: ConsentRepository;
}

/**
 * Data-subject rights over the user's own data (plan/12 · legal-privacy: right of
 * access / data portability / right to erasure). A pure coordinator with no
 * clock, network, or platform dependency: it reads across the repositories to
 * assemble a portable {@link DataExport}, and wipes them for a "delete all my
 * data" request.
 *
 * It reuses the existing repository ports rather than reaching into storage
 * internals, so both the in-memory and SQLite adapters work unchanged, and the
 * export can only ever contain user data — there is no field or code path here
 * for secrets or backend credentials (rule ①.E, enforced by {@link DataExport}).
 */
export class DataSubjectService {
  readonly #repos: DataSubjectRepositories;

  constructor(repos: DataSubjectRepositories) {
    this.#repos = repos;
  }

  /**
   * Build a portable snapshot of everything the user has produced, stamped with
   * the injected `exportedAt` (rule ①.C.13) so the result is deterministic. The
   * reads run concurrently; consent records are drawn from the current state.
   */
  async export(exportedAt: number): Promise<DataExport> {
    const [vocab, reviews, consent] = await Promise.all([
      this.#repos.vocab.list(),
      this.#repos.reviews.list(),
      this.#repos.consent.load(),
    ]);
    return dataExport(exportedAt, {
      vocab,
      reviews,
      consent: [...consent.values()],
    });
  }

  /**
   * Erase all of the user's data across every repository (right to erasure).
   * Idempotent — erasing an already-empty store is a no-op. There is nothing to
   * timestamp: the records, including consent, are removed rather than annotated.
   */
  async erase(): Promise<void> {
    await Promise.all([
      this.#repos.vocab.clear(),
      this.#repos.reviews.clear(),
      this.#repos.consent.clear(),
    ]);
  }

  /**
   * Import a portable {@link DataExport} back into the repositories — the other
   * half of data portability (GDPR Art.20): a snapshot exported on one device
   * can be carried onto another. The version is checked first; an unsupported
   * one is rejected ({@link UnsupportedSnapshotVersionError}) rather than
   * mis-read.
   *
   * Merge (default) is idempotent: each record is `upsert`ed by id, so importing
   * the same snapshot twice leaves the same store, and pre-existing data not in
   * the snapshot is kept. `replace` erases everything first, making the snapshot
   * the whole store. Consent is restored faithfully — a granted record is
   * granted, a revoked one revoked — so an export→import round-trip is exact.
   *
   * Only the user's own data fields are written; there is no path here to write
   * credentials, keys, or config from external input (rule ①.E).
   */
  async import(
    snapshot: DataExport,
    options: DataImportOptions = {},
  ): Promise<DataImportReport> {
    if (!isSupportedVersion(snapshot.version)) {
      throw new UnsupportedSnapshotVersionError(snapshot.version);
    }
    const replace = options.replace ?? false;
    if (replace) {
      await this.erase();
    }
    await Promise.all([
      ...snapshot.vocab.map((entry) => this.#repos.vocab.upsert(entry)),
      ...snapshot.reviews.map((card) => this.#repos.reviews.upsert(card)),
      ...snapshot.consent.map((record) =>
        record.granted
          ? this.#repos.consent.grant(record.use, record.at)
          : this.#repos.consent.revoke(record.use, record.at),
      ),
    ]);
    return {
      version: snapshot.version,
      importedVocab: snapshot.vocab.length,
      importedReviews: snapshot.reviews.length,
      importedConsent: snapshot.consent.length,
      replaced: replace,
    };
  }
}
