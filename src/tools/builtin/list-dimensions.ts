import type { ToolDefinition } from '../types.js';

const DIMENSIONS = [
  { id: 'architecture', name: 'Agent 架构设计', count: 0 },
  { id: 'engineering', name: 'Harness 工程实践', count: 0 },
  { id: 'model', name: '模型能力与调优', count: 0 },
  { id: 'rag', name: 'RAG 与知识增强', count: 0 },
  { id: 'multi-agent', name: '多 Agent 协作', count: 0 },
  { id: 'evaluation', name: '评测与质量保障', count: 0 },
  { id: 'full-stack', name: '全栈工程能力', count: 0 },
];

export const listDimensions: ToolDefinition = {
  schema: {
    name: 'list_dimensions',
    description: '列出知识库中所有面试考察维度及各维度题目数量',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  riskLevel: 'low',
  async execute() {
    return {
      success: true,
      output: JSON.stringify({ dimensions: DIMENSIONS }),
    };
  },
};
