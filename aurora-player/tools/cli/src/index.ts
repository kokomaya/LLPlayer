#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { createDefaultRegistry } from '@aurora/dictionary';
import { FsrsScheduler } from '@aurora/learning';
import {
  openLearningDatabase,
  SqliteReviewRepository,
  SqliteVocabularyRepository,
} from '@aurora/storage';
import { isLearnCommand, runLearn, type LearnDeps } from './learn.js';
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
} else {
  process.exit(run(argv, io));
}
