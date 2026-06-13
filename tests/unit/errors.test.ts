import { describe, it, expect } from 'vitest';
import { classifyError, QueryEngineError } from '../../src/query-engine/errors.js';

describe('classifyError', () => {
  it('should pass through QueryEngineError', () => {
    const original = new QueryEngineError('test', 'auth', false);
    expect(classifyError(original)).toBe(original);
  });

  it('should classify 429 as rate_limit', () => {
    const err = { status: 429, message: 'too many requests', headers: { 'retry-after': '10' } };
    const result = classifyError(err);
    expect(result.category).toBe('rate_limit');
    expect(result.retryable).toBe(true);
    expect(result.retryAfterMs).toBe(10000);
  });

  it('should classify 529 as overloaded', () => {
    const err = { status: 529, message: 'overloaded' };
    const result = classifyError(err);
    expect(result.category).toBe('overloaded');
    expect(result.retryable).toBe(true);
  });

  it('should classify 401 as auth', () => {
    const err = { status: 401, message: 'unauthorized' };
    const result = classifyError(err);
    expect(result.category).toBe('auth');
    expect(result.retryable).toBe(false);
  });

  it('should classify 400 with context mention as context_length', () => {
    const err = { status: 400, message: 'context window exceeded' };
    const result = classifyError(err);
    expect(result.category).toBe('context_length');
  });

  it('should classify timeout errors', () => {
    const err = new Error('Request timeout');
    const result = classifyError(err);
    expect(result.category).toBe('timeout');
    expect(result.retryable).toBe(true);
  });

  it('should classify unknown errors as non-retryable', () => {
    const err = new Error('something unexpected');
    const result = classifyError(err);
    expect(result.category).toBe('unknown');
    expect(result.retryable).toBe(false);
  });
});
