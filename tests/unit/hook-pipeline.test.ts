import { describe, it, expect } from 'vitest';
import { HookPipeline } from '../../src/hooks/pipeline.js';
import { inputSanitizerHook } from '../../src/hooks/builtin/input-sanitizer.js';
import { tokenCounterHook } from '../../src/hooks/builtin/token-counter.js';

describe('HookPipeline', () => {
  it('should run pre-tool hooks and sanitize input', async () => {
    const pipeline = new HookPipeline();
    pipeline.register(inputSanitizerHook);

    const result = await pipeline.runPreTool({
      sessionId: 'test',
      toolName: 'search_knowledge',
      input: { query: '  hello world  ', extra: 42 },
    });

    expect(result.proceed).toBe(true);
    expect(result.input.query).toBe('hello world');
    expect(result.input.extra).toBe(42);
  });

  it('should run post-tool hooks and add metadata', async () => {
    const pipeline = new HookPipeline();
    pipeline.register(tokenCounterHook);

    const result = await pipeline.runPostTool({
      sessionId: 'test',
      toolName: 'search_knowledge',
      input: {},
      result: { success: true, output: 'x'.repeat(100) },
    });

    expect(result.metadata?.estimatedOutputTokens).toBeGreaterThan(0);
  });

  it('should skip tool execution when hook says skip', async () => {
    const pipeline = new HookPipeline();
    pipeline.register({
      name: 'blocker',
      stage: 'pre-tool',
      priority: 1,
      async execute() {
        return { action: 'skip', reason: 'blocked for testing' };
      },
    });

    const result = await pipeline.runPreTool({
      sessionId: 'test',
      toolName: 'any_tool',
      input: {},
    });

    expect(result.proceed).toBe(false);
    expect(result.reason).toBe('blocked for testing');
  });
});
