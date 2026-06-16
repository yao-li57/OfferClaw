import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ToolDefinition } from '../types.js';

const DB_PATH = resolve('data/agent.db');

// Fallback behavioral/project questions (not in knowledge base)
const NON_TECH = [
  { q: '你做过的最复杂的 Agent 项目是什么？遇到了什么核心难点？', dim: 'project' },
  { q: '你在项目中是如何做技术选型的？举一个关键决策的例子', dim: 'project' },
  { q: '说一个你优化系统性能的案例，量化结果是什么？', dim: 'project' },
  { q: '你如何衡量 Agent 的输出质量？用过什么评测方案？', dim: 'project' },
  { q: '说一个你和团队意见不一致的例子，最终怎么解决的？', dim: 'behavioral' },
  { q: '你是怎么在紧急 deadline 下保证交付质量的？', dim: 'behavioral' },
  { q: '你是怎么快速学习一个新技术领域的？举个最近的例子', dim: 'behavioral' },
];

// knowledge.dimension → mock-interview "technical" category
const TECH_DIMS = ['architecture', 'engineering', 'model', 'rag', 'multi-agent', 'evaluation', 'full-stack'];

export const mockInterview: ToolDefinition = {
  schema: {
    name: 'mock_interview',
    description: '根据 JD 和简历生成模拟面试题目序列，覆盖技术深度、项目经验、行为面试三个维度',
    parameters: {
      type: 'object',
      properties: {
        jdText: { type: 'string', description: 'JD 内容（可选）' },
        resumeText: { type: 'string', description: '简历内容（可选）' },
        dimension: {
          type: 'string',
          enum: ['technical', 'project', 'behavioral', 'mixed'],
          description: '面试维度（默认 mixed）',
        },
        difficulty: {
          type: 'string',
          enum: ['easy', 'medium', 'hard'],
          description: '难度（默认 medium）',
        },
        count: { type: 'number', description: '题目数量（默认 5）' },
      },
    },
  },
  riskLevel: 'low',
  async execute(input) {
    const {
      jdText,
      dimension = 'mixed',
      difficulty = 'medium',
      count = 5,
    } = input as {
      jdText?: string;
      resumeText?: string;
      dimension?: string;
      difficulty?: string;
      count?: number;
    };

    const techCount = dimension === 'behavioral' ? 0
      : dimension === 'project' ? 0
      : dimension === 'technical' ? count
      : Math.ceil(count * 0.6); // mixed: 60% technical

    const otherCount = count - techCount;

    const techQuestions: Array<{ question: string; dimension: string; difficulty: string }> = [];

    // Pull technical questions from knowledge DB
    if (techCount > 0 && existsSync(DB_PATH)) {
      try {
        const { openDatabase } = await import('../../db/database.js');
        const db = openDatabase(DB_PATH);

        // Filter dims if JD hints at specific area
        let dimsFilter = TECH_DIMS;
        if (jdText) {
          const lower = jdText.toLowerCase();
          const hinted = TECH_DIMS.filter((d) => lower.includes(d.replace('-', ' ')) || lower.includes(d));
          if (hinted.length > 0) dimsFilter = hinted;
        }

        const placeholders = dimsFilter.map(() => '?').join(',');
        const rows = db
          .prepare(
            `SELECT dimension, question, expert_answer
             FROM knowledge
             WHERE question IS NOT NULL
               AND dimension IN (${placeholders})
             ORDER BY RANDOM()
             LIMIT ?`,
          )
          .all(...dimsFilter, techCount + 5) as Array<{
            dimension: string;
            question: string;
            expert_answer: string | null;
          }>;
        db.close();

        for (const r of rows.slice(0, techCount)) {
          // Estimate difficulty by expert_answer length
          const len = r.expert_answer?.length ?? 0;
          const diff = len < 200 ? 'easy' : len < 500 ? 'medium' : 'hard';

          // Filter by requested difficulty
          if (difficulty === 'easy' && diff === 'hard') continue;
          if (difficulty === 'hard' && diff === 'easy') continue;

          techQuestions.push({ question: r.question, dimension: r.dimension, difficulty: diff });
        }
      } catch {}
    }

    // Fill remaining with non-tech questions
    const otherPool = NON_TECH.filter((q) =>
      dimension === 'mixed' || q.dim === dimension,
    ).sort(() => Math.random() - 0.5);

    const otherQuestions = otherPool.slice(0, Math.max(otherCount, count - techQuestions.length));

    const allQuestions = [
      ...techQuestions,
      ...otherQuestions.map((q) => ({ question: q.q, dimension: q.dim, difficulty: 'medium' })),
    ].slice(0, count);

    return {
      success: true,
      output: JSON.stringify({
        dimension,
        difficulty,
        totalQuestions: allQuestions.length,
        questions: allQuestions.map((q, i) => ({
          index: i + 1,
          question: q.question,
          dimension: q.dimension,
          difficulty: q.difficulty,
        })),
        tips: [
          '技术题先给结论（1句话），再展开细节，最后说实战经验',
          '每道题用"是什么 → 为什么 → 怎么做 → 踩过什么坑"四段式',
          '主动提量化结果（数字、百分比、规模）',
        ],
      }),
    };
  },
};
