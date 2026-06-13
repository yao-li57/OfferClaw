import type { ToolResult } from '../tools/types.js';
import type { Hook, HookContext, HookStage } from './types.js';

export class HookPipeline {
  private hooks: Hook[] = [];

  register(hook: Hook): void {
    this.hooks.push(hook);
    this.hooks.sort((a, b) => a.priority - b.priority);
  }

  async runPreTool(
    ctx: Omit<HookContext, 'result'>,
  ): Promise<{ proceed: boolean; input: Record<string, unknown>; reason?: string }> {
    const preHooks = this.hooks.filter((h) => h.stage === 'pre-tool');
    let currentInput = { ...ctx.input };

    for (const hook of preHooks) {
      const result = await hook.execute({ ...ctx, input: currentInput });

      if (result.action === 'skip') {
        return { proceed: false, input: currentInput, reason: result.reason };
      }
      if (result.action === 'modify' && result.modifiedInput) {
        currentInput = result.modifiedInput;
      }
    }

    return { proceed: true, input: currentInput };
  }

  async runPostTool(ctx: HookContext): Promise<ToolResult> {
    const postHooks = this.hooks.filter((h) => h.stage === 'post-tool');
    let currentResult = ctx.result!;

    for (const hook of postHooks) {
      const hookResult = await hook.execute({ ...ctx, result: currentResult });

      if (hookResult.action === 'modify' && hookResult.modifiedResult) {
        currentResult = hookResult.modifiedResult;
      }
    }

    return currentResult;
  }

  getHooks(stage?: HookStage): Hook[] {
    if (!stage) return this.hooks;
    return this.hooks.filter((h) => h.stage === stage);
  }
}
