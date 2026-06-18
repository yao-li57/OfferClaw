# 模型能力与调优

## Q：System Prompt 的设计有什么讲究？

> 来源：AI 工程师面试

**新手答**："就是告诉模型你是谁、要做什么"

**高手答**：

System Prompt 是 Agent 行为控制的第一道闸门，设计不好直接影响：tool 调用准确率、回复格式一致性、安全边界。

设计原则：
1. **角色定义要具体**：不是"你是一个助手"，而是"你是一个专注于X领域的诊断Agent，你的用户是Y，你通过Z方式工作"。
2. **能力边界要明确**：列出你能做什么、不能做什么，减少模型"创造性发挥"。
3. **输出格式要规范**：如果你期望结构化输出，在 system prompt 里给出示例格式。
4. **Tool 使用指引**：什么时候应该调 tool、什么时候直接回答，需要明确指引。
5. **分段组织**：用 XML tag 或 markdown heading 分段，让模型可以"索引"到相关段落。

常见坑：
- System prompt 太长（>2000 tokens）会稀释注意力
- 指令冲突（前面说"简洁回答"，后面又说"详细解释"）
- 没有 negative examples（只说要做什么，没说不要做什么）

**差距在哪**：新手只知道 system prompt 是"第一条消息"，高手关注的是信息密度、指令一致性和对模型行为的精确控制。

## Q：Temperature、Top-P 这些参数怎么调？不同场景的最佳实践？

> 来源：AI 产品工程师面试

**新手答**："Temperature 越高越有创意，越低越确定"

**高手答**：

采样参数的本质是控制模型输出 token 概率分布的"锐度"：

- **Temperature**：对 logits 做除法。T=0 → argmax（确定性最高）；T=1 → 原始分布；T>1 → 更平坦（更随机）
- **Top-P (nucleus)**：从累积概率最高的 token 子集中采样。P=0.9 意味着只从累计概率 90% 的候选中选。
- 实践中通常只调一个，两个都调容易互相干扰

场景推荐：
| 场景 | Temperature | Top-P | 原因 |
|------|------------|-------|------|
| Tool 参数生成 | 0 | 1 | 必须精确，不能有"创意" |
| 代码生成 | 0-0.2 | 0.95 | 语法正确性优先 |
| 诊断分析 | 0.3-0.5 | 0.9 | 需要一定表达多样性但不能胡说 |
| 创意写作 | 0.8-1.0 | 0.95 | 需要多样性 |

工程注意：如果你的 Agent 同时需要做 tool calling 和自然语言回复，可以在 tool_use 阶段用 T=0、回复阶段用 T=0.5。但大多数 API 不支持单次调用中切换参数，所以实践中通常用折中值 T=0.3。

**差距在哪**：新手停留在"高低"维度，高手能说出不同场景的具体数值和背后原因。

## Q：强制结构化输出（JSON Mode）有哪几种方案？各自的可靠性如何？

> 来源：AI 工程师面试

**新手答**："在 prompt 里说'请用 JSON 格式输出'"

**高手答**：

强制模型输出有效 JSON 有三种可靠性递增的方案：

**方案一：Prompt 指令（最弱）**：
在 system prompt 里写"请输出 JSON"并给格式示例。可靠性约 70-85%——模型可能输出前缀说明文字，或 JSON 不完整/不闭合。需要 try-catch parse，失败时让模型重试。

**方案二：JSON Mode / response_format（中等）**：
```typescript
{ response_format: { type: 'json_object' } }   // OpenAI
// Anthropic 通过 tool use 实现，无独立 json_object 模式
```
Provider 在采样层强制输出有效 JSON，可靠性 95%+，但不保证符合你的 Schema（字段名可能错、字段可能缺失），字段正确性仍依赖 prompt。

**方案三：Tool Use 强制调用（最强）**：
定义一个 tool，schema 就是你想要的输出格式，然后设置 `tool_choice` 强制调用：
```typescript
tool_choice: { type: 'tool', name: 'structured_output' }
```
模型必须调用这个 tool，参数就是结构化输出，provider 在 streaming 层校验 JSON 格式，且参数必须符合 tool schema。可靠性 99%+，代价是额外 tokens（tool 定义 + tool_use overhead，约 200-500 tokens）。

**工程建议**：
- 简单提取/分类 → JSON Mode 足够
- 复杂 schema、字段缺失不可接受的关键路径 → Tool Use 强制调用
- 无论哪种，都加 Zod / JSON Schema 验证 + 失败时重试逻辑

**差距在哪**：新手靠 prompt 指令，会踩 parse 错误的坑。高手知道三级方案的可靠性差异，关键路径用 Tool Use 强制约束。

---

## Q：在多模型混用时，如何做 Model Routing（模型路由）？

> 来源：AI 平台架构师面试

**新手答**："贵的模型效果好，就全用最强的"

**高手答**：

模型路由是 AI 系统成本控制的核心杠杆——同样的任务，用对模型可以把成本降低 10-100 倍。

**路由维度**：

| 维度 | 小模型（Haiku/GPT-4o-mini） | 大模型（Sonnet/GPT-4o） | 最强模型（Opus/o1） |
|------|------------------------|---------------------|-----------------|
| 任务复杂度 | 分类、提取、格式化 | 多步推理、代码生成 | 最复杂推理、长文档分析 |
| 延迟要求 | 实时交互（<2s） | 一般响应 | 可接受 >5s |
| Context 长度 | <32k tokens | 32k-200k | 超长文档 |
| 成本 | $0.25/1M tokens | $3/1M tokens | $15/1M tokens |

**工程实现**：
```typescript
function routeModel(task: TaskClassification): string {
  if (task.complexity === 'low') return 'claude-haiku-4-5';
  if (task.contextLength > 100_000) return 'claude-sonnet-4-6';  // 1M context
  if (task.requiresDeepReasoning) return 'claude-opus-4-7';
  return 'claude-sonnet-4-6';  // 默认
}
```

**级联路由（Fallback + Escalation）**：
- 先用小模型跑，如果结果置信度低（或 tool call 失败）再升级到大模型
- 降低约 60-80% 的成本，因为大多数请求小模型就够了

**成本对比示例**：
100 万次简单分类请求，Haiku vs Sonnet，每月差异约 $2750 — 这不是工程细节，是实际账单。

**差距在哪**：新手总用最贵的模型"保底"，高手按任务特征路由，并知道级联路由是降低成本同时保住质量的关键模式。
