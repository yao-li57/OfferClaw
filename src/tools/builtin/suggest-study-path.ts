import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ToolDefinition } from '../types.js';

const DB_PATH = resolve('data/agent.db');

const PRIORITY: Record<string, string> = {
  architecture: '核心必备',
  engineering: '核心必备',
  model: '高优',
  rag: '高优',
  'multi-agent': '进阶',
  evaluation: '进阶',
  'full-stack': '加分项',
};

const PRIORITY_ORDER = ['核心必备', '高优', '进阶', '加分项', '待定'];

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
        targetRole: { type: 'string', description: '目标岗位' },
        timeframe: { type: 'string', description: '准备时间（如 1 周、2 周）' },
      },
      required: ['weakDimensions'],
    },
  },
  riskLevel: 'low',
  async execute(input, ctx) {
    const { weakDimensions, targetRole, timeframe } = input as {
      weakDimensions: string[];
      targetRole?: string;
      timeframe?: string;
    };

    // Pull real questions from knowledge DB for each weak dimension
    const path: Array<{
      dimension: string;
      priority: string;
      questions: string[];
      count: number;
    }> = [];

    if (existsSync(DB_PATH)) {
      try {
        const { openDatabase } = await import('../../db/database.js');
        const db = openDatabase(DB_PATH);

        for (const dim of weakDimensions) {
          const rows = db
            .prepare(
              `SELECT question FROM knowledge
               WHERE dimension = ? AND question IS NOT NULL
               ORDER BY RANDOM()
               LIMIT 5`,
            )
            .all(dim) as Array<{ question: string }>;

          path.push({
            dimension: dim,
            priority: PRIORITY[dim] ?? '待定',
            questions: rows.map((r) => r.question),
            count: rows.length,
          });
        }
        db.close();
      } catch {}
    }

    // Fallback for dims where DB returned nothing
    for (const dim of weakDimensions) {
      if (!path.find((p) => p.dimension === dim)) {
        path.push({ dimension: dim, priority: PRIORITY[dim] ?? '待定', questions: [], count: 0 });
      }
    }

    // Sort by priority
    path.sort((a, b) => PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority));

    // Enrich with weakness scores from memory store
    const weaknessScores: Record<string, number[]> = {};
    if (ctx.memoryStore) {
      const entries = ctx.memoryStore.query({ type: 'weakness', limit: 50 });
      for (const e of entries) {
        const dimMatch = e.content.match(/维度:\s*(\S+)/);
        const scoreMatch = e.content.match(/得分:\s*(\d+)/);
        if (dimMatch && scoreMatch) {
          const d = dimMatch[1];
          const s = parseInt(scoreMatch[1], 10);
          if (!weaknessScores[d]) weaknessScores[d] = [];
          weaknessScores[d].push(s);
        }
      }
    }

    const enriched = path.map((p) => {
      const scores = weaknessScores[p.dimension];
      const avgScore = scores && scores.length > 0
        ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length * 10) / 10
        : null;
      return { ...p, avgScore };
    });

    const totalTopics = enriched.reduce((s, p) => s + p.count, 0);
    const estimatedDays = Math.max(3, Math.ceil(totalTopics * 0.8));

    return {
      success: true,
      output: JSON.stringify({
        targetRole: targetRole ?? 'AI Agent 工程师',
        timeframe: timeframe ?? `建议 ${estimatedDays} 天`,
        path: enriched,
        strategy: [
          '每天专攻 1 个维度，用本系统的诊断工具逐题练习',
          '每道题用"定义 → 工程细节 → 踩坑经验"三段式答完再对比高手答案',
          '练完一个维度后再问我"我的薄弱点在哪里"确认提升效果',
        ],
      }),
    };
  },
};
