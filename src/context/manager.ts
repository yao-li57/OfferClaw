import type { Message } from '../query-engine/types.js';
import type { CompressionLevel, CompressionResult, ContextLayer, ContextWindow } from './types.js';

const DEFAULT_MAX_TOKENS = 100000;

export class ContextManager {
  private maxTokens: number;
  private layers: Partial<ContextWindow> = {};

  constructor(maxTokens?: number) {
    this.maxTokens = maxTokens ?? DEFAULT_MAX_TOKENS;
  }

  setLayer(name: keyof ContextWindow, content: string, priority?: number): void {
    this.layers[name] = {
      name,
      priority: priority ?? this.defaultPriority(name),
      content,
      tokenCount: this.estimateTokens(content),
    };
  }

  buildSystemPrompt(): string {
    const sorted = Object.values(this.layers)
      .filter((l): l is ContextLayer => !!l && !!l.content)
      .sort((a, b) => b.priority - a.priority);

    return sorted.map((l) => l.content).join('\n\n');
  }

  compress(messages: Message[], targetTokens?: number): CompressionResult {
    const target = targetTokens ?? Math.floor(this.maxTokens * 0.6);
    const originalTokens = this.estimateMessagesTokens(messages);

    if (originalTokens <= target) {
      return { messages, level: 'none', originalTokens, compressedTokens: originalTokens };
    }

    const ratio = originalTokens / target;

    if (ratio < 2) {
      const compressed = this.summarizeOlderMessages(messages);
      return {
        messages: compressed,
        level: 'summary',
        originalTokens,
        compressedTokens: this.estimateMessagesTokens(compressed),
      };
    }

    const compressed = this.aggressiveCompress(messages);
    return {
      messages: compressed,
      level: 'aggressive',
      originalTokens,
      compressedTokens: this.estimateMessagesTokens(compressed),
    };
  }

  private summarizeOlderMessages(messages: Message[]): Message[] {
    const keepRecent = Math.max(6, Math.floor(messages.length * 0.4));
    const older = messages.slice(0, -keepRecent);
    const recent = messages.slice(-keepRecent);

    if (older.length === 0) return messages;

    const summaryText = older
      .filter((m) => m.content)
      .map((m) => `[${m.role}]: ${m.content!.slice(0, 200)}`)
      .join('\n');

    const summaryMsg: Message = {
      role: 'user',
      content: `[Earlier conversation summary]\n${summaryText}`,
    };

    return [summaryMsg, ...recent];
  }

  private aggressiveCompress(messages: Message[]): Message[] {
    const keepRecent = 4;
    const recent = messages.slice(-keepRecent);

    const topicSummary = messages
      .filter((m) => m.role === 'user' && m.content)
      .map((m) => m.content!.slice(0, 80))
      .slice(0, 5)
      .join('; ');

    const summaryMsg: Message = {
      role: 'user',
      content: `[Conversation context: ${topicSummary}]`,
    };

    return [summaryMsg, ...recent];
  }

  private defaultPriority(name: keyof ContextWindow): number {
    const map: Record<keyof ContextWindow, number> = {
      system: 100,
      knowledge: 80,
      memory: 60,
      session: 40,
      immediate: 90,
    };
    return map[name];
  }

  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 3.5);
  }

  private estimateMessagesTokens(messages: Message[]): number {
    return messages.reduce((sum, m) => sum + this.estimateTokens(m.content ?? ''), 0);
  }
}
