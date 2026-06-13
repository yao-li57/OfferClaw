import type { ToolSchema } from '../query-engine/types.js';
import type { ToolContext, ToolDefinition, ToolResult } from './types.js';

export class ToolRegistry {
  private tools = new Map<string, ToolDefinition>();

  register(def: ToolDefinition): void {
    this.tools.set(def.schema.name, def);
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  async execute(name: string, input: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return { success: false, output: `Tool "${name}" not found` };
    }
    return tool.execute(input, ctx);
  }

  listSchemas(): ToolSchema[] {
    return Array.from(this.tools.values()).map((t) => t.schema);
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }
}
