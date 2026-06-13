import type { ParsedResponse, StreamEvent, ToolCall, TokenUsage } from './types.js';

export class StreamCollector {
  private text = '';
  private toolCalls: ToolCall[] = [];
  private currentToolInput = '';
  private currentToolId = '';
  private currentToolName = '';
  private usage: TokenUsage = { inputTokens: 0, outputTokens: 0 };
  private stopReason: 'end_turn' | 'tool_use' | 'max_tokens' = 'end_turn';

  feed(event: StreamEvent): void {
    switch (event.type) {
      case 'text_delta':
        this.text += event.content;
        break;
      case 'tool_use_start':
        this.currentToolId = event.id;
        this.currentToolName = event.name;
        this.currentToolInput = '';
        break;
      case 'tool_use_delta':
        this.currentToolInput += event.input;
        break;
      case 'tool_use_end':
        this.toolCalls.push({
          id: this.currentToolId,
          name: this.currentToolName,
          input: this.parseInput(this.currentToolInput),
        });
        this.currentToolId = '';
        this.currentToolName = '';
        this.currentToolInput = '';
        break;
      case 'message_end':
        this.usage = event.usage;
        this.stopReason = event.stopReason;
        break;
    }
  }

  result(): ParsedResponse {
    return {
      type: this.toolCalls.length > 0 ? 'tool_use' : 'text',
      content: this.text || undefined,
      toolCalls: this.toolCalls.length > 0 ? this.toolCalls : undefined,
      usage: this.usage,
      stopReason: this.stopReason,
    };
  }

  private parseInput(raw: string): Record<string, unknown> {
    if (!raw) return {};
    try {
      return JSON.parse(raw);
    } catch {
      return { _raw: raw };
    }
  }
}
