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
    const { format = 'detailed' } = input as {
      sessionId: string;
      format?: string;
    };

    // Generate a mock report based on session context
    const report = {
      sessionId: ctx.sessionId,
      format,
      summary: {
        totalQuestions: 3,
        averageScore: 6.2,
        strongDimensions: ['architecture'],
        weakDimensions: ['engineering', 'model'],
        timeSpent: '15 分钟',
      },
      overallAssessment: '你对 Agent 架构的基本概念有正确理解，但在工程落地细节和模型调优方面还需加强。建议重点补充 Harness 工程实践和 Prompt Engineering。',
      nextSteps: [
        '重点练习 engineering 维度的题目',
        '对每道题尝试用"分点 + 实例 + 踩坑"结构回答',
        '下次会话前复习本次诊断中的差距点',
      ],
    };

    if (format === 'brief') {
      return {
        success: true,
        output: JSON.stringify({
          score: report.summary.averageScore,
          weak: report.summary.weakDimensions,
          tip: report.nextSteps[0],
        }),
      };
    }

    return {
      success: true,
      output: JSON.stringify(report),
    };
  },
};
