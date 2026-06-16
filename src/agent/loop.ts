import type { Message, ParsedResponse, QueryParams, ToolCall } from '../query-engine/types.js';
import type { QueryEngine } from '../query-engine/engine.js';
import type { ToolRegistry } from '../tools/registry.js';
import type { PermissionGate } from '../permission/gate.js';
import type { ContextManager } from '../context/manager.js';
import type { SessionManager } from '../session/manager.js';
import type { MemoryStore } from '../memory/store.js';
import type { HookPipeline } from '../hooks/pipeline.js';

export interface AgentConfig {
  queryEngine: QueryEngine;
  toolRegistry: ToolRegistry;
  permissionGate: PermissionGate;
  contextManager: ContextManager;
  sessionManager: SessionManager;
  memoryStore: MemoryStore;
  hookPipeline?: HookPipeline;
  maxIterations?: number;
  defaultModel?: string;
  onTextDelta?: (text: string) => void;
  onToolCall?: (name: string, input: Record<string, unknown>) => void;
  onToolResult?: (name: string, result: string) => void;
}

export interface RunOptions {
  model?: string;
  onTextDelta?: (text: string) => void;
  onToolCall?: (name: string, input: Record<string, unknown>) => void;
  onToolResult?: (name: string, result: string) => void;
}

export class AgentLoop {
  private config: AgentConfig;
  private maxIterations: number;

  constructor(config: AgentConfig) {
    this.config = config;
    this.maxIterations = config.maxIterations ?? 10;
  }

  async run(sessionId: string, userMessage: string, opts?: RunOptions): Promise<string> {
    const { queryEngine, toolRegistry, contextManager, sessionManager, memoryStore } = this.config;

    const onTextDelta = opts?.onTextDelta ?? this.config.onTextDelta;
    const onToolCall = opts?.onToolCall ?? this.config.onToolCall;
    const onToolResult = opts?.onToolResult ?? this.config.onToolResult;

    const session = sessionManager.get(sessionId);
    if (!session) throw new Error(`Session ${sessionId} not found`);

    if (session.state === 'idle') {
      sessionManager.transition(sessionId, 'active');
    }

    sessionManager.addMessage(sessionId, { role: 'user', content: userMessage });

    const memories = memoryStore.query({ sessionId, limit: 5 });
    const weaknesses = memoryStore.query({ type: 'weakness', limit: 5 });
    const allMemories = [...weaknesses, ...memories].slice(0, 8);
    if (allMemories.length > 0) {
      const memoryText = allMemories.map((m) => `- [${m.type}] ${m.content}`).join('\n');
      contextManager.setLayer('memory', `User context:\n${memoryText}`);
    }

    const systemPrompt = contextManager.buildSystemPrompt();
    let messages = [...session.messages];
    let finalText = '';

    for (let i = 0; i < this.maxIterations; i++) {
      const compressed = contextManager.compress(messages);
      messages = compressed.messages;

      const params: QueryParams = {
        model: opts?.model ?? this.config.defaultModel,
        messages,
        tools: toolRegistry.listSchemas(),
        systemPrompt,
        onTextDelta,
      };

      const response: ParsedResponse = await queryEngine.query(params);

      if (response.type === 'text') {
        finalText = response.content ?? '';
        sessionManager.addMessage(sessionId, { role: 'assistant', content: finalText });
        break;
      }

      if (response.type === 'tool_use' && response.toolCalls) {
        const assistantMsg: Message = {
          role: 'assistant',
          content: response.content,
          toolCalls: response.toolCalls,
        };
        sessionManager.addMessage(sessionId, assistantMsg);
        messages.push(assistantMsg);

        for (const toolCall of response.toolCalls) {
      const result = await this.executeTool(toolCall, sessionId, { onToolCall, onToolResult, memoryStore });
          const toolMsg: Message = {
            role: 'tool',
            toolCallId: toolCall.id,
            content: result,
          };
          sessionManager.addMessage(sessionId, toolMsg);
          messages.push(toolMsg);
        }
      }
    }

    return finalText;
  }

  private async executeTool(
    toolCall: ToolCall,
    sessionId: string,
    handlers?: Pick<RunOptions, 'onToolCall' | 'onToolResult'> & { memoryStore?: import('../memory/store.js').MemoryStore },
  ): Promise<string> {
    const { toolRegistry, permissionGate, hookPipeline } = this.config;

    const tool = toolRegistry.get(toolCall.name);
    if (!tool) return JSON.stringify({ error: `Tool "${toolCall.name}" not found` });

    const decision = permissionGate.check(toolCall.name, tool.riskLevel, sessionId);
    if (!decision.allowed) {
      return JSON.stringify({ error: `Permission denied: ${decision.reason}` });
    }

    let input = toolCall.input;

    // Run pre-tool hooks
    if (hookPipeline) {
      const preResult = await hookPipeline.runPreTool({
        sessionId,
        toolName: toolCall.name,
        input,
      });
      if (!preResult.proceed) {
        return JSON.stringify({ skipped: true, reason: preResult.reason });
      }
      input = preResult.input;
    }

    handlers?.onToolCall?.(toolCall.name, input);

    let result = await toolRegistry.execute(toolCall.name, input, { sessionId, memoryStore: handlers?.memoryStore });

    // Run post-tool hooks
    if (hookPipeline) {
      result = await hookPipeline.runPostTool({
        sessionId,
        toolName: toolCall.name,
        input,
        result,
      });
    }

    permissionGate.recordAudit({
      timestamp: Date.now(),
      sessionId,
      toolName: toolCall.name,
      riskLevel: tool.riskLevel,
      decision: 'allowed',
      input,
    });

    handlers?.onToolResult?.(toolCall.name, result.output);

    return result.output;
  }
}
