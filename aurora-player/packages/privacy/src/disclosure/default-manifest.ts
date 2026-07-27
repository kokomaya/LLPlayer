import type { ProcessingManifest } from './manifest.js';

/**
 * The app's default data-use disclosure (plan/12 · Art.13/14 + Art.30). One
 * record per online / analytics capability the app can gate on, so the consent
 * screen and `aurora privacy disclose` can show an honest "what we do with data
 * and why". Offline capabilities (local playback, on-device subtitle parsing,
 * FSRS scheduling, local vocab storage) require no data use, so they carry no
 * record here — nothing to disclose.
 *
 * Every use listed here must line up with an actual runtime gate (see
 * `ONLINE_DATA_USES` / `TELEMETRY_DATA_USES`); the invariant test proves the
 * "purpose limitation" red line — the manifest discloses every use a gate can
 * require. Metadata only: capability ↔ uses ↔ purpose ↔ retention (①.E).
 */
export const DEFAULT_PROCESSING_MANIFEST: ProcessingManifest = [
  {
    capability: 'streaming-playback',
    uses: ['network'],
    purpose:
      'Stream video from a URL you choose so it can be played without downloading first.',
  },
  {
    capability: 'online-dictionary',
    uses: ['network', 'third-party'],
    purpose:
      'Look up a selected word in an online dictionary provider to show its definition.',
  },
  {
    capability: 'online-ai',
    uses: ['network', 'third-party'],
    purpose:
      'Translate or explain text via an online language model; results are cached locally to avoid repeat calls.',
    retentionDays: 30,
  },
  {
    capability: 'marketplace',
    uses: ['network', 'third-party'],
    purpose:
      'Browse and upload learnable media packages (video reference + subtitles + metadata only) to the marketplace.',
  },
  {
    capability: 'telemetry',
    uses: ['telemetry'],
    purpose:
      'Report anonymous, non-PII usage counters to improve the app; opt-in and off by default.',
    retentionDays: 90,
  },
];
