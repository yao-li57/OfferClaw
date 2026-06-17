import type { Skill, SkillContext, SkillEvent, SkillInput } from '../types.js';

export const fullDiagnosis: Skill = {
  id: 'full-diagnosis',
  description:
    '面试回答全链路诊断：知识库搜索 → 三维并行诊断 → 高手答案对比 → 追问生成，四步串行一次完成。',
  inputSchema: {
    type: 'object',
    properties: {
      question: { type: 'string', description: '面试题目' },
      answer: { type: 'string', description: '用户的回答' },
      audioTranscript: { type: 'string', description: '音频转录文本（可选，提供则增加语音分析维度）' },
      dimension: {
        type: 'string',
        description: '技术维度（可选）',
        enum: ['architecture', 'engineering', 'model', 'rag', 'multi-agent', 'evaluation', 'full-stack'],
      },
    },
    required: ['question', 'answer'],
  },

  async *run(input: SkillInput, ctx: SkillContext): AsyncGenerator<SkillEvent> {
    const { question, answer, audioTranscript, dimension } = input as {
      question: string;
      answer: string;
      audioTranscript?: string;
      dimension?: string;
    };

    // ── Step 1: Search knowledge base ──────────────────────────────────
    yield { type: 'step_start', step: '搜索知识库' };
    let expertAnswer = '';
    try {
      const res = await ctx.toolRegistry.execute(
        'search_knowledge',
        { query: question, limit: 1 },
        { sessionId: ctx.sessionId },
      );
      const parsed = JSON.parse(res.output) as { results?: { expertAnswer?: string }[] };
      expertAnswer = parsed.results?.[0]?.expertAnswer ?? '';
      yield { type: 'step_done', step: '搜索知识库', data: { found: !!expertAnswer } };
    } catch (err) {
      yield { type: 'step_failed', step: '搜索知识库', error: (err as Error).message };
    }

    // ── Step 2: Parallel diagnosis ─────────────────────────────────────
    yield { type: 'step_start', step: '三维并行诊断' };
    let diagnosis: unknown = null;
    try {
      const diagInput: Record<string, unknown> = { question, answer };
      if (audioTranscript) diagInput.audioTranscript = audioTranscript;
      if (dimension) diagInput.interviewDimension = dimension;

      const res = await ctx.toolRegistry.execute('parallel_diagnose', diagInput, {
        sessionId: ctx.sessionId,
        memoryStore: ctx.memoryStore,
      });
      diagnosis = JSON.parse(res.output);
      yield { type: 'step_done', step: '三维并行诊断', data: { overallScore: (diagnosis as { overallScore: number }).overallScore } };
    } catch (err) {
      yield { type: 'step_failed', step: '三维并行诊断', error: (err as Error).message };
    }

    // ── Step 3: Expert answer comparison ──────────────────────────────
    let comparison: unknown = null;
    if (expertAnswer) {
      yield { type: 'step_start', step: '高手答案对比' };
      try {
        const res = await ctx.toolRegistry.execute(
          'compare_answers',
          { question, userAnswer: answer, expertAnswer },
          { sessionId: ctx.sessionId },
        );
        comparison = JSON.parse(res.output);
        yield { type: 'step_done', step: '高手答案对比', data: comparison };
      } catch (err) {
        yield { type: 'step_failed', step: '高手答案对比', error: (err as Error).message };
      }
    }

    // ── Step 4: Follow-up generation ───────────────────────────────────
    yield { type: 'step_start', step: '生成追问' };
    let followups: string[] = [];
    try {
      const res = await ctx.toolRegistry.execute(
        'generate_followup',
        { question, answer, depth: 'medium' },
        { sessionId: ctx.sessionId },
      );
      const parsed = JSON.parse(res.output) as { followups?: string[] };
      followups = parsed.followups ?? [];
      yield { type: 'step_done', step: '生成追问', data: { count: followups.length } };
    } catch (err) {
      yield { type: 'step_failed', step: '生成追问', error: (err as Error).message };
    }

    yield {
      type: 'result',
      data: {
        question,
        diagnosis,
        expertComparison: comparison,
        followups,
        expertAnswer: expertAnswer || null,
      },
    };
  },
};
