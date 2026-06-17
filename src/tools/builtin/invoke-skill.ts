import type { SkillRegistry } from '../../skills/registry.js';
import type { QueryEngine } from '../../query-engine/engine.js';
import type { ToolRegistry } from '../registry.js';
import type { ToolDefinition } from '../types.js';

export function createInvokeSkillTool(
  skillRegistry: SkillRegistry,
  queryEngine: QueryEngine,
  toolRegistry: ToolRegistry,
): ToolDefinition {
  const skillDescriptions = skillRegistry
    .list()
    .map((s) => `  • ${s.id}: ${s.description}`)
    .join('\n');

  return {
    schema: {
      name: 'invoke_skill',
      description: `执行预定义 Skill（技能）。每个 Skill 内部编排多个工具完成复合任务，比单独调用工具更高效。\n\n可用 Skills：\n${skillDescriptions}`,
      parameters: {
        type: 'object',
        properties: {
          skillId: {
            type: 'string',
            enum: skillRegistry.list().map((s) => s.id),
            description: '要执行的 Skill ID',
          },
          input: {
            type: 'object',
            description: 'Skill 的输入参数（参见各 Skill 的说明）',
          },
        },
        required: ['skillId', 'input'],
      },
    },
    riskLevel: 'low',

    async execute(rawInput, ctx) {
      const { skillId, input } = rawInput as {
        skillId: string;
        input: Record<string, unknown>;
      };

      const skill = skillRegistry.get(skillId);
      if (!skill) {
        const available = skillRegistry.list().map((s) => s.id).join(', ');
        return {
          success: false,
          output: JSON.stringify({ error: `Skill "${skillId}" not found. Available: ${available}` }),
        };
      }

      const steps: { step: string; status: 'done' | 'failed'; data?: unknown; error?: string }[] = [];
      let finalResult: unknown = null;

      try {
        for await (const event of skill.run(input, {
          queryEngine,
          toolRegistry,
          sessionId: ctx.sessionId,
          memoryStore: ctx.memoryStore,
        })) {
          if (event.type === 'step_done' || event.type === 'step_failed') {
            steps.push({
              step: event.step ?? '',
              status: event.type === 'step_done' ? 'done' : 'failed',
              data: event.data,
              error: event.error,
            });
          }
          if (event.type === 'result') finalResult = event.data;
        }
      } catch (err) {
        return {
          success: false,
          output: JSON.stringify({ error: (err as Error).message, steps }),
        };
      }

      return {
        success: true,
        output: JSON.stringify({ skillId, steps, result: finalResult }),
      };
    },
  };
}
