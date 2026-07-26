/**
 * Base shape for all domain events: named in the past tense, immutable, pure
 * data, no behaviour (see plan/03 §5.1).
 */
export interface DomainEvent<
  TType extends string = string,
  TPayload = unknown,
> {
  readonly type: TType;
  /** Epoch milliseconds the event occurred. */
  readonly occurredAt: number;
  readonly payload: TPayload;
}
