# 全栈工程与 AI 应用部署

## Q：SSE（Server-Sent Events）和 WebSocket 在 AI 流式应用中怎么选？

> 来源：全栈工程师面试

**新手答**："都能传数据，用 WebSocket 功能更强"

**高手答**：

AI 聊天/流式输出场景的技术选型：

| 维度 | SSE | WebSocket |
|------|-----|-----------|
| 方向 | 单向（Server→Client） | 双向 |
| 协议 | HTTP/1.1 | TCP 升级后的独立协议 |
| 防火墙穿透 | 好（复用 HTTP 443） | 有些企业防火墙会 block |
| 断线重连 | 内置（`Last-Event-ID`） | 需要自己实现 |
| 负载均衡 | 标准 HTTP LB 即可 | 需要 sticky session 或 pub/sub |
| 实现复杂度 | 低（标准 fetch ReadableStream） | 高（需要管理连接状态） |

**选 SSE 的场景（AI 应用的主流选择）**：
- LLM 流式输出（单向，服务端推送）
- 进度通知（任务状态更新）
- 大多数 AI 聊天应用

**选 WebSocket 的场景**：
- 需要客户端主动推送（实时协作编辑、多人游戏）
- 极低延迟双向通信（语音通话 + 实时转写）
- 已有 WebSocket 基础设施

工程注意：Next.js App Router 的 route handler 支持 SSE（返回 `ReadableStream`），但需要关闭 `dynamic = 'force-static'`，且不支持 HTTP/2 服务器推送。

**差距在哪**：新手认为 WebSocket"更强"，高手知道 AI 流式输出是单向的，SSE 更简单、运维友好，是正确选择。

---

## Q：前端如何实现健壮的 SSE 流式消费？有哪些常见坑？

> 来源：前端工程师面试

**新手答**："用 EventSource API 监听就行"

**高手答**：

`EventSource` API 不支持 POST 请求和自定义 Header，AI 聊天需要用 `fetch` + `ReadableStream`：

```typescript
const res = await fetch('/api/chat', { method: 'POST', body: JSON.stringify({...}) });
const reader = res.body!.getReader();
const decoder = new TextDecoder();
let buffer = '';

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  buffer += decoder.decode(value, { stream: true });  // stream: true 关键！
  const lines = buffer.split('\n');
  buffer = lines.pop() ?? '';  // 最后一行可能不完整，留到下次

  for (const line of lines) {
    if (!line.startsWith('data: ')) continue;
    const data = line.slice(6);
    if (data === '[DONE]') continue;
    const event = JSON.parse(data);
    // handle event
  }
}
```

**常见坑**：
1. **`decode` 不带 `{stream: true}`**：一个中文字符可能跨两个 chunk，导致乱码
2. **buffer 不处理不完整行**：SSE 的一行数据可能被分在两个 chunk 里，必须用 buffer 拼接
3. **网络断开不感知**：`done` 只有在服务端正常关闭时才是 true；连接被中断 `reader.read()` 会 throw，需要 try-catch
4. **`isStreaming` 状态泄露**：服务端出错时 `finally { setIsStreaming(false) }` 是保证输入框恢复的关键

**差距在哪**：新手用 EventSource 或不处理 buffer，高手用 fetch + ReadableStream 并正确处理 chunk 边界和错误。

---

## Q：AI 应用的后端如何实现 SSE 流式转发？Node.js 和 Next.js 各有什么注意事项？

> 来源：后端工程师面试

**新手答**："直接把 LLM 的响应转发给前端"

**高手答**：

**原生 Node.js HTTP 服务器**（`node:http`）：
```typescript
res.writeHead(200, {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache',
  'Connection': 'keep-alive',
  'X-Accel-Buffering': 'no',   // 关键：告诉 Nginx 不要缓冲
});
// 流式写入
res.write(`data: ${JSON.stringify(event)}\n\n`);
// 结束
res.write('data: [DONE]\n\n');
res.end();
```

**Next.js App Router Route Handler**：
```typescript
return new Response(
  new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      for await (const event of llmStream) {
        controller.enqueue(enc.encode(`data: ${JSON.stringify(event)}\n\n`));
      }
      controller.enqueue(enc.encode('data: [DONE]\n\n'));
      controller.close();
    }
  }),
  { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' } }
);
```

**坑**：
- Nginx 默认缓冲响应，必须加 `X-Accel-Buffering: no` 或配置 `proxy_buffering off`
- Next.js 的 `export const dynamic = 'force-dynamic'` 必须加，否则 route 被静态化
- 客户端断开连接时服务端需要感知（`req.on('close', cleanup)`），否则 LLM 调用不会被取消，继续烧 token

**差距在哪**：新手不知道 Nginx 缓冲和 Next.js 动态 route 两个坑，高手知道且有取消流的清理逻辑。

---

## Q：如何设计 AI 服务的 Token 用量监控和成本控制？

> 来源：AI 平台工程师面试

**新手答**："看 API 账单"

**高手答**：

被动看账单只能事后知道，需要主动监控和控制：

**采集**：
每次 LLM 调用结束后记录 `{sessionId, model, inputTokens, outputTokens, cacheHitTokens, timestamp, toolName}`，写入 DB 或时序库。

**聚合指标**：
- Cost per session（每个会话的平均成本）
- Cost per user（用户维度的成本）
- Token 效率：`output_tokens / input_tokens`（比值低说明 context 太长而回答太短）
- Cache hit rate（Prompt Caching 开了没有，命中率是多少）

**成本控制**：
1. **Prompt Caching**：对固定的 system prompt 和工具定义启用 cache（Anthropic 节省 90% input token 成本），需要在 cache breakpoint 前的内容保持稳定
2. **模型分级路由**：简单任务路由到 Haiku/GPT-4o-mini，复杂任务才用 Sonnet/GPT-4o
3. **Context 预算**：为每个 session 设置 max_tokens 上限，超限触发压缩
4. **Rate limit per user**：防止单个用户的高消耗影响整体成本

**告警**：
- 单 session token 超过阈值（10k）时告警
- 小时/天成本超过预算时告警

**差距在哪**：新手只知道"控制 context 长度"，高手有完整的采集-聚合-告警-控制闭环，知道 Prompt Caching 是最高 ROI 的优化手段。

---

## Q：AI 服务部署时如何做灰度发布？Prompt 变更和模型版本变更分别怎么处理？

> 来源：DevOps/SRE 面试

**新手答**："先发一部分用户，没问题就全量"

**高手答**：

AI 服务的灰度比普通服务复杂，因为 Prompt 变更和代码变更是正交的两个维度：

**Prompt 灰度（Feature Flag）**：
- Prompt 不应该硬编码在代码里，应该存在配置中心（Redis/DB）
- 按 user_id % 100 < 10 分流 10% 流量到新 prompt
- 实时监控新 prompt 的质量指标，达到 SLA 再扩量
- 可以不发版本就回滚（改配置即可）

**模型版本灰度**：
- LLM provider 有时悄悄更新模型（如 `gpt-4o` 指向不同 checkpoint）
- 应该 pin 具体版本（`gpt-4o-2024-11-20`）而不是 latest alias
- 升级新版本时，先在 staging 跑 golden dataset 回归测试
- 生产上用 1% → 10% → 50% → 100% 的节奏，每步观察 24 小时

**同时变更 Prompt + 模型**：
应该分两步：先 pin 住 Prompt 变更，再做模型升级，不要同时改两个变量（否则问题归因不清楚）。

**回滚策略**：
- Prompt 回滚：改配置，<1分钟生效
- 模型回滚：改环境变量，重启服务，<5分钟
- 不要依赖发布系统做 LLM 版本管理，太慢

**差距在哪**：新手把 AI 灰度等同于普通服务灰度，高手知道 Prompt 是独立的变更维度，需要独立的发布/回滚机制。

---

## Q：如何实现 AI 应用的 Rate Limiting？用户级和 Session 级分别怎么设计？

> 来源：后端工程师面试

**新手答**："IP 限流就行"

**高手答**：

AI 应用的限流需要多维度：

**IP 限流（防爬）**：
- 每 IP 每分钟 60 次请求（粗防护，防扫描）
- 实现：Redis `INCR ip:{ip}` + TTL 60s

**用户级限流（成本控制）**：
- 每用户每天 token 配额（如 50k tokens）
- 记录用户消耗：`INCRBY user:{uid}:tokens {count}` + TTL 86400s
- 超出配额返回 429 + Retry-After

**Session 级限流（防滥用）**：
- 单个 session 的工具调用次数上限（如每 session 最多 20 次 tool call）
- 防止单个 session 无限循环消耗资源
- 在 PermissionGate 里实现，session 维度的滑动窗口计数

**并发限流（保护下游）**：
- 最大并发 LLM 调用数（如 50 并发）
- 超出时排队或返回"服务繁忙"
- 实现：Redis 信号量 or 本地 semaphore

**差异化策略**：
- 免费用户 vs 付费用户不同配额
- 不同工具不同限制（高成本工具限制更严）

**差距在哪**：新手只想到 IP 限流，高手针对 AI 特性设计 token 配额、Session 工具调用上限、并发保护四层限流。

---

## Q：AI 聊天应用的会话持久化怎么设计？如何处理大量历史消息？

> 来源：全栈工程师面试

**新手答**："存到数据库里，需要时查出来"

**高手答**：

会话持久化的关键挑战是：历史消息越来越多，但每次调用 LLM 只能放有限 context。

**存储层设计**：
```
sessions 表: {id, user_id, created_at, status, summary}
messages 表: {id, session_id, role, content, tokens, created_at}
```

**加载策略（分层）**：
1. **最近 N 轮**：每次调用只把最近 20-30 条消息放入 context
2. **摘要压缩**：超出的历史消息用 LLM 压缩成摘要，注入为 `memory` context layer
3. **重要消息标记**：用户明确说"记住这个"的消息打 flag，无论多旧都注入

**实现**：
```
加载 context = 摘要 + 最近30条
写入 = 实时追加到 DB
压缩 = 后台 job，每 N 条触发一次摘要生成
```

**多端同步**：
- 会话状态以 server-side 为权威（SSR 或 API 拉取）
- 不依赖 localStorage 存消息内容（丢数据风险）
- 使用 optimistic update 优化感知延迟（先渲染，后确认）

**差距在哪**：新手把所有消息全部放 context（超 context 限制），高手设计三层加载策略：最近消息 + 摘要 + 重要消息标记。
