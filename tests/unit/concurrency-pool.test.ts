import { describe, it, expect } from 'vitest';
import { ConcurrencyPool } from '../../src/sub-agent/pool.js';

describe('ConcurrencyPool', () => {
  it('should limit concurrent executions', async () => {
    const pool = new ConcurrencyPool(2);
    let concurrent = 0;
    let maxConcurrent = 0;

    const task = () =>
      pool.run(async () => {
        concurrent++;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        await new Promise((r) => setTimeout(r, 50));
        concurrent--;
        return 'done';
      });

    const results = await Promise.all([task(), task(), task(), task(), task()]);

    expect(maxConcurrent).toBeLessThanOrEqual(2);
    expect(results).toHaveLength(5);
    expect(results.every((r) => r === 'done')).toBe(true);
  });

  it('should track active and pending counts', async () => {
    const pool = new ConcurrencyPool(1);
    let resolveFirst: () => void;
    const firstBlocking = new Promise<void>((r) => { resolveFirst = r; });

    const p1 = pool.run(() => firstBlocking);
    const p2 = pool.run(async () => 'second');

    // Give microtasks time to settle
    await new Promise((r) => setTimeout(r, 10));

    expect(pool.active).toBe(1);
    expect(pool.pending).toBe(1);

    resolveFirst!();
    await Promise.all([p1, p2]);

    expect(pool.active).toBe(0);
    expect(pool.pending).toBe(0);
  });
});
