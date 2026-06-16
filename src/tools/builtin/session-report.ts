import type { ToolDefinition } from '../types.js';

export const sessionReport: ToolDefinition = {
  schema: {
    name: 'session_report',
    description: '生成本次诊断会话的总结报告，包含所有题目评分、整体表现和学习建议',
    parameters: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: '会话 ID' },
        format: {
          type: 'string',
          enum: ['brief', 'detailed', 'markdown'],
          description: '报告格式，默认 detailed',
        },
      },
      required: ['sessionId'],
    },
  },
  riskLevel: 'low',
  async execute(input, ctx) {
    const { format = 'detailed' } = input as { sessionId: string; format?: string };

    const memoryStore = ctx.memoryStore;

    // Read all weakness / strength entries across sessions
    const weaknesses = memoryStore
      ? memoryStore.query({ type: 'weakness', limit: 50 })
      : [];
    const strengths = memoryStore
      ? memoryStore.query({ type: 'strength', limit: 20 })
      : [];

    // Parse dimension from "维度: X | 得分: Y/10 | 题目: Z"
    const parseDim = (content: string) => {
      const m = content.match(/维度:\s*(\S+)/);
      return m?.[1] ?? 'unknown';
    };
    const parseScore = (content: string): number => {
      const m = content.match(/得分:\s*(\d+)/);
      return m ? parseInt(m[1], 10) : 5;
    };

    // Aggregate by dimension
    const dimScores: Record<string, number[]> = {};
    for (const entry of [...weaknesses, ...strengths]) {
      const dim = parseDim(entry.content);
      const score = parseScore(entry.content);
      if (!dimScores[dim]) dimScores[dim] = [];
      dimScores[dim].push(score);
    }

    const avgByDim = Object.entries(dimScores).map(([dim, scores]) => ({
      dim,
      avg: scores.reduce((a, b) => a + b, 0) / scores.length,
      count: scores.length,
    }));

    avgByDim.sort((a, b) => a.avg - b.avg);

    const weakDimensions = avgByDim.filter((d) => d.avg < 6).map((d) => d.dim);
    const strongDimensions = avgByDim.filter((d) => d.avg >= 7).map((d) => d.dim);
    const totalQuestions = weaknesses.length + strengths.length;
    const allScores = [...weaknesses, ...strengths].map((e) => parseScore(e.content));
    const averageScore = allScores.length > 0
      ? Math.round((allScores.reduce((a, b) => a + b, 0) / allScores.length) * 10) / 10
      : 0;

    // Build diagnosis history list
    const recentEntries = [...weaknesses, ...strengths]
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 10)
      .map((e) => ({ dimension: parseDim(e.content), score: parseScore(e.content), type: e.type }));

    // Generate next-steps based on weak dims
    const nextSteps: string[] = [];
    if (weakDimensions.length > 0) {
      nextSteps.push(`重点练习薄弱维度：${weakDimensions.join('、')}`);
    }
    nextSteps.push('每道题尝试用"定义 → 工程细节 → 踩坑经验"三段式结构回答');
    nextSteps.push('下次会话前复习本次诊断中的差距点');

    const overallAssessment = totalQuestions === 0
      ? '暂无诊断记录，请先提交面试题回答进行诊断。'
      : weakDimensions.length === 0
      ? `综合表现良好！平均得分 ${averageScore}/10。继续保持，可以挑战更深层的工程细节问题。`
      : `共完成 ${totalQuestions} 道题，平均得分 ${averageScore}/10。${
          strongDimensions.length > 0 ? `优势维度：${strongDimensions.join('、')}。` : ''
        }薄弱维度：${weakDimensions.join('、')}，建议重点加强。`;

    const report = {
      sessionId: ctx.sessionId,
      format,
      summary: {
        totalQuestions,
        averageScore,
        strongDimensions,
        weakDimensions,
      },
      recentHistory: recentEntries,
      dimensionBreakdown: avgByDim,
      overallAssessment,
      nextSteps,
    };

    if (format === 'brief') {
      return {
        success: true,
        output: JSON.stringify({
          score: averageScore,
          totalQuestions,
          weak: weakDimensions,
          strong: strongDimensions,
          tip: nextSteps[0] ?? '继续练习',
        }),
      };
    }

    return {
      success: true,
      output: JSON.stringify(report),
    };
  },
};
