import type { ToolResult } from '../tools/types.js';

export type HookStage = 'pre-tool' | 'post-tool';

export interface HookContext {
  sessionId: string;
  toolName: string;
  input: Record<string, unknown>;
  result?: ToolResult;
  metadata?: Record<string, unknown>;
}

export type HookAction = 'continue' | 'skip' | 'modify';

export interface HookResult {
  action: HookAction;
  modifiedInput?: Record<string, unknown>;
  modifiedResult?: ToolResult;
  reason?: string;
}

export interface Hook {
  name: string;
  stage: HookStage;
  priority: number;
  execute: (ctx: HookContext) => Promise<HookResult>;
}
