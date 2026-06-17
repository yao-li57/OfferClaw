import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DiagnosisOrchestrator } from '../../src/agent/orchestrator.js';
import { ConcurrencyPool } from '../../src/agent/pool.js';
import type { QueryEngine } from '../../src/query-engine/engine.js';

const mockEngine = {
  query: vi.fn(),
  countTokens: vi.fn(),
  listProviders: vi.fn(() => ['mock']),
} as unknown as QueryEngine;

const makeResponse = (score: number) => ({
  type: 'text' as const,
  content: JSON.stringify({
    score,
    strengths: ['优点A'],
    gaps: ['差距A'],
    suggestions: ['建议A'],
  }),
  usage: { inputTokens: 10, outputTokens: 20 },
  stopReason: 'end_turn' as const,
});

describe('DiagnosisOrchestrator', () => {
  let orchestrator: DiagnosisOrchestrator;
  let pool: ConcurrencyPool;

  beforeEach(() => {
    vi.clearAllMocks();
    pool = new ConcurrencyPool(3);
    orchestrator = new DiagnosisOrchestrator(mockEngine, pool);
  });

  it('runs content + expression in parallel when no audioTranscript', async () => {
    (mockEngine.query as ReturnType<typeof vi.fn>).mockResolvedValue(makeResponse(7));

    const result = await orchestrator.diagnose({
      question: 'What is ReAct?',
      answer: 'It is a reasoning + acting pattern.',
      sessionId: 'test-session',
    });

    expect(mockEngine.query).toHaveBeenCalledTimes(2);
    expect(result.completedDimensions).toContain('content');
    expect(result.completedDimensions).toContain('expression');
    expect(result.completedDimensions).not.toContain('speech');
    expect(result.failedDimensions).toHaveLength(0);
    expect(result.overallScore).toBeGreaterThan(0);
    expect(result.parallelSpeedup).toBeGreaterThan(0);
  });

  it('adds speech dimension when audioTranscript is provided', async () => {
    (mockEngine.query as ReturnType<typeof vi.fn>).mockResolvedValue(makeResponse(8));

    const result = await orchestrator.diagnose({
      question: 'Explain RAG',
      answer: 'RAG retrieves documents and generates...',
      audioTranscript: 'RAG 就是 嗯 先检索 然后 生成',
      sessionId: 'test-session',
    });

    expect(mockEngine.query).toHaveBeenCalledTimes(3);
    expect(result.completedDimensions).toContain('speech');
  });

  it('handles one dimension failure gracefully', async () => {
    (mockEngine.query as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(makeResponse(6))         // content OK
      .mockRejectedValueOnce(new Error('timeout'));    // expression fails

    const result = await orchestrator.diagnose({
      question: 'Test question',
      answer: 'Test answer',
      sessionId: 'test-session',
    });

    expect(result.completedDimensions).toHaveLength(1);
    expect(result.failedDimensions).toHaveLength(1);
    // Overall score computed from single successful dimension
    expect(result.overallScore).toBe(6);
  });

  it('deduplicates suggestions across dimensions', async () => {
    const sharedSuggestion = '使用分点结构';
    (mockEngine.query as ReturnType<typeof vi.fn>).mockResolvedValue({
      type: 'text' as const,
      content: JSON.stringify({
        score: 7,
        strengths: [],
        gaps: [],
        suggestions: [sharedSuggestion],
      }),
      usage: { inputTokens: 5, outputTokens: 10 },
      stopReason: 'end_turn' as const,
    });

    const result = await orchestrator.diagnose({
      question: 'Q',
      answer: 'A',
      sessionId: 'test-session',
    });

    // Both dimensions return the same suggestion, should be deduplicated
    expect(result.topSuggestions.filter((s) => s === sharedSuggestion)).toHaveLength(1);
  });

  it('handles malformed JSON from LLM', async () => {
    (mockEngine.query as ReturnType<typeof vi.fn>).mockResolvedValue({
      type: 'text' as const,
      content: 'Not valid JSON at all',
      usage: { inputTokens: 5, outputTokens: 5 },
      stopReason: 'end_turn' as const,
    });

    const result = await orchestrator.diagnose({
      question: 'Q',
      answer: 'A',
      sessionId: 'test-session',
    });

    // success=false when JSON parse fails, but no throw
    expect(result.failedDimensions.length + result.completedDimensions.length).toBe(2);
    expect(result.overallScore).toBeGreaterThanOrEqual(0);
  });
});
