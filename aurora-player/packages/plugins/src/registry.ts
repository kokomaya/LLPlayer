import type { ISubtitleProvider } from '@aurora/subtitle';
import {
  exclusionReason,
  isAllowedUnder,
  type DistributionProfile,
} from './distribution/policy.js';
import type { IExporter } from './exporter/port.js';
import type { IMediaImporter } from './importer/port.js';
import type { Capability, Plugin, PluginContext } from './plugin.js';

/** One plugin that failed to activate, with the error it raised. */
export interface ActivationFailure {
  readonly pluginId: string;
  readonly error: Error;
}

/** One plugin the build-profile gate excluded before activation (plan/12). */
export interface ActivationSkip {
  readonly pluginId: string;
  readonly reason: string;
}

/** Outcome of {@link PluginRegistry.activateAll}: who came up, who didn't. */
export interface ActivationReport {
  readonly activated: readonly string[];
  readonly failures: readonly ActivationFailure[];
  /** Plugins excluded by the build profile (never attempted). */
  readonly skipped: readonly ActivationSkip[];
}

/** Optional host hooks (DIP): diagnostics go here instead of the console. */
export interface RegistryOptions {
  readonly logger?: (message: string) => void;
  /**
   * The build profile to gate activation against (plan/12; rule ①.F.20). When
   * set, a plugin whose {@link Plugin.distribution} is not
   * {@link isAllowedUnder} this profile is excluded before activation. Absent ⇒
   * no gating (every plugin is eligible). {@link activateAll} accepts a
   * per-call override.
   */
  readonly profile?: DistributionProfile;
}

/**
 * Registers plugins and activates them with **error isolation** (plan/05 ·
 * plugins "错误隔离"): one plugin throwing from `activate` never prevents the
 * others from coming up, and its half-done registrations are discarded rather
 * than half-committed. Discovered implementations are indexed by capability so
 * the host asks for "a subtitle provider" / "an exporter" — not a named
 * backend (OCP). Adding a capability is adding a plugin; the registry is closed
 * for modification.
 */
export class PluginRegistry {
  readonly #plugins: Plugin[] = [];
  readonly #subtitleProviders: ISubtitleProvider[] = [];
  readonly #exporters: IExporter[] = [];
  readonly #mediaImporters: IMediaImporter[] = [];
  readonly #logger: (message: string) => void;
  readonly #profile: DistributionProfile | undefined;

  constructor(options: RegistryOptions = {}) {
    this.#logger = options.logger ?? (() => undefined);
    this.#profile = options.profile;
  }

  /** Add a plugin. Idempotent-friendly: registration order is preserved. */
  register(plugin: Plugin): this {
    this.#plugins.push(plugin);
    return this;
  }

  /** All registered plugins, in registration order. */
  discover(): readonly Plugin[] {
    return this.#plugins;
  }

  /** Plugins declaring `capability`. */
  get(capability: Capability): readonly Plugin[] {
    return this.#plugins.filter((p) => p.capabilities.includes(capability));
  }

  subtitleProviders(): readonly ISubtitleProvider[] {
    return this.#subtitleProviders;
  }

  exporters(): readonly IExporter[] {
    return this.#exporters;
  }

  mediaImporters(): readonly IMediaImporter[] {
    return this.#mediaImporters;
  }

  /**
   * Activate every registered plugin. Each gets a private, buffering context;
   * only on a clean (resolved) `activate` are its registrations committed. A
   * throw/rejection is caught, recorded, logged, and its buffer dropped — the
   * remaining plugins are unaffected.
   *
   * If a build `profile` is in effect (constructor option or the `override`
   * argument, which wins), a plugin the profile disallows is **skipped before
   * activation** — never attempted, its capabilities never registered — and
   * recorded in {@link ActivationReport.skipped}. This is the build-profile
   * capability gate (plan/12; rule ①.F.20); it is orthogonal to and leaves the
   * error-isolation path untouched.
   */
  async activateAll(
    override?: DistributionProfile,
  ): Promise<ActivationReport> {
    const profile = override ?? this.#profile;
    const activated: string[] = [];
    const failures: ActivationFailure[] = [];
    const skipped: ActivationSkip[] = [];

    for (const plugin of this.#plugins) {
      if (profile !== undefined && !isAllowedUnder(plugin.distribution, profile)) {
        const reason = exclusionReason(plugin.distribution, profile);
        skipped.push({ pluginId: plugin.id, reason });
        this.#logger(`[${plugin.id}] excluded (${profile.platform}): ${reason}`);
        continue;
      }
      const providers: ISubtitleProvider[] = [];
      const exporters: IExporter[] = [];
      const importers: IMediaImporter[] = [];
      const ctx: PluginContext = {
        registerSubtitleProvider: (p) => providers.push(p),
        registerExporter: (e) => exporters.push(e),
        registerMediaImporter: (im) => importers.push(im),
        log: (m) => this.#logger(`[${plugin.id}] ${m}`),
      };
      try {
        await plugin.activate(ctx);
        this.#subtitleProviders.push(...providers);
        this.#exporters.push(...exporters);
        this.#mediaImporters.push(...importers);
        activated.push(plugin.id);
      } catch (cause) {
        const error = cause instanceof Error ? cause : new Error(String(cause));
        failures.push({ pluginId: plugin.id, error });
        this.#logger(`[${plugin.id}] activate failed: ${error.message}`);
      }
    }

    return { activated, failures, skipped };
  }
}
