import type { CommandHandler } from '../types.js';
import type { SkillRegistry } from '../../skills/registry.js';

export function createSkillsCommand(skillRegistry: SkillRegistry): CommandHandler {
  return {
    name: 'skills',
    aliases: ['sk'],
    description: '列出所有可用 Skills',
    async execute() {
      const skills = skillRegistry.list();
      if (skills.length === 0) {
        return { output: '（当前没有注册的 Skill）', shouldContinue: true };
      }
      const lines = skills.map(
        (s) => `  • ${s.id.padEnd(20)} ${s.description}`,
      );
      return {
        output: `可用 Skills（通过 invoke_skill 工具或直接请求触发）：\n${lines.join('\n')}`,
        shouldContinue: true,
      };
    },
  };
}
