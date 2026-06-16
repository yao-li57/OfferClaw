import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ToolDefinition } from '../types.js';

const DB_PATH = resolve('data/agent.db');

const DIMENSION_NAMES: Record<string, string> = {
  architecture: 'Agent 架构设计',
  engineering: 'Harness 工程实践',
  model: '模型能力与调优',
  rag: 'RAG 与知识增强',
  'multi-agent': '多 Agent 协作',
  evaluation: '评测与质量保障',
  'full-stack': '全栈工程能力',
};

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
    // Query real counts from SQLite
    if (existsSync(DB_PATH)) {
      try {
        const { openDatabase } = await import('../../db/database.js');
        const db = openDatabase(DB_PATH);
        const rows = db
          .prepare(
            `SELECT dimension, COUNT(*) as count
             FROM knowledge
             WHERE question IS NOT NULL
             GROUP BY dimension`,
          )
          .all() as Array<{ dimension: string; count: number }>;
        db.close();

        // Merge DB counts with known dimension list
        const countMap = Object.fromEntries(rows.map((r) => [r.dimension, r.count]));
        const dimensions = Object.entries(DIMENSION_NAMES).map(([id, name]) => ({
          id,
          name,
          count: countMap[id] ?? 0,
        }));

        return {
          success: true,
          output: JSON.stringify({
            dimensions,
            total: dimensions.reduce((s, d) => s + d.count, 0),
          }),
        };
      } catch {}
    }

    // Fallback: all zeros
    return {
      success: true,
      output: JSON.stringify({
        dimensions: Object.entries(DIMENSION_NAMES).map(([id, name]) => ({ id, name, count: 0 })),
        total: 0,
      }),
    };
  },
};
