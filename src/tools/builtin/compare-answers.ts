import type { ToolDefinition } from '../types.js';

export const compareAnswers: ToolDefinition = {
  schema: {
    name: 'compare_answers',
    description: '对比用户回答与知识库中的高手答案，高亮差距点和可借鉴的表达方式',
    parameters: {
      type: 'object',
      properties: {
        question: { type: 'string', description: '面试题目' },
        userAnswer: { type: 'string', description: '用户回答' },
        expertAnswer: { type: 'string', description: '高手参考答案' },
      },
      required: ['question', 'userAnswer', 'expertAnswer'],
    },
  },
  riskLevel: 'low',
  async execute(input) {
    const { question, userAnswer, expertAnswer } = input as {
      question: string;
      userAnswer: string;
      expertAnswer: string;
    };

    const expertPoints = expertAnswer.split(/\d[.、)）]/).filter(Boolean);
    const userLower = userAnswer.toLowerCase();

    const covered: string[] = [];
    const missed: string[] = [];

    for (const point of expertPoints) {
      const keywords = point.match(/[一-鿿]+|[a-zA-Z]{3,}/g) ?? [];
      const isHit = keywords.some((k) => userLower.includes(k.toLowerCase()));
      if (isHit) {
        covered.push(point.trim().slice(0, 60));
      } else {
        missed.push(point.trim().slice(0, 60));
      }
    }

    const coverageRatio = expertPoints.length > 0
      ? Math.round((covered.length / expertPoints.length) * 100)
      : 50;

    const highlights = [
      '高手答案的分点结构清晰，每个点都有"是什么 → 为什么 → 怎么做"的递进',
      '高手主动提到工程落地的注意事项和常见坑',
      '高手用具体数字/配置增强说服力',
    ];

    return {
      success: true,
      output: JSON.stringify({
        question,
        comparison: {
          userLength: userAnswer.length,
          expertLength: expertAnswer.length,
          coverageRatio: `${coverageRatio}%`,
        },
        covered: covered.slice(0, 5),
        missed: missed.slice(0, 5),
        highlights: highlights.slice(0, 3),
        suggestion: coverageRatio > 70
          ? '你的回答覆盖了大部分要点，可以进一步加强表达结构和实践细节'
          : '你的回答遗漏了较多关键点，建议重点补充上面 missed 中列出的内容',
      }),
    };
  },
};
