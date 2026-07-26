// plugins-core: the plugin protocol, a registry that activates plugins with
// error isolation and indexes them by capability (OCP), and two bundled plugins
// — an offline Whisper `ISubtitleProvider` and an Anki `IExporter`. Pure TS;
// depends only on the kernel and the subtitle domain package. Real ASR lives
// behind `.example.ts` (needs a model/runtime — plan/05 · plugins, plan/07 · M5).

export type {
  Capability,
  DistributionMeta,
  Platform,
  Plugin,
  PluginContext,
} from './plugin.js';
export {
  DESKTOP_PROFILE,
  IOS_PROFILE,
  PLAY_PROFILE,
  SIDELOAD_PROFILE,
  exclusionReason,
  isAllowedUnder,
  type DistributionProfile,
} from './distribution/policy.js';
export {
  PluginRegistry,
  type ActivationFailure,
  type ActivationReport,
  type ActivationSkip,
  type RegistryOptions,
} from './registry.js';

export type { ExportInput, IExporter } from './exporter/port.js';
export { AnkiExporter, AnkiExporterPlugin } from './exporter/anki-exporter.js';

export type { IMediaImporter, ImportedMedia, MediaRef } from './importer/port.js';
export {
  ManifestMediaImporter,
  MediaImporterPlugin,
} from './importer/manifest-importer.js';

export {
  OfflineWhisperProvider,
  WhisperPlugin,
} from './whisper/offline-whisper-provider.js';
