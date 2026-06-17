import type { Skill, SkillContext, SkillEvent, SkillInput } from '../types.js';

export const jdFullAnalysis: Skill = {
  id: 'jd-full-analysis',
  description:
    'JD 全链路分析：JD 解析 → 简历匹配（可选）→ 个性化学习路径，一次生成完整面试准备方案。',
  inputSchema: {
    type: 'object',
    properties: {
      jd: { type: 'string', description: '职位描述全文' },
      resume: { type: 'string', description: '简历内容（可选，提供则追加匹配分析）' },
    },
    required: ['jd'],
  },

  async *run(input: SkillInput, ctx: SkillContext): AsyncGenerator<SkillEvent> {
    const { jd, resume } = input as { jd: string; resume?: string };

    // ── Step 1: Analyze JD ─────────────────────────────────────────────
    yield { type: 'step_start', step: 'JD 解析' };
    let jdAnalysis: Record<string, unknown> | null = null;
    try {
      const res = await ctx.toolRegistry.execute('analyze_jd', { jd }, { sessionId: ctx.sessionId });
      jdAnalysis = JSON.parse(res.output) as Record<string, unknown>;
      yield { type: 'step_done', step: 'JD 解析', data: jdAnalysis };
    } catch (err) {
      yield { type: 'step_failed', step: 'JD 解析', error: (err as Error).message };
    }

    // ── Step 2: Resume match (optional) ───────────────────────────────
    let matchResult: unknown = null;
    if (resume) {
      yield { type: 'step_start', step: '简历匹配分析' };
      try {
        const res = await ctx.toolRegistry.execute(
          'match_resume_jd',
          { resume, jd },
          { sessionId: ctx.sessionId },
        );
        matchResult = JSON.parse(res.output);
        yield { type: 'step_done', step: '简历匹配分析', data: matchResult };
      } catch (err) {
        yield { type: 'step_failed', step: '简历匹配分析', error: (err as Error).message };
      }
    }

    // ── Step 3: Study path ────────────────────────────────────────────
    yield { type: 'step_start', step: '生成学习路径' };
    let studyPath: unknown = null;
    try {
      // Use a weak dimension from JD analysis if available; fall back to architecture
      const weakDim = (jdAnalysis?.focusDimension as string) ?? 'architecture';
      const res = await ctx.toolRegistry.execute(
        'suggest_study_path',
        { weakDimensions: [weakDim] },
        { sessionId: ctx.sessionId, memoryStore: ctx.memoryStore },
      );
      studyPath = JSON.parse(res.output);
      yield { type: 'step_done', step: '生成学习路径', data: studyPath };
    } catch (err) {
      yield { type: 'step_failed', step: '生成学习路径', error: (err as Error).message };
    }

    yield {
      type: 'result',
      data: { jdAnalysis, resumeMatch: matchResult, studyPath },
    };
  },
};
