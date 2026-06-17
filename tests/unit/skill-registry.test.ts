import { describe, it, expect, vi } from 'vitest';
import { SkillRegistry } from '../../src/skills/registry.js';
import { fullDiagnosis } from '../../src/skills/builtin/full-diagnosis.js';
import { createSkillRegistry } from '../../src/skills/index.js';
import type { SkillContext } from '../../src/skills/types.js';
import type { QueryEngine } from '../../src/query-engine/engine.js';
import type { ToolRegistry } from '../../src/tools/registry.js';

const mockToolRegistry = {
  execute: vi.fn(),
  get: vi.fn(),
  has: vi.fn(),
  listSchemas: vi.fn(() => []),
  register: vi.fn(),
} as unknown as ToolRegistry;

const mockCtx: SkillContext = {
  queryEngine: {} as QueryEngine,
  toolRegistry: mockToolRegistry,
  sessionId: 'test',
};

describe('SkillRegistry', () => {
  it('registers and retrieves skills', () => {
    const registry = new SkillRegistry();
    registry.register(fullDiagnosis);
    expect(registry.has('full-diagnosis')).toBe(true);
    expect(registry.get('full-diagnosis')).toBe(fullDiagnosis);
  });

  it('createSkillRegistry registers all 3 built-in skills', () => {
    const registry = createSkillRegistry();
    expect(registry.has('full-diagnosis')).toBe(true);
    expect(registry.has('jd-full-analysis')).toBe(true);
    expect(registry.has('quick-mock')).toBe(true);
    expect(registry.list()).toHaveLength(3);
  });

  it('run yields step_failed for unknown skill', async () => {
    const registry = new SkillRegistry();
    const events = [];
    for await (const e of registry.run('non-existent', {}, mockCtx)) {
      events.push(e);
    }
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('step_failed');
    expect(events[0].error).toContain('non-existent');
  });

  it('collect returns result from successful skill run', async () => {
    const registry = new SkillRegistry();
    registry.register({
      id: 'test-skill',
      description: 'test',
      inputSchema: { type: 'object', properties: {}, required: [] },
      async *run() {
        yield { type: 'step_start', step: 'a' };
        yield { type: 'step_done', step: 'a' };
        yield { type: 'result', data: { answer: 42 } };
      },
    });

    const { events, result } = await registry.collect('test-skill', {}, mockCtx);
    expect(result).toEqual({ answer: 42 });
    expect(events.some((e) => e.type === 'step_done')).toBe(true);
  });

  it('full-diagnosis skips expert comparison when search returns nothing', async () => {
    vi.mocked(mockToolRegistry.execute)
      .mockResolvedValueOnce({ success: true, output: JSON.stringify({ results: [] }) })          // search_knowledge
      .mockResolvedValueOnce({ success: true, output: JSON.stringify({ overallScore: 7 }) })      // parallel_diagnose
      .mockResolvedValueOnce({ success: true, output: JSON.stringify({ followups: ['追问1'] }) }); // generate_followup

    const events = [];
    for await (const e of fullDiagnosis.run(
      { question: 'Q', answer: 'A' },
      mockCtx,
    )) {
      events.push(e);
    }

    // compare_answers should NOT have been called (no expertAnswer)
    const stepNames = events.filter((e) => e.step).map((e) => e.step);
    expect(stepNames).not.toContain('高手答案对比');
    expect(events.at(-1)?.type).toBe('result');
    expect((events.at(-1)?.data as { followups: string[] }).followups).toEqual(['追问1']);
  });
});
