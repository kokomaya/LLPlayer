#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { run, type CliIO } from './run.js';

// Composition root: bind the CLI to real Node I/O and run it.
const io: CliIO = {
  readFile: (path) => readFileSync(path, 'utf8'),
  write: (text) => process.stdout.write(text),
  writeError: (text) => process.stderr.write(text),
};

process.exit(run(process.argv.slice(2), io));
