import type { ToolDefinition } from '../types.js';

export const scoreRubric: ToolDefinition = {
  schema: {
    name: 'score_rubric',
    description: '使用评分量规对面试回答进行多维度打分（技术深度、表达结构、实践经验、完整性）',
    parameters: {
      type: 'object',
      properties: {
        question: { type: 'string', description: '面试题目' },
        answer: { type: 'string', description: '用户回答' },
        referenceAnswer: { type: 'string', description: '参考的高手答案（可选）' },
      },
      required: ['question', 'answer'],
    },
  },
  riskLevel: 'low',
  async execute(input) {
    const { question, answer, referenceAnswer } = input as {
      question: string;
      answer: string;
      referenceAnswer?: string;
    };

    const len = answer.length;
    const hasPoints = (answer.match(/\d[.、)）]/g) ?? []).length;
    const hasTechTerms = (answer.match(/[A-Z][a-z]+[A-Z]/g) ?? []).length;

    const technicalDepth = Math.min(10, 3 + Math.floor(len / 100) + hasTechTerms);
    const structure = Math.min(10, 3 + hasPoints * 2);
    const practicalExperience = answer.includes('实际') || answer.includes('项目') || answer.includes('生产')
      ? 7 : 4;
    const completeness = referenceAnswer
      ? Math.min(10, Math.floor((len / referenceAnswer.length) * 8))
      : Math.min(10, 3 + Math.floor(len / 80));

    const overall = Math.round((technicalDepth + structure + practicalExperience + completeness) / 4 * 10) / 10;

    return {
      success: true,
      output: JSON.stringify({
        question,
        hasReference: !!referenceAnswer,
        scores: {
          technicalDepth,
          structure,
          practicalExperience,
          completeness,
          overall,
        },
        rubric: {
          '1-3': '仅复述概念表面',
          '4-6': '理解正确但缺乏深度或实践',
          '7-8': '有深度、有结构、有实践经验',
          '9-10': '超预期，能提出独到见解',
        },
      }),
    };
  },
};
