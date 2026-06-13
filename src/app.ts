import { QueryEngine } from './query-engine/index.js';
import { ClaudeProvider } from './query-engine/providers/claude.js';
import { OpenAIProvider } from './query-engine/providers/openai.js';
import { DeepSeekProvider } from './query-engine/providers/deepseek.js';
import { MockProvider } from './query-engine/providers/mock.js';
import { createToolRegistry } from './tools/index.js';
import { PermissionGate } from './permission/index.js';
import { ContextManager } from './context/index.js';
import { SessionManager } from './session/index.js';
import { MemoryStore } from './memory/index.js';
import { AgentLoop } from './agent/index.js';
import { HookPipeline, inputSanitizerHook, tokenCounterHook } from './hooks/index.js';
import {
  CommandParser,
  helpCommand,
  statusCommand,
  dimensionsCommand,
  quitCommand,
  resetCommand,
} from './command/index.js';

const SYSTEM_PROMPT = `你是一个面试诊断 Agent，专注于 AI Agent / LLM 工程领域的面试辅导。

你的能力：
1. 搜索知识库中的 385+ 道真实面试题及高手答案
2. 对用户的回答进行结构化诊断（评分 + 差距分析 + 改进建议）
3. 模拟面试官追问
4. 对比用户答案与专家答案的差距
5. 推荐个性化学习路径

工作方式：
- 用户输入面试题或选择维度后，引导其作答
- 收到回答后调用诊断工具进行分析
- 给出"新手答 vs 高手答"对比和改进方向
- 主动追问以检验理解深度`;

export interface AppOptions {
  model?: string;
  onTextDelta?: (text: string) => void;
  onToolCall?: (name: string, input: Record<string, unknown>) => void;
  onToolResult?: (name: string, result: string) => void;
}

export function createApp(opts?: AppOptions) {
  const providers = buildProviders();

  const queryEngine = new QueryEngine({
    providers,
    retry: { maxRetries: 3 },
  });

  const toolRegistry = createToolRegistry();
  const permissionGate = new PermissionGate();
  const contextManager = new ContextManager();
  const sessionManager = new SessionManager();
  const memoryStore = new MemoryStore();

  const hookPipeline = new HookPipeline();
  hookPipeline.register(inputSanitizerHook);
  hookPipeline.register(tokenCounterHook);

  const commandParser = new CommandParser();
  commandParser.register(helpCommand);
  commandParser.register(statusCommand);
  commandParser.register(dimensionsCommand);
  commandParser.register(quitCommand);
  commandParser.register(resetCommand);

  contextManager.setLayer('system', SYSTEM_PROMPT);

  const agent = new AgentLoop({
    queryEngine,
    toolRegistry,
    permissionGate,
    contextManager,
    sessionManager,
    memoryStore,
    hookPipeline,
    defaultModel: opts?.model,
    onTextDelta: opts?.onTextDelta,
    onToolCall: opts?.onToolCall,
    onToolResult: opts?.onToolResult,
  });

  return { agent, sessionManager, queryEngine, toolRegistry, memoryStore, commandParser, hookPipeline };
}

function buildProviders() {
  const configs = [];

  if (process.env.ANTHROPIC_API_KEY) {
    configs.push({
      provider: new ClaudeProvider(),
      models: ['claude-sonnet-4-20250514', 'claude-haiku-4-5-20251001', 'claude-opus-4-20250514'],
      defaultModel: 'claude-sonnet-4-20250514',
    });
  }

  if (process.env.OPENAI_API_KEY) {
    configs.push({
      provider: new OpenAIProvider(),
      models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'],
      defaultModel: 'gpt-4o',
    });
  }

  if (process.env.DEEPSEEK_API_KEY) {
    configs.push({
      provider: new DeepSeekProvider(),
      models: ['deepseek-chat', 'deepseek-coder'],
      defaultModel: 'deepseek-chat',
    });
  }

  // Fallback to mock provider when no API keys are configured
  if (configs.length === 0) {
    configs.push({
      provider: new MockProvider(),
      models: ['mock'],
      defaultModel: 'mock',
    });
  }

  return configs;
}
