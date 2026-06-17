import type { DiagnosisOrchestrator } from '../../agent/orchestrator.js';
import type { ToolDefinition } from '../types.js';

export function createParallelDiagnoseTool(orchestrator: DiagnosisOrchestrator): ToolDefinition {
  return {
    schema: {
      name: 'parallel_diagnose',
      description:
        '多维度并行诊断面试回答：内容诊断（技术深度/概念覆盖）+ 表达诊断（结构/逻辑/语言）+ 语音分析（提供音频转录时才运行）。三通道并发执行，速度比串行快 2-3x。适合完整的面试回答诊断场景。',
      parameters: {
        type: 'object',
        properties: {
          question: { type: 'string', description: '面试题目' },
          answer: { type: 'string', description: '用户的回答内容（文字）' },
          audioTranscript: {
            type: 'string',
            description:
              '音频转录文本（可选）。提供后会额外运行语音表达分析维度（口头禅、流畅度）。',
          },
          interviewDimension: {
            type: 'string',
            enum: [
              'architecture',
              'engineering',
              'model',
              'rag',
              'multi-agent',
              'evaluation',
              'full-stack',
            ],
            description: '问题所属技术维度（可选，用于评分记录）',
          },
        },
        required: ['question', 'answer'],
      },
    },
    riskLevel: 'low',

    async execute(input, ctx) {
      const { question, answer, audioTranscript, interviewDimension } = input as {
        question: string;
        answer: string;
        audioTranscript?: string;
        interviewDimension?: string;
      };

      const result = await orchestrator.diagnose({
        question,
        answer,
        audioTranscript,
        sessionId: ctx.sessionId,
        interviewDimension,
      });

      // Mirror diagnose_answer: write to memoryStore for weakness tracking
      if (ctx.memoryStore) {
        const questionKey = `题目: ${question.slice(0, 80)}`;
        ctx.memoryStore.removeByContent(questionKey);

        const score = result.overallScore;
        const memType = score < 6 ? 'weakness' : score >= 8 ? 'strength' : 'context';
        ctx.memoryStore.add({
          sessionId: 'global',
          type: memType,
          content: `维度: ${interviewDimension ?? 'unknown'} | 综合得分: ${score}/10 | 题目: ${question.slice(0, 80)}`,
          importance: memType === 'weakness' ? 0.9 : 0.7,
        });
      }

      return { success: true, output: JSON.stringify(result) };
    },
  };
}
