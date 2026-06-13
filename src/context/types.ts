import type { Message } from '../query-engine/types.js';

export interface ContextLayer {
  name: string;
  priority: number;
  content: string;
  tokenCount?: number;
}

export interface ContextWindow {
  system: ContextLayer;
  knowledge: ContextLayer;
  memory: ContextLayer;
  session: ContextLayer;
  immediate: ContextLayer;
}

export type CompressionLevel = 'none' | 'summary' | 'aggressive';

export interface CompressionResult {
  messages: Message[];
  level: CompressionLevel;
  originalTokens: number;
  compressedTokens: number;
}
