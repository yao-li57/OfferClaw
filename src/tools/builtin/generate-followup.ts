import type { ToolDefinition } from '../types.js';

const FOLLOWUP_TEMPLATES: Record<string, string[]> = {
  shallow: [
    '你能再具体解释一下 {keyword} 吗？',
    '这个方案的优缺点分别是什么？',
  ],
  medium: [
    '如果 {keyword} 在生产环境出了问题，你会怎么排查？',
    '这个设计在高并发场景下会有什么瓶颈？',
    '你有没有在实际项目中遇到过相关的坑？怎么解决的？',
    '如果让你重新设计，你会做什么不同的选择？',
  ],
  deep: [
    '{keyword} 的底层实现原理是什么？你读过相关源码吗？',
    '业界有哪些不同的实现方案？它们的 trade-off 分别是什么？',
    '如果规模扩大 10 倍，这个架构还能撑住吗？瓶颈在哪？',
    '你怎么做这个模块的自动化测试和持续监控？',
  ],
};

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

    const keywords = extractKeywords(question + ' ' + answer);
    const keyword = keywords[0] ?? '这个概念';

    const templates = FOLLOWUP_TEMPLATES[depth] ?? FOLLOWUP_TEMPLATES.medium;
    const followups = templates.map((t) => t.replace('{keyword}', keyword));

    return {
      success: true,
      output: JSON.stringify({
        question,
        depth,
        followups,
        hint: `面试官追问方向：检验对 "${keyword}" 的理解深度和实战经验`,
      }),
    };
  },
};

function extractKeywords(text: string): string[] {
  const techTerms = [
    'ReAct', 'Agent', 'Tool Calling', 'RAG', 'Embedding', 'Vector',
    'Context Window', 'Token', 'Prompt', 'LLM', 'Fine-tune',
    'Harness', 'LangChain', 'LangGraph', 'Function Calling',
    'Multi-Agent', 'Sub-agent', 'Memory', 'Session', 'Hook',
    'Stream', 'SSE', 'WebSocket', 'Provider', 'Router',
  ];

  const found: string[] = [];
  for (const term of techTerms) {
    if (text.toLowerCase().includes(term.toLowerCase())) {
      found.push(term);
    }
  }
  return found.length > 0 ? found : [text.split(/\s+/).slice(0, 3).join(' ')];
}
