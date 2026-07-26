import { DictionaryRegistry } from './registry.js';
import { BUILTIN_EN } from './providers/builtin-data.js';
import { StaticDictionaryProvider } from './providers/static-dictionary-provider.js';

/**
 * A registry pre-loaded with the bundled offline English provider — the
 * zero-config default used by the CLI. Online providers are added at the
 * composition root (they need network/keys, kept out of the core).
 */
export const createDefaultRegistry = (): DictionaryRegistry =>
  new DictionaryRegistry().register(
    new StaticDictionaryProvider('builtin', BUILTIN_EN),
  );
