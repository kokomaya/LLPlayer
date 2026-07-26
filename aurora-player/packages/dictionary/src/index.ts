// dictionary-core: a provider port, an ordered registry (OCP), and a bundled
// offline provider. Online/API providers live in the composition root — they
// need network + keys and stay out of the pure core (plan/05 · dictionary).

export type {
  DictionaryEntry,
  DictionarySense,
  IDictionaryProvider,
} from './port.js';
export { DictionaryRegistry } from './registry.js';
export { createDefaultRegistry } from './default-registry.js';
export { StaticDictionaryProvider } from './providers/static-dictionary-provider.js';
export { BUILTIN_EN } from './providers/builtin-data.js';
