import type { QueryEngine } from '../query-engine/engine.js';
import type { Message } from '../query-engine/types.js';
import type { DiagnosisDimension, DiagnosisTask, DimensionResult } from './types.js';

const DEFAULT_TIMEOUT_MS = 30_000;

const DIMENSION_PROMPTS: Record<DiagnosisDimension, string> = {
  content: `你是内容诊断专家 Sub-agent。专注评估面试回答的技术内容质量。

评估维度：
1. 核心概念覆盖：是否提到了关键技术点
2. 技术深度：是原理层级（why/how）还是仅表面描述（what）
3. 准确性：是否有错误或不精确的陈述
4. 工程实践：是否展示了实际踩坑经验和权衡取舍

评分标准（0-10）：
0-3: 内容严重不足或有明显错误
4-5: 内容基本正确但停留表面
6-7: 有一定深度，覆盖主要概念
8-9: 深入准确，有工程实践视角
10: 覆盖全面且有独到见解

输出严格遵守此 JSON 格式，不要包含任何其他文字：
{
  "score": <整数 0-10>,
  "strengths": [<最多3条，每条20字以内>],
  "gaps": [<最多4条，每条30字以内>],
  "suggestions": [<最多3条，每条50字以内>]
}`,

  expression: `你是表达质量诊断专家 Sub-agent。专注评估面试回答的表达方式。

评估维度：
1. 结构：是否分点清晰、层次分明，有开头定义和结尾总结
2. 逻辑：论述是否递进，有没有逻辑断层或跳跃
3. 语言：是否专业简洁，避免口语化，用词准确
4. 完整性：是否回答了问题的各个方面，没有遗漏核心

评分标准（0-10）：
0-3: 表达混乱，难以理解
4-5: 能表达意思但结构松散
6-7: 结构较清晰，有分点
8-9: 逻辑严密，表达专业流畅
10: 教科书式清晰，有开闭环

输出严格遵守此 JSON 格式，不要包含任何其他文字：
{
  "score": <整数 0-10>,
  "strengths": [<最多3条，每条20字以内>],
  "gaps": [<最多4条，每条30字以内>],
  "suggestions": [<最多3条，每条50字以内>]
}`,

  speech: `你是语音表达分析专家 Sub-agent。分析口头表达质量（基于音频转录文本）。

评估维度：
1. 口头禅：是否有重复的填充词（"那个"、"就是"、"然后"、"嗯"、"uh"、"um"）
2. 流畅性：是否有明显停顿、中断、重新开始
3. 表达重复：是否同一词语或句式反复出现
4. 语速感知：基于句子密度和标点判断语速是否合适

注意：只分析口语表达质量，不评估技术内容是否正确。

评分标准（0-10）：
0-3: 频繁填充词，表达严重不流畅
4-5: 有多处填充词，偶有中断
6-7: 基本流畅，填充词偶尔出现
8-9: 表达流畅，极少填充词
10: 专业级流畅，几乎无填充词

输出严格遵守此 JSON 格式，不要包含任何其他文字：
{
  "score": <整数 0-10>,
  "strengths": [<最多3条，每条20字以内>],
  "gaps": [<最多4条，每条30字以内>],
  "suggestions": [<最多3条，每条50字以内>]
}`,
};

function extractJson(text: string): Record<string, unknown> | null {
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {}
  const match = text.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      return JSON.parse(match[0]) as Record<string, unknown>;
    } catch {}
  }
  return null;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function toStringArray(val: unknown): string[] {
  if (!Array.isArray(val)) return [];
  return val.map((v) => String(v)).filter(Boolean);
}

function degraded(
  dimension: DiagnosisDimension,
  duration: number,
  error: string,
): DimensionResult {
  return {
    dimension,
    score: 0,
    maxScore: 10,
    strengths: [],
    gaps: [],
    suggestions: [],
    success: false,
    error,
    duration,
    tokenUsage: { input: 0, output: 0 },
  };
}

export class SubAgent {
  constructor(
    private queryEngine: QueryEngine,
    private model?: string,
  ) {}

  async run(
    dimension: DiagnosisDimension,
    task: DiagnosisTask,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  ): Promise<DimensionResult> {
    const start = Date.now();

    let userContent: string;
    if (dimension === 'speech') {
      userContent = task.audioTranscript
        ? `题目：${task.question}\n\n音频转录：${task.audioTranscript}`
        : `题目：${task.question}\n\n回答（文本）：${task.answer}`;
    } else {
      userContent = `题目：${task.question}\n\n回答：${task.answer}`;
    }

    const messages: Message[] = [{ role: 'user', content: userContent }];

    const execute = async (): Promise<DimensionResult> => {
      try {
        const response = await this.queryEngine.query({
          model: this.model,
          messages,
          systemPrompt: DIMENSION_PROMPTS[dimension],
          maxTokens: 512,
          temperature: 0.2,
        });

        const duration = Date.now() - start;
        const parsed = extractJson(response.content ?? '');

        if (!parsed) {
          return {
            dimension,
            score: 5,
            maxScore: 10,
            strengths: [],
            gaps: ['无法解析诊断结果'],
            suggestions: [],
            success: false,
            error: 'JSON parse failed',
            duration,
            tokenUsage: {
              input: response.usage.inputTokens,
              output: response.usage.outputTokens,
            },
          };
        }

        return {
          dimension,
          score: clamp(Number(parsed.score) || 5, 0, 10),
          maxScore: 10,
          strengths: toStringArray(parsed.strengths).slice(0, 3),
          gaps: toStringArray(parsed.gaps).slice(0, 4),
          suggestions: toStringArray(parsed.suggestions).slice(0, 3),
          success: true,
          duration,
          tokenUsage: {
            input: response.usage.inputTokens,
            output: response.usage.outputTokens,
          },
        };
      } catch (err) {
        return degraded(dimension, Date.now() - start, (err as Error).message);
      }
    };

    const timeout = new Promise<DimensionResult>((resolve) =>
      setTimeout(() => resolve(degraded(dimension, timeoutMs, `Timeout after ${timeoutMs}ms`)), timeoutMs),
    );

    return Promise.race([execute(), timeout]);
  }
}
