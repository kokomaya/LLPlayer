// storage-core: a model-agnostic key/value port plus adapters (in-memory,
// better-sqlite3) and a typed settings facade (plan/05 · storage).

export type { KeyValueStore } from './port.js';
export { SettingsRepository } from './settings-repository.js';
export { InMemoryKeyValueStore } from './adapters/in-memory-store.js';
export { SqliteKeyValueStore } from './adapters/sqlite-store.js';

// Learning-loop persistence (plan/05 · storage): vocab/review repositories over
// a versioned SQLite schema. The port interfaces live in the kernel
// (@aurora/domain); these are the platform-bound adapters.
export { InMemoryVocabularyRepository } from './adapters/in-memory-vocabulary-repository.js';
export { InMemoryReviewRepository } from './adapters/in-memory-review-repository.js';
export { SqliteVocabularyRepository } from './adapters/sqlite-vocabulary-repository.js';
export { SqliteReviewRepository } from './adapters/sqlite-review-repository.js';

// AI result cache (plan/05 · ai): implements the kernel CacheRepository port
// over memory / SQLite (ai_cache table, migration v2).
export { InMemoryCacheRepository } from './adapters/in-memory-cache-repository.js';
export { SqliteCacheRepository } from './adapters/sqlite-cache-repository.js';

// Media marketplace catalog (plan · 媒体市场 C3): implements the kernel
// ICatalogBackend port. The in-memory backend is the hermetic core impl; a real
// HTTP backend lives in `adapters/http-catalog-backend.example.ts` (off-CI).
export { InMemoryCatalog } from './adapters/in-memory-catalog.js';

// User consent persistence (plan/12 · legal-privacy): implements the kernel
// ConsentRepository port over memory / SQLite (consent table, migration v3).
export { InMemoryConsentRepository } from './adapters/in-memory-consent-repository.js';
export { SqliteConsentRepository } from './adapters/sqlite-consent-repository.js';
export type { Migration } from './migrations/migration-runner.js';
export { runMigrations } from './migrations/migration-runner.js';
export {
  LEARNING_MIGRATIONS,
  openLearningDatabase,
} from './migrations/learning-migrations.js';
