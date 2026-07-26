/**
 * A minimal, dependency-free `Result` type for explicit success/failure flow
 * without exceptions. Ports the intent of C# `TryParse`/nullable returns into a
 * type-safe discriminated union used across the core packages.
 */
export type Result<T, E = Error> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });

export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });

export const isOk = <T, E>(
  result: Result<T, E>,
): result is { readonly ok: true; readonly value: T } => result.ok;

export const isErr = <T, E>(
  result: Result<T, E>,
): result is { readonly ok: false; readonly error: E } => !result.ok;

export const map = <T, E, U>(
  result: Result<T, E>,
  fn: (value: T) => U,
): Result<U, E> => (result.ok ? ok(fn(result.value)) : result);

export const mapErr = <T, E, F>(
  result: Result<T, E>,
  fn: (error: E) => F,
): Result<T, F> => (result.ok ? result : err(fn(result.error)));

export const unwrapOr = <T, E>(result: Result<T, E>, fallback: T): T =>
  result.ok ? result.value : fallback;

/** Throws the contained error (or a wrapper) when the result is not ok. */
export const unwrap = <T, E>(result: Result<T, E>): T => {
  if (result.ok) {
    return result.value;
  }
  throw result.error instanceof Error
    ? result.error
    : new Error(String(result.error));
};
