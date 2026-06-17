import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ToolDefinition } from '../types.js';

const DB_PATH = resolve('data/agent.db');

export const compareAnswers: ToolDefinition = {
  schema: {
    name: 'compare_answers',
    description: '对比用户回答与知识库中的高手答案，高亮差距点和可借鉴的表达方式',
    parameters: {
      type: 'object',
      properties: {
        question: { type: 'string', description: '面试题目' },
        userAnswer: { type: 'string', description: '用户回答' },
        expertAnswer: { type: 'string', description: '高手参考答案（可选，若不传则从知识库查找）' },
      },
      required: ['question', 'userAnswer'],
    },
  },
  riskLevel: 'low',
  async execute(input) {
    const { question, userAnswer, expertAnswer: passedExpert } = input as {
      question: string;
      userAnswer: string;
      expertAnswer?: string;
    };

    let expertAnswer = passedExpert ?? '';

    // Try to look up the real expert answer from knowledge DB
    if ((!expertAnswer || expertAnswer.length < 50) && existsSync(DB_PATH)) {
      try {
        const { openDatabase } = await import('../../db/database.js');
        const { KnowledgeSearch } = await import('../../knowledge/search.js');
        const db = openDatabase(DB_PATH);
        const search = new KnowledgeSearch(db);
        const results = await search.search({ query: question, limit: 1, method: 'fts' });
        if (results.length > 0 && results[0].entry.expertAnswer) {
          expertAnswer = results[0].entry.expertAnswer;
        }
        db.close();
      } catch {}
    }

    if (!expertAnswer) {
      return {
        success: false,
        output: JSON.stringify({ error: '未找到参考答案，请先通过 search_knowledge 获取高手答案再对比' }),
      };
    }

    // Split expert answer into key points
    const expertPoints = expertAnswer
      .split(/\n(?=\d[.、)）]|\*\*[^*]+\*\*|[-•])/)
      .map((p) => p.replace(/^[\d.、)）*\-•\s]+/, '').trim())
      .filter((p) => p.length > 5);

    const userLower = userAnswer.toLowerCase();

    const covered: string[] = [];
    const missed: string[] = [];

    for (const point of expertPoints) {
      const keywords = point.match(/[一-鿿]{2,}|[a-zA-Z]{3,}/g) ?? [];
      const isHit = keywords.slice(0, 6).some((k) => userLower.includes(k.toLowerCase()));
      if (isHit) {
        covered.push(point.slice(0, 80));
      } else {
        missed.push(point.slice(0, 80));
      }
    }

    const coverageRatio = expertPoints.length > 0
      ? Math.round((covered.length / expertPoints.length) * 100)
      : 50;

    // Generate dynamic highlights from expert answer structure
    const highlights: string[] = [];
    if (expertAnswer.match(/\d[.、)）]/)) {
      highlights.push('高手答案使用了清晰的编号分点结构，每个点独立成意');
    }
    if (expertAnswer.match(/\*\*[^*]+\*\*/)) {
      highlights.push('高手用加粗标注了关键概念和术语，便于面试官抓重点');
    }
    if (expertAnswer.match(/\d+[%倍x]|P\d+|ms|k tokens|并发/)) {
      highlights.push('高手引用了具体数字（延迟、比率、规模），大幅增强说服力');
    }
    if (expertAnswer.includes('坑') || expertAnswer.includes('注意') || expertAnswer.includes('问题')) {
      highlights.push('高手主动提到了工程落地中的坑和注意事项，展示真实经验');
    }
    if (expertAnswer.includes('生产') || expertAnswer.includes('实际') || expertAnswer.includes('案例')) {
      highlights.push('高手用"生产环境/实际项目"开头，体现有真实落地经验');
    }
    if (highlights.length === 0) {
      highlights.push('高手答案逻辑清晰，从概念定义到工程细节有完整递进');
    }

    return {
      success: true,
      output: JSON.stringify({
        question,
        comparison: {
          userLength: userAnswer.length,
          expertLength: expertAnswer.length,
          coverageRatio: `${coverageRatio}%`,
          coveredCount: covered.length,
          missedCount: missed.length,
        },
        covered: covered.slice(0, 5),
        missed: missed.slice(0, 5),
        highlights: highlights.slice(0, 3),
        expertAnswerPreview: expertAnswer.slice(0, 300),
        suggestion: coverageRatio >= 70
          ? '你的回答覆盖了大部分要点，建议进一步加强表达结构和实战细节'
          : coverageRatio >= 40
          ? `还有 ${missed.length} 个关键点未覆盖，重点补强上面 missed 中列出的内容`
          : '回答与高手差距较大，建议先系统学习高手答案的框架再尝试重答',
      }),
    };
  },
};
