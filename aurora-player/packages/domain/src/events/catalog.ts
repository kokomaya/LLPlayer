import type { DomainEvent } from './domain-event.js';

/** A lightweight track descriptor carried by `MediaOpened`. */
export interface TrackRef {
  readonly id: string;
  readonly kind: 'audio' | 'video' | 'subtitle';
  readonly language?: string;
  readonly label?: string;
}

/**
 * The initial event catalog (plan/03 §5.2). Each entry maps an event `type`
 * (the past-tense name) to its immutable payload. Adding an event = adding a
 * key here; consumers get full type-safety through {@link EventBus}.
 */
export interface EventPayloads {
  MediaOpened: {
    readonly mediaId: string;
    readonly durationMs: number;
    readonly tracks: readonly TrackRef[];
  };
  PositionChanged: {
    readonly positionMs: number;
  };
  SubtitleLineActivated: {
    readonly lineId: string;
    readonly text: string;
  };
  WordSelected: {
    readonly word: string;
    readonly lemma?: string;
    readonly context: string;
    readonly timeMs: number;
  };
  TranslationReady: {
    readonly lineId: string;
    readonly text: string;
    readonly provider: string;
  };
  WordAddedToVocabulary: {
    readonly wordId: string;
    readonly difficulty: number;
  };
  ReviewGraded: {
    readonly cardId: string;
    readonly rating: number;
  };
  PluginRegistered: {
    readonly pluginId: string;
    readonly capabilities: readonly string[];
  };
}

export type EventType = keyof EventPayloads;

export type DomainEventOf<K extends EventType> = DomainEvent<K, EventPayloads[K]>;

/** Union of every catalogued event. */
export type AnyDomainEvent = { [K in EventType]: DomainEventOf<K> }[EventType];

/**
 * Constructs a fully-typed domain event. `occurredAt` defaults to now but may be
 * supplied for deterministic tests.
 */
export const createEvent = <K extends EventType>(
  type: K,
  payload: EventPayloads[K],
  occurredAt: number = Date.now(),
): DomainEventOf<K> => ({ type, occurredAt, payload });
