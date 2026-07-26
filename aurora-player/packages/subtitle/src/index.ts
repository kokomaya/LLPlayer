// subtitle-core: parse multiple formats into a unified SubtitleDocument
// (plan/05 · subtitle). Zero platform dependencies.

export * from './model.js';
export * from './text-util.js';
export * from './copy-text.js';
export * from './parser.js';
export * from './provider.js';
export { SrtParser } from './parsers/srt-parser.js';
export { VttParser } from './parsers/vtt-parser.js';
export { AssParser } from './parsers/ass-parser.js';
export { LrcParser } from './parsers/lrc-parser.js';
export { WhisperJsonParser } from './parsers/whisper-json-parser.js';
export { WhisperXJsonParser } from './parsers/whisperx-json-parser.js';

import { ParserRegistry } from './parser.js';
import { SrtParser } from './parsers/srt-parser.js';
import { VttParser } from './parsers/vtt-parser.js';
import { AssParser } from './parsers/ass-parser.js';
import { LrcParser } from './parsers/lrc-parser.js';
import { WhisperJsonParser } from './parsers/whisper-json-parser.js';
import { WhisperXJsonParser } from './parsers/whisperx-json-parser.js';

/**
 * A registry pre-loaded with all six supported formats (plan/05 · subtitle).
 * Order matters where `canParse` can overlap: WhisperX is tried before plain
 * Whisper (both claim `.json`) so the word-aligned variant wins.
 */
export const createDefaultRegistry = (): ParserRegistry =>
  new ParserRegistry()
    .register(new SrtParser())
    .register(new VttParser())
    .register(new AssParser())
    .register(new LrcParser())
    .register(new WhisperXJsonParser())
    .register(new WhisperJsonParser());
