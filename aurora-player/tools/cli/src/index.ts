#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { StaticLLMProvider } from '@aurora/ai';
import { createDefaultRegistry } from '@aurora/dictionary';
import { FsrsScheduler } from '@aurora/learning';
import {
  AnkiExporterPlugin,
  MediaImporterPlugin,
  PluginRegistry,
  WhisperPlugin,
} from '@aurora/plugins';
import {
  openLearningDatabase,
  SqliteCacheRepository,
  SqliteConsentRepository,
  SqliteReviewRepository,
  SqliteVocabularyRepository,
} from '@aurora/storage';
import { isAiCommand, runAi, type AiDeps } from './ai.js';
import { isConsentCommand, runConsent, type ConsentDeps } from './consent.js';
import { isLearnCommand, runLearn, type LearnDeps } from './learn.js';
import { isPluginsCommand, runPlugins, type PluginsDeps } from './plugins.js';
import { run, type CliIO } from './run.js';

// Composition root: bind the CLI to real Node I/O and concrete adapters, then
// run it. This is the ONLY place platform code (fs, sqlite, the wall clock) is
// wired to the pure cores.
const io: CliIO = {
  readFile: (path) => readFileSync(path, 'utf8'),
  write: (text) => process.stdout.write(text),
  writeError: (text) => process.stderr.write(text),
};

const argv = process.argv.slice(2);

if (isLearnCommand(argv[0])) {
  const db = openLearningDatabase(process.env.AURORA_DB ?? 'aurora.db');
  const deps: LearnDeps = {
    dictionary: createDefaultRegistry(),
    vocab: new SqliteVocabularyRepository(db),
    reviews: new SqliteReviewRepository(db),
    scheduler: new FsrsScheduler(),
    now: () => Date.now(),
  };
  runLearn(argv, io, deps)
    .then((code) => {
      db.close();
      process.exit(code);
    })
    .catch((cause: unknown) => {
      db.close();
      io.writeError(`error: ${(cause as Error).message}\n`);
      process.exit(1);
    });
} else if (isAiCommand(argv[0])) {
  const db = openLearningDatabase(process.env.AURORA_DB ?? 'aurora.db');
  // Default offline: no API key in the repo (rule §E). An online provider is
  // wired here off-CI from `packages/ai/src/providers/*.example.ts` using a key
  // read from the environment; the cache dedupes both.
  const deps: AiDeps = {
    offline: new StaticLLMProvider(),
    cache: new SqliteCacheRepository(db),
    now: () => Date.now(),
  };
  runAi(argv, io, deps)
    .then((code) => {
      db.close();
      process.exit(code);
    })
    .catch((cause: unknown) => {
      db.close();
      io.writeError(`error: ${(cause as Error).message}\n`);
      process.exit(1);
    });
} else if (isConsentCommand(argv[0])) {
  const db = openLearningDatabase(process.env.AURORA_DB ?? 'aurora.db');
  // Persist consent in SQLite (consent table, migration v3). The gated `fetch`
  // demo's real online binding is injected here off-CI (reads auth from the
  // environment, rule §E); the default stand-in keeps the CLI offline.
  const deps: ConsentDeps = {
    consent: new SqliteConsentRepository(db),
    now: () => Date.now(),
  };
  runConsent(argv, io, deps)
    .then((code) => {
      db.close();
      process.exit(code);
    })
    .catch((cause: unknown) => {
      db.close();
      io.writeError(`error: ${(cause as Error).message}\n`);
      process.exit(1);
    });
} else if (isPluginsCommand(argv[0])) {
  const db = openLearningDatabase(process.env.AURORA_DB ?? 'aurora.db');
  // Assemble the plugin registry from the bundled offline plugins only — no
  // model, no network, no key (rules §C.12/§E). A real ASR engine registers here
  // off-CI from whisper/*.example.ts. `activateAll` (in runPlugins) isolates any
  // plugin that fails so the rest stay usable.
  const registry = new PluginRegistry({ logger: (m) => io.writeError(`${m}\n`) })
    .register(new WhisperPlugin())
    .register(new AnkiExporterPlugin())
    .register(new MediaImporterPlugin());
  const deps: PluginsDeps = {
    registry,
    vocab: new SqliteVocabularyRepository(db),
    writeFile: (path, data) => writeFileSync(path, data, 'utf8'),
  };
  runPlugins(argv, io, deps)
    .then((code) => {
      db.close();
      process.exit(code);
    })
    .catch((cause: unknown) => {
      db.close();
      io.writeError(`error: ${(cause as Error).message}\n`);
      process.exit(1);
    });
} else {
  process.exit(run(argv, io));
}
