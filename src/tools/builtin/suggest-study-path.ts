import type { ToolDefinition } from '../types.js';

const STUDY_RESOURCES: Record<string, { topics: string[]; priority: string }> = {
  architecture: {
    topics: ['ReAct 循环实现', 'Tool Calling 全链路', 'Agent Loop 设计模式', '多 Provider 架构'],
    priority: '核心必备',
  },
  engineering: {
    topics: ['Harness 10 层分拆', '错误处理与恢复', '可观测性设计', '性能优化'],
    priority: '核心必备',
  },
  model: {
    topics: ['Prompt Engineering', 'Temperature/Top-P 调参', 'Token 管理', 'Fine-tune vs RAG 决策'],
    priority: '高优',
  },
  rag: {
    topics: ['Embedding 选型', 'Chunk 策略', '混合检索', 'Re-ranking'],
    priority: '高优',
  },
  'multi-agent': {
    topics: ['Sub-agent 模式', '并发控制', 'Agent 通信协议', '编排 vs 自治'],
    priority: '进阶',
  },
  evaluation: {
    topics: ['自动化评测框架', '人工评测设计', 'A/B 测试', '质量监控'],
    priority: '进阶',
  },
  'full-stack': {
    topics: ['SSE 流式架构', 'WebSocket vs SSE', '前端状态管理', '部署与 CI/CD'],
    priority: '加分项',
  },
};

export const suggestStudyPath: ToolDefinition = {
  schema: {
    name: 'suggest_study_path',
    description: '根据诊断结果，推荐个性化学习路径和优先补强的知识点',
    parameters: {
      type: 'object',
      properties: {
        weakDimensions: {
          type: 'array',
          items: { type: 'string' },
          description: '薄弱维度列表',
        },
        targetRole: {
          type: 'string',
          description: '目标岗位（如 AI 工程师、Agent 架构师）',
        },
        timeframe: {
          type: 'string',
          description: '准备时间（如 1 周、2 周）',
        },
      },
      required: ['weakDimensions'],
    },
  },
  riskLevel: 'low',
  async execute(input) {
    const { weakDimensions, targetRole, timeframe } = input as {
      weakDimensions: string[];
      targetRole?: string;
      timeframe?: string;
    };

    const path = weakDimensions.map((dim) => {
      const resource = STUDY_RESOURCES[dim];
      if (!resource) return { dimension: dim, topics: ['通用 Agent 知识'], priority: '待定' };
      return { dimension: dim, ...resource };
    });

    path.sort((a, b) => {
      const order = ['核心必备', '高优', '进阶', '加分项', '待定'];
      return order.indexOf(a.priority) - order.indexOf(b.priority);
    });

    const totalTopics = path.reduce((sum, p) => sum + p.topics.length, 0);
    const estimatedDays = Math.max(3, Math.ceil(totalTopics * 1.5));

    return {
      success: true,
      output: JSON.stringify({
        targetRole: targetRole ?? 'AI Agent 工程师',
        timeframe: timeframe ?? `建议 ${estimatedDays} 天`,
        path,
        strategy: [
          '每天专攻 1-2 个 topic，先理解原理再手写实现',
          '对每个 topic 尝试用"高手答"模板组织回答',
          '完成后用本工具重新诊断，验证提升效果',
        ],
      }),
    };
  },
};
