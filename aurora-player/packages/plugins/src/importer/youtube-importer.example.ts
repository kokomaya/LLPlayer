// Reference-only: the REAL media importer. Excluded from tsconfig/vitest and CI
// because it needs the network + an external binary (yt-dlp/youtube-dl) and may
// need cookies/tokens (plan/07 · M5; rules ①.C.12, ①.E). It is the OCP proof
// that a real source drops in behind the same `IMediaImporter` the offline
// manifest importer implements — no core/use-case change.
//
// ⚠️ PLAY (mobile) BUILD EXCLUSION (rule ①.F.20, plan/12-legal-privacy): YouTube
// download / side-loading violates store policy, so this capability MUST be
// stripped from the Play(mobile) build — it ships only on desktop / side-load or
// stays here as a `.example` reference. Any cookie/token/API key comes from the
// environment or an untracked file — NEVER committed (rule ①.E). Validate on a
// real machine, not in CI. This file is prose, not part of the typechecked graph.
//
// Its plugin wrapper (kept out of this file so nothing here compiles) should
// declare `distribution: { storeSafe: false, platforms: ['desktop', 'sideload'] }`
// so the build-profile gate — `isAllowedUnder` in `distribution/policy.ts`, wired
// into `PluginRegistry.activateAll` — excludes it under the `play`/`ios` profile
// at activation time. That turns rule ①.F.20 from "left uncompiled" into a
// *testable* runtime gate (see registry.test.ts / cli distribution.test.ts).
//
// TWO GATES, COMPLEMENTARY (plan/12 · legal-privacy): the build-profile gate
// above decides whether this capability may SHIP in a given build. At RUNTIME it
// must ALSO pass the consent gate — it needs `required: ['network','third-party']`
// (== `ONLINE_DATA_USES` in `@aurora/privacy`), so `isPermitted(required, state)`
// must be true before `import` runs. See the CLI `fetch` command (consent.ts /
// consent.test.ts) for the deny→grant→allow demonstration of this same shape.

import {
  createDefaultRegistry,
  type SubtitleDocument,
} from '@aurora/subtitle';
import type { IMediaImporter, ImportedMedia, MediaRef } from './port.js';

// e.g. a thin wrapper over `yt-dlp --dump-json --write-auto-subs …`.
declare const ytDlp: (url: string) => Promise<{
  id: string;
  title: string;
  duration: number; // seconds
  // { lang: [{ ext: 'vtt'|'srt', data: string }] }
  subtitles: Record<string, { ext: string; data: string }[]>;
}>;

const YOUTUBE = /(?:youtube\.com\/watch\?v=|youtu\.be\/)/i;

export class YouTubeImporter implements IMediaImporter {
  readonly id = 'youtube';

  canImport(ref: MediaRef): boolean {
    return YOUTUBE.test(ref.uri);
  }

  async import(ref: MediaRef): Promise<ImportedMedia> {
    // Network fetch by URI — ignores `ref.content` (rule ①.E: no cookie in repo;
    // read auth from env inside the `ytDlp` binding).
    const info = await ytDlp(ref.uri);
    const registry = createDefaultRegistry();
    const tracks: SubtitleDocument[] = [];
    for (const variants of Object.values(info.subtitles)) {
      const best = variants[0];
      if (!best) {
        continue;
      }
      const parsed = registry.parse({
        content: best.data,
        filename: `sub.${best.ext}`,
      });
      if (parsed.ok) {
        tracks.push(parsed.value);
      }
    }
    // Shape identical to the offline importer so the same contract, timeline,
    // and learning loop consume it unchanged (OCP/LSP).
    return {
      mediaId: info.id,
      title: info.title,
      durationMs: info.duration * 1000,
      subtitleTracks: tracks,
    };
  }
}
