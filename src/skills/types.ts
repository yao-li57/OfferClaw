import type { QueryEngine } from '../query-engine/engine.js';
import type { ToolRegistry } from '../tools/registry.js';
import type { MemoryStore } from '../memory/store.js';

export type SkillEventType = 'step_start' | 'step_done' | 'step_failed' | 'result';

export interface SkillEvent {
  type: SkillEventType;
  step?: string;
  data?: unknown;
  error?: string;
}

export interface SkillContext {
  queryEngine: QueryEngine;
  toolRegistry: ToolRegistry;
  sessionId: string;
  memoryStore?: MemoryStore;
}

export type SkillInput = Record<string, unknown>;

export interface Skill {
  id: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, { type: string; description: string; enum?: string[] }>;
    required: string[];
  };
  run(input: SkillInput, ctx: SkillContext): AsyncGenerator<SkillEvent>;
}
