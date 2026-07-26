import type { ISubtitleProvider } from '@aurora/subtitle';
import type { IExporter } from './exporter/port.js';
import type { IMediaImporter } from './importer/port.js';

/**
 * The plugin capability taxonomy (plan/05 · plugins; plan/04 · capability
 * interfaces). A plugin declares which of these it contributes; the host indexes
 * plugins by capability so a feature (transcribe, export) is served by "whatever
 * plugin provides this capability" — never a hard-coded backend (OCP).
 */
export type Capability = 'subtitle-provider' | 'exporter' | 'media-importer';

/**
 * A build/distribution target a plugin can be shipped in (plan/12 · legal &
 * privacy). `play`/`ios` are store-constrained; `desktop`/`sideload` are not.
 */
export type Platform = 'play' | 'ios' | 'desktop' | 'sideload';

/**
 * Optional distribution constraints a plugin may declare (ISP: absent means
 * "ships everywhere"). Used by {@link isAllowedUnder} to gate activation per
 * build profile so store-policy-violating capabilities (e.g. YouTube download)
 * are excluded from the Play/App Store build (plan/12; rule ①.F.20) — a *testable*
 * gate rather than a "left uncompiled" `.example`. This is pure metadata: it
 * declares intent, it does not import any platform/build machinery.
 */
export interface DistributionMeta {
  /** `false` ⇒ violates store policy; excluded from store-constrained builds. */
  readonly storeSafe?: boolean;
  /** If set, the plugin ships ONLY on these platforms. */
  readonly platforms?: readonly Platform[];
}

/**
 * The seam a plugin uses to contribute concrete implementations during
 * {@link Plugin.activate}. Registrations made through the context are buffered by
 * the host and only committed if `activate` completes without throwing — so a
 * plugin that fails halfway contributes nothing (error isolation, plan/05).
 */
export interface PluginContext {
  registerSubtitleProvider(provider: ISubtitleProvider): void;
  registerExporter(exporter: IExporter): void;
  registerMediaImporter(importer: IMediaImporter): void;
  /** Diagnostic channel routed to the host logger, prefixed with the plugin id. */
  log(message: string): void;
}

/**
 * The plugin protocol (plan/05 · plugins): `{ id; version; capabilities;
 * activate; deactivate }`. `activate` wires the plugin's implementations into
 * the host via the {@link PluginContext}; `deactivate` (optional, ISP) releases
 * anything it acquired. Both may be async so a plugin can defer heavy setup.
 */
export interface Plugin {
  readonly id: string;
  readonly version: string;
  readonly capabilities: readonly Capability[];
  /**
   * Optional distribution constraints (ISP). Absent ⇒ ships in every build
   * profile (the case for the bundled offline plugins). Consulted by the
   * registry's build-profile gate (plan/12; rule ①.F.20).
   */
  readonly distribution?: DistributionMeta;
  activate(ctx: PluginContext): void | Promise<void>;
  deactivate?(): void | Promise<void>;
}
