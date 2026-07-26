import type { IPlayer } from '@aurora/player-api';
import type { CopyTextOptions, SubtitleDocument, SubtitleLine } from '@aurora/subtitle';
import { copyLineText, copyLinesText } from '@aurora/subtitle';
import type { JumpDirection, WordStep } from '@aurora/timeline';
import { wordSeek } from '@aurora/timeline';

// Headless glue for Epic A's three learning gestures, so the device UI stays a
// dumb button-to-callback layer (plan/05 — no logic in `*.tsx`):
//   • 按词快进快退 — stepWord(): compute a word-level seek target and drive it.
//   • 复制字幕     — copyActiveLineText()/copyAllText(): build clipboard strings.
// The runtime's `<Video>` binding calls these; all decisions live here and are
// Node-testable. `SubtitleDocument.lines` are structurally {@link
// import('@aurora/timeline').TimedLine}s, so they feed `wordSeek` directly.

/** The learning gestures a subtitle-aware player screen offers. */
export interface LearningControls {
  /**
   * Seek to the previous/next word relative to the live playback position and
   * return the word landed on (or `null` at a boundary / when there are no
   * words). A pure no-op on the player when it returns `null`.
   */
  stepWord(direction: JumpDirection): WordStep | null;
  /**
   * Copyable text for the line under the playhead right now, or `null` when the
   * playhead sits in a gap between lines.
   */
  copyActiveLineText(options?: CopyTextOptions): string | null;
  /** Copyable text for the whole document (e.g. an "export transcript" action). */
  copyAllText(options?: CopyTextOptions): string;
}

/**
 * Build {@link LearningControls} bound to a live `player` and a parsed
 * `document`. Reads the position from the player on demand (`player.position()`)
 * so it always acts on the current playhead without tracking state itself.
 */
export const createLearningControls = (
  player: IPlayer,
  document: SubtitleDocument,
): LearningControls => {
  const { lines } = document;

  const activeLine = (timeMs: number): SubtitleLine | null =>
    lines.find((line) => timeMs >= line.range.startMs && timeMs <= line.range.endMs) ?? null;

  return {
    stepWord: (direction) => {
      const step = wordSeek(lines, player.position(), direction);
      if (step !== null) {
        void player.seek(step.targetMs);
      }
      return step;
    },
    copyActiveLineText: (options) => {
      const line = activeLine(player.position());
      return line === null ? null : copyLineText(line, options);
    },
    copyAllText: (options) => copyLinesText(lines, options),
  };
};
