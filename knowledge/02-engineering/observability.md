# Agent 工程：可观测性与测试

## Q：Agent 系统的可观测性怎么设计？Trace、Metric、Log 三者各自负责什么？

> 来源：SRE/平台工程师面试

**新手答**："打日志就行了"

**高手答**：

Agent 系统的可观测性比普通服务难，因为一次用户请求可能触发多轮 LLM 调用和多次工具执行，日志不足以重现问题。三大支柱：

**Trace（链路追踪）**：
- 记录一次 Agent Run 的完整调用链：`session → loop iteration → llm call → tool call`
- 每个 span 包含：开始时间、持续时间、输入输出、token 用量、错误
- 工具：LangSmith、Langfuse（专为 LLM 设计）、Jaeger（通用）
- 关键：每轮迭代的 thought + action + observation 要作为 span 记录，否则无法调试"Agent 在第 N 轮为什么做了这个决策"

**Metric（指标）**：
- 系统级：请求量 QPS、延迟 P50/P95、错误率、token 消耗速率
- Agent 级：平均迭代轮次、工具调用次数、中途截断率
- 业务级：任务完成率、用户满意度
- 告警：P95 延迟 > 30s、错误率 > 2%、单 session token > 50k

**Log（日志）**：
- 结构化 JSON 日志（不要纯文本，便于搜索和聚合）
- 每条日志含 `{sessionId, iterationIndex, toolName, model, level, timestamp}`
- 敏感信息脱敏（用户内容加 hash，不存原文）

工程实践：生产环境每次 LLM 调用的 prompt + response 存一份快照（加密存 S3），复现 bug 时可以精确回放。

**差距在哪**：新手只打 console.log，高手设计三层可观测性，特别强调每轮迭代的 span 追踪是 Agent 调试的核心。

---

## Q：如何为 Agent 编写单元测试？如何 Mock LLM？

> 来源：工程师面试

**新手答**："调用真实 API 测就行"

**高手答**：

调用真实 LLM API 做单测有三个问题：慢（秒级）、贵（消耗 token）、不确定（随机性强）。

**Mock Provider 策略**：
- 实现和真实 provider 相同的 `LLMProvider` 接口
- 根据 input 返回预设的 output（而不是真正调用 LLM）
- 支持注入 fixture 响应：`mock.setFixture('你好', 'response_text')`
- 支持模拟工具调用响应：返回 `{type: 'tool_use', toolCalls: [{name: 'search', input: {q: 'test'}}]}`

**测试分层**：
1. **单元测试**（mock all）：测 ContextManager 压缩逻辑、PermissionGate 决策、HookPipeline 执行顺序。不需要 LLM。
2. **集成测试**（mock LLM）：测 AgentLoop 的完整流程，用 MockProvider 代替真实 API，验证 tool 调用流程正确。
3. **E2E 测试**（真实 API）：少量 golden case，定期（每天）跑，检测真实 LLM 行为退化。

**工具调用场景的测试**：
```typescript
// Mock 返回 tool_use
mock.setResponse({
  type: 'tool_use',
  toolCalls: [{ id: 't1', name: 'search', input: { query: '测试' } }]
});
// 第二轮 Mock 返回 text（任务完成）
mock.setResponse({ type: 'text', content: '找到结果：...' });
await agent.run(sessionId, '帮我搜一下');
expect(toolExecutedWith).toBe({ query: '测试' });
```

**差距在哪**：新手全靠真实 API，高手设计三层测试策略，MockProvider 是单测和集成测的核心基础设施。

---

## Q：Agent 的重试和退避策略怎么设计？指数退避（Exponential Backoff）的参数怎么选？

> 来源：后端工程师面试

**新手答**："失败了等几秒再试"

**高手答**：

LLM API 的错误需要分类处理，不是所有错误都值得重试：

**可重试错误**：
- 429 Rate Limit：等待 `Retry-After` header 或指数退避
- 529 Overloaded（Anthropic）：短暂过载，退避重试
- 503 Service Unavailable：服务临时不可用
- 网络超时

**不可重试错误**：
- 401 Auth：密钥错误，重试没用
- 400 Invalid Request：请求格式错误，重试会一直失败
- 413 Context Length Exceeded：需要压缩后重试（不是简单重试）

**指数退避参数**：
```
delay = min(base * (factor ^ attempt) + jitter, max_delay)
# 典型配置：
base = 1s, factor = 2, max_delay = 60s, jitter = random(0, 1s)
# 重试序列约：1s, 2s, 4s, 8s, 16s（加上 jitter）
```

**Jitter 的作用**：当大量请求同时 429，没有 jitter 会在同一时刻重试，形成"惊群效应"，再次 429。Jitter 打散重试时间，避免惊群。

**最大重试次数**：3-5 次；超出后 graceful degradation（提示用户稍后再试），而不是继续重试。

**Circuit Breaker（断路器）**：
连续失败 N 次后，进入 open 状态，直接拒绝请求（不再调用 API），N 秒后进入 half-open 探测。防止故障级联放大。

**差距在哪**：新手固定等待 3 秒重试，高手区分错误类型、用指数退避+jitter，并有断路器防止级联故障。

---

## Q：如何对 Agent 做 Load Testing？LLM 应用的性能瓶颈通常在哪里？

> 来源：性能工程师面试

**新手答**："用 JMeter 压测接口"

**高手答**：

LLM 应用的负载测试比普通 API 复杂，因为响应时间高度不确定（秒级到分钟级）。

**性能瓶颈分析**：
```
用户请求
  ↓ (<10ms) 业务逻辑
  ↓ (50-200ms) 向量检索（RAG）
  ↓ (500ms-2s) 首 token 延迟（TTFT）← 主要瓶颈
  ↓ (1-30s) 流式输出完成时间（取决于 output tokens）
  ↓ (0-5s) 工具执行（可并行）
```

主要瓶颈：TTFT（首 token 延迟）受 LLM provider 影响，应用层几乎无法优化，只能选更快的模型或 provider。

**应用层可优化的**：
- 向量检索：缓存热点查询（Redis + TTL 1h）
- Tool 并行化：多个无依赖 tool call 并行执行
- Prompt Caching：固定前缀的 system prompt 开启缓存，降低 input token 处理时间
- Streaming：流式传输大幅改善感知延迟（用户看到第一个字就觉得"在响应了"）

**负载测试工具**：
- k6：支持 SSE 流式响应，可以测 TTFT 和完整响应时间分布
- 并发模拟：20-50 并发（注意 LLM API 的并发限制）

**告警指标**：
- TTFT P95 > 5s → 切换到更快的 provider 或模型
- Error Rate > 1% → 可能触发了 rate limit，需要退避或扩容 API key

**差距在哪**：新手用通用工具压测，高手知道 LLM 应用的瓶颈是 TTFT 和 provider 限制，优化手段是 Prompt Caching + 并行 tool + 流式传输。
