/**
 * Domain error hierarchy. Errors are plain, platform-free classes so any core
 * package can throw/return them without pulling in a framework.
 */
export abstract class DomainError extends Error {
  abstract readonly code: string;

  protected constructor(message: string, options?: { cause?: unknown }) {
    super(message, options as ErrorOptions);
    this.name = new.target.name;
  }
}

/** Input failed a validation/invariant check (bad arguments, malformed value). */
export class ValidationError extends DomainError {
  override readonly code = 'VALIDATION';

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
  }
}

/** A required entity/record could not be found. */
export class NotFoundError extends DomainError {
  override readonly code = 'NOT_FOUND';

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
  }
}

/** Raw content could not be parsed into a domain model (e.g. a subtitle file). */
export class ParseError extends DomainError {
  override readonly code = 'PARSE';

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
  }
}
