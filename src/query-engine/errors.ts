export type ErrorCategory =
  | 'rate_limit'
  | 'overloaded'
  | 'timeout'
  | 'network'
  | 'invalid_request'
  | 'auth'
  | 'context_length'
  | 'unknown';

export class QueryEngineError extends Error {
  constructor(
    message: string,
    public category: ErrorCategory,
    public retryable: boolean,
    public retryAfterMs?: number,
  ) {
    super(message);
    this.name = 'QueryEngineError';
  }
}

export function classifyError(err: unknown): QueryEngineError {
  if (err instanceof QueryEngineError) return err;

  const message = err instanceof Error ? err.message : (err as any)?.message ?? String(err);
  const status = (err as any)?.status ?? (err as any)?.statusCode;

  if (status === 429) {
    const retryAfter = parseInt((err as any)?.headers?.['retry-after'] ?? '5') * 1000;
    return new QueryEngineError('Rate limited', 'rate_limit', true, retryAfter);
  }
  if (status === 529 || status === 503) {
    return new QueryEngineError('Overloaded', 'overloaded', true, 10000);
  }
  if (status === 400) {
    if (message.includes('context') || message.includes('token')) {
      return new QueryEngineError(message, 'context_length', false);
    }
    return new QueryEngineError(message, 'invalid_request', false);
  }
  if (status === 401 || status === 403) {
    return new QueryEngineError('Auth failed', 'auth', false);
  }
  if (message.includes('timeout') || message.includes('ETIMEDOUT')) {
    return new QueryEngineError('Timeout', 'timeout', true, 3000);
  }
  if (message.includes('ECONNREFUSED') || message.includes('fetch failed')) {
    return new QueryEngineError('Network error', 'network', true, 2000);
  }

  return new QueryEngineError(message, 'unknown', false);
}
