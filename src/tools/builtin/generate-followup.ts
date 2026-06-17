import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ToolDefinition } from '../types.js';

const DB_PATH = resolve('data/agent.db');

export const generateFollowup: ToolDefinition = {
  schema: {
    name: 'generate_followup',
    description: '根据当前面试问答上下文，生成面试官可能的追问题目',
    parameters: {
      type: 'object',
      properties: {
        question: { type: 'string', description: '当前面试题' },
        answer: { type: 'string', description: '用户的回答' },
        depth: {
          type: 'string',
          enum: ['shallow', 'medium', 'deep'],
          description: '追问深度，默认 medium',
        },
      },
      required: ['question', 'answer'],
    },
  },
  riskLevel: 'low',
  async execute(input) {
    const { question, answer, depth = 'medium' } = input as {
      question: string;
      answer: string;
      depth?: string;
    };

    const combined = question + ' ' + answer;

    // Try to find related questions from knowledge DB
    if (existsSync(DB_PATH)) {
      try {
        const { openDatabase } = await import('../../db/database.js');
        const { KnowledgeSearch } = await import('../../knowledge/search.js');
        const db = openDatabase(DB_PATH);
        const search = new KnowledgeSearch(db);

        // Search for related questions, excluding the original question
        const limit = depth === 'shallow' ? 2 : depth === 'deep' ? 4 : 3;
        const results = await search.search({ query: combined, limit: limit + 2, method: 'hybrid' });
        db.close();

        const followups = results
          .filter((r) => r.entry.question && r.entry.question !== question)
          .slice(0, limit)
          .map((r) => r.entry.question!);

        if (followups.length > 0) {
          const keyword = extractKeyword(combined);
          return {
            success: true,
            output: JSON.stringify({
              question,
              depth,
              followups,
              hint: `面试官追问方向：检验对 "${keyword}" 的工程落地深度和实战经验`,
            }),
          };
        }
      } catch {}
    }

    // Fallback: contextual templates
    const keyword = extractKeyword(combined);
    const depthTemplates: Record<string, string[]> = {
      shallow: [
        `你能再具体说说 ${keyword} 吗？`,
        '这个方案的优缺点分别是什么？',
      ],
      medium: [
        `如果 ${keyword} 在生产环境出了问题，你会怎么排查？`,
        '这个设计在高并发场景下会有什么瓶颈？',
        '你有没有在实际项目中遇到过相关的坑？怎么解决的？',
      ],
      deep: [
        `${keyword} 的底层实现原理是什么？`,
        '业界有哪些不同的实现方案？它们的 trade-off 分别是什么？',
        '如果规模扩大 10 倍，这个架构还能撑住吗？瓶颈在哪？',
      ],
    };

    return {
      success: true,
      output: JSON.stringify({
        question,
        depth,
        followups: depthTemplates[depth] ?? depthTemplates.medium,
        hint: `面试官追问方向：检验对 "${keyword}" 的理解深度和实战经验`,
      }),
    };
  },
};

function extractKeyword(text: string): string {
  const techTerms = [
    'ReAct', 'RAG', 'Embedding', 'Tool Calling', 'Context Window',
    'Prompt Caching', 'HNSW', 'BM25', 'Re-ranking', 'Fine-tuning',
    'Harness', 'LangChain', 'Multi-Agent', 'Sub-agent', 'Hook',
    'SSE', 'WebSocket', 'Provider', 'Router', 'Chunk',
  ];
  for (const term of techTerms) {
    if (text.toLowerCase().includes(term.toLowerCase())) return term;
  }
  return text.split(/\s+/).slice(0, 2).join(' ');
}
