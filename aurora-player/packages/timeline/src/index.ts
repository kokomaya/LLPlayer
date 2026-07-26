// timeline-core: a sentence-level cursor over timed lines, ported from
// FlyleafLib's SubManager. Zero platform dependencies (plan/05 · timeline).

export * from './model.js';
export { locateByStart } from './binary-search.js';
export { SubtitleTimeline } from './timeline.js';
export { WordCursor } from './word-cursor.js';
export {
  wordSeek,
  nextWordSeekMs,
  prevWordSeekMs,
  type WordStep,
} from './word-step.js';
