// Shared kernel: value objects, Result, errors, and the event contracts every
// core package depends on. Zero platform dependencies (plan/05 · domain).

export * from './result.js';
export * from './errors.js';

export * from './value-objects/time-range.js';
export * from './value-objects/timestamp.js';
export * from './value-objects/language-code.js';
export * from './value-objects/lemma.js';

export * from './events/domain-event.js';
export * from './events/catalog.js';
export * from './events/event-bus.js';

export * from './learning/rating.js';
export * from './learning/cards.js';
export * from './learning/repositories.js';

export * from './ai/cache.js';

export * from './privacy/consent.js';
export * from './privacy/repository.js';

export * from './telemetry/event.js';
export * from './telemetry/sink.js';

export * from './dsar/export.js';

export * from './media/package.js';
export * from './media/catalog.js';
