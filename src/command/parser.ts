import type { CommandContext, CommandHandler, CommandResult } from './types.js';

export class CommandParser {
  private handlers = new Map<string, CommandHandler>();

  register(handler: CommandHandler): void {
    this.handlers.set(handler.name, handler);
    for (const alias of handler.aliases) {
      this.handlers.set(alias, handler);
    }
  }

  isCommand(input: string): boolean {
    return input.startsWith('/');
  }

  async execute(input: string, ctx: CommandContext): Promise<CommandResult> {
    const parts = input.slice(1).split(/\s+/);
    const name = parts[0]?.toLowerCase();
    const args = parts.slice(1);

    if (!name) {
      return { output: '无效命令', shouldContinue: true };
    }

    const handler = this.handlers.get(name);
    if (!handler) {
      const available = this.listCommands().map((c) => `/${c.name}`).join(', ');
      return { output: `未知命令 "/${name}"\n可用命令：${available}`, shouldContinue: true };
    }

    return handler.execute(args, ctx);
  }

  listCommands(): CommandHandler[] {
    const unique = new Map<string, CommandHandler>();
    for (const handler of this.handlers.values()) {
      unique.set(handler.name, handler);
    }
    return Array.from(unique.values());
  }
}
