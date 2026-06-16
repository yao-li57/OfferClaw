import type { ToolSchema } from '../query-engine/types.js';
import type { MemoryStore } from '../memory/store.js';

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface ToolDefinition {
  schema: ToolSchema;
  riskLevel: RiskLevel;
  execute: (input: Record<string, unknown>, ctx: ToolContext) => Promise<ToolResult>;
}

export interface ToolContext {
  sessionId: string;
  userId?: string;
  abortSignal?: AbortSignal;
  memoryStore?: MemoryStore;
}

export interface ToolResult {
  success: boolean;
  output: string;
  metadata?: Record<string, unknown>;
}
