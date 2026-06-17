import type { Skill, SkillContext, SkillEvent, SkillInput } from '../types.js';

export const quickMock: Skill = {
  id: 'quick-mock',
  description:
    '快速模拟面试：按维度从知识库抽题，对已提供的回答并行诊断，最终生成总结报告。',
  inputSchema: {
    type: 'object',
    properties: {
      dimension: {
        type: 'string',
        description: '考察维度',
        enum: ['architecture', 'engineering', 'model', 'rag', 'multi-agent', 'evaluation', 'full-stack'],
      },
      questionCount: { type: 'number', description: '抽题数量，默认 3' },
      difficulty: {
        type: 'string',
        description: '难度，默认 medium',
        enum: ['easy', 'medium', 'hard'],
      },
      answers: {
        type: 'array' as unknown as string,
        description: '用户对每道题的回答列表（可选，不提供则只输出题目）',
      },
    },
    required: ['dimension'],
  },

  async *run(input: SkillInput, ctx: SkillContext): AsyncGenerator<SkillEvent> {
    const {
      dimension,
      questionCount = 3,
      difficulty = 'medium',
      answers = [],
    } = input as {
      dimension: string;
      questionCount?: number;
      difficulty?: string;
      answers?: string[];
    };

    // ── Step 1: Pick questions ─────────────────────────────────────────
    yield { type: 'step_start', step: '抽取题目' };
    let questions: string[] = [];
    try {
      const res = await ctx.toolRegistry.execute(
        'mock_interview',
        { dimension, count: questionCount, difficulty },
        { sessionId: ctx.sessionId },
      );
      const parsed = JSON.parse(res.output) as { questions?: string[] };
      questions = parsed.questions ?? [];
      yield { type: 'step_done', step: '抽取题目', data: { count: questions.length } };
    } catch (err) {
      yield { type: 'step_failed', step: '抽取题目', error: (err as Error).message };
      return;
    }

    // ── Step 2: Diagnose each provided answer ─────────────────────────
    const diagnoses: (unknown | null)[] = [];
    const limit = Math.min(questions.length, (answers as string[]).length);

    for (let i = 0; i < limit; i++) {
      const q = questions[i];
      const a = (answers as string[])[i];
      yield { type: 'step_start', step: `诊断第 ${i + 1} 题` };
      try {
        const res = await ctx.toolRegistry.execute(
          'parallel_diagnose',
          { question: q, answer: a, interviewDimension: dimension },
          { sessionId: ctx.sessionId, memoryStore: ctx.memoryStore },
        );
        const diag = JSON.parse(res.output) as { overallScore: number };
        diagnoses.push(diag);
        yield { type: 'step_done', step: `诊断第 ${i + 1} 题`, data: { score: diag.overallScore } };
      } catch (err) {
        yield { type: 'step_failed', step: `诊断第 ${i + 1} 题`, error: (err as Error).message };
        diagnoses.push(null);
      }
    }

    // ── Step 3: Session report (if any diagnoses ran) ─────────────────
    let report: unknown = null;
    if (diagnoses.length > 0) {
      yield { type: 'step_start', step: '生成总结报告' };
      try {
        const res = await ctx.toolRegistry.execute(
          'session_report',
          {},
          { sessionId: ctx.sessionId, memoryStore: ctx.memoryStore },
        );
        report = JSON.parse(res.output);
        yield { type: 'step_done', step: '生成总结报告', data: report };
      } catch (err) {
        yield { type: 'step_failed', step: '生成总结报告', error: (err as Error).message };
      }
    }

    yield {
      type: 'result',
      data: { questions, diagnoses, report },
    };
  },
};
