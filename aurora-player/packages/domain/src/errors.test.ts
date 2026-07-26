import { describe, expect, it } from 'vitest';
import {
  DomainError,
  NotFoundError,
  ParseError,
  ValidationError,
} from './errors.js';

describe('domain errors', () => {
  it('carry stable codes and names', () => {
    const v = new ValidationError('bad');
    const n = new NotFoundError('missing');
    const p = new ParseError('unparseable');
    expect(v.code).toBe('VALIDATION');
    expect(n.code).toBe('NOT_FOUND');
    expect(p.code).toBe('PARSE');
    expect(v.name).toBe('ValidationError');
  });

  it('are instances of DomainError and Error', () => {
    const v = new ValidationError('bad');
    expect(v).toBeInstanceOf(DomainError);
    expect(v).toBeInstanceOf(Error);
  });

  it('preserve the cause option', () => {
    const cause = new Error('root');
    const p = new ParseError('wrap', { cause });
    expect(p.cause).toBe(cause);
  });
});
