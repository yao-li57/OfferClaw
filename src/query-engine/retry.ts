import { classifyError, QueryEngineError } from './errors.js';

export interface RetryOptions {
  maxRetries?: number;
  baseDelay?: number;
  maxDelay?: number;
}

const DEFAULTS: Required<RetryOptions> = {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 30000,
};

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts?: RetryOptions,
): Promise<T> {
  const { maxRetries, baseDelay, maxDelay } = { ...DEFAULTS, ...opts };

  let lastError: QueryEngineError | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = classifyError(err);

      if (!lastError.retryable || attempt === maxRetries) {
        throw lastError;
      }

      const jitter = Math.random() * 0.3 + 0.85;
      const delay = Math.min(
        lastError.retryAfterMs ?? baseDelay * 2 ** attempt * jitter,
        maxDelay,
      );

      await sleep(delay);
    }
  }

  throw lastError;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
