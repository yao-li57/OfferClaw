export interface CommandResult {
  output: string;
  shouldContinue: boolean;
  metadata?: Record<string, unknown>;
}

export interface CommandHandler {
  name: string;
  aliases: string[];
  description: string;
  execute: (args: string[], ctx: CommandContext) => Promise<CommandResult>;
}

export interface CommandContext {
  sessionId: string;
  app: unknown;
}
