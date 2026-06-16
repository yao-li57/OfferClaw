# Agent Context 与 Memory 设计

## Q：Agent 的 Context 压缩有哪些策略？超出 Context Window 怎么处理？

> 来源：AI 工程师面试

**新手答**："超了就截断，删掉前面的消息"

**高手答**：

Context 管理是 Agent 工程中最影响长对话质量的模块，有三个层次的策略：

**1. 预防（避免超出）**：
- Token 预算分配：为 system prompt、工具定义、历史消息、当前轮次分别设置上限
- Tool result 裁剪：大型工具返回（如搜索结果）截取前 N 字，而不是完整注入
- 早期压缩：在距离 context limit 还有 40% 空间时就开始压缩，而不是等到撑满

**2. 压缩（已经很长时）**：
- **Sliding Window**：只保留最近 K 条消息，早期消息完全丢弃。简单但会失去早期上下文
- **Summarization**：用 LLM 把早期消息压缩成摘要，注入为一条 assistant 或 system 消息。保留语义，成本是额外一次 LLM 调用
- **选择性保留**：标记"重要"消息永不压缩（用户姓名、关键决策），其余做 sliding window

**3. 外化（彻底解决）**：
- 把对话历史持久化到 DB/向量库
- 每轮按语义相关性检索 top-K 历史消息（而不是最近 K 条）
- 本质上是把 context 问题转化为 RAG 问题

工程实践：三级策略——token < 60% 时不处理；60-80% 时做 summarization；> 80% 时强制 sliding window。

**差距在哪**：新手只知道截断，高手区分三层策略并知道 summarization 保留语义、外化 RAG 适合超长对话的不同权衡。

---

## Q：Agent 的短期记忆和长期记忆有什么区别？分别怎么实现？

> 来源：Agent 架构师面试

**新手答**："短期记忆就是当前对话，长期就是存数据库"

**高手答**：

Agent 记忆的分层：

**短期记忆（In-context Memory）**：
- 存储位置：LLM 的当前 context window（messages 数组）
- 特点：高保真，但受 token 限制，会话结束就消失
- 管理：就是 context 压缩问题

**长期记忆（External Memory）**：
分两类：
- **Episode Memory（情节记忆）**：用户做过什么、说过什么。存 DB，按 session 检索
- **Semantic Memory（语义记忆）**：提炼出来的持久知识（"用户偏好 Python"、"用户在字节工作"）。存向量 DB，按语义检索

**工程实现**：
```
写入：对话结束时，用 LLM 从最近对话中提取关键信息
     存储格式：{type: 'semantic', content: '用户偏好简洁回答', userId, createdAt}
读取：每轮开始时，用当前问题语义检索 top-5 相关记忆
     注入格式：system prompt 的 memory 层
衰减：超过 N 天未被引用的记忆降低优先级或删除
```

**内存注入时机**：
每次 LLM 调用前，不是启动时一次性注入（用户的意图在对话中动态变化，实时注入更相关）。

**差距在哪**：新手不区分短期/长期，或把长期记忆简单理解为"存 DB"。高手区分情节记忆和语义记忆，理解提取-检索-注入的完整循环。

---

## Q：Session 状态机怎么设计？idle/active/paused/completed 各自代表什么？

> 来源：后端工程师面试

**新手答**："就是记录对话是否在进行中"

**高手答**：

Session 状态机是 Agent 系统的"对话管理层"，状态转换需要显式触发（不能隐式变化）：

```
idle → active：用户发送第一条消息
active → paused：Agent 需要等待用户补充信息，或等待异步任务（如长时间工具执行）
paused → active：用户恢复输入或异步任务完成
active → completed：对话轮次达到上限，或用户显式结束
completed → idle：重置（开始新会话）
```

**每个状态的约束**：
- `idle`：不接受消息（阻塞写入），等待激活
- `active`：Agent Loop 在运行，允许写入消息，禁止并发触发第二个 Loop
- `paused`：Loop 挂起，等待外部事件，消息写入队列而不是立即处理
- `completed`：只读，历史可查看，不允许写入

**并发保护**：
`active` 状态下如果收到新消息（用户不停发），需要决策：
- 方案A：忽略新消息直到 active → idle（简单，用户体验差）
- 方案B：interrupt 当前 Loop，把新消息合并（复杂，用户体验好）
- 方案C：队列化，Loop 结束后处理（折中）

**差距在哪**：新手用 boolean 表示"是否在处理"，高手设计完整状态机，每个状态有明确语义和转换条件，以及并发保护策略。

---

## Q：多层 Context 架构（system/memory/knowledge/session 等）如何组装 system prompt？

> 来源：AI 平台架构师面试

**新手答**："把所有内容拼起来放进 system prompt"

**高手答**：

直接拼接有两个问题：顺序固定（重要信息可能被放到后面被淡化）、无法动态更新某一层（改一处需要重新生成整个 prompt）。

**分层设计**：
```
Layer      Priority  内容
system      100      角色定义、能力边界、工作方式（稳定）
immediate    90      本轮特殊指令（临时覆盖，如"只用英文回答"）
knowledge    80      从知识库检索到的参考内容（动态）
memory       60      用户长期记忆（动态）
session      40      当前会话摘要（动态）
```

**组装规则**：
- 按 priority 降序排列（重要的在前，注意力更集中）
- 各层用 XML tag 或 Markdown 分隔（`<role>...</role>`），让模型可以定位
- 总 token 预算有限时，低优先级层先被裁剪（session layer 先截断）

**动态更新**：
- `setLayer('knowledge', retrieval_result)` 每轮检索后更新
- `setLayer('memory', user_memory)` 每轮开始时注入
- system 层和 immediate 层不参与轮次更新

工程细节：各层在 buildSystemPrompt() 里 join，不在存储时拼接，保持各层独立可更新。

**差距在哪**：新手把 prompt 当字符串拼接，高手设计有优先级的分层结构，支持动态更新和按优先级裁剪。
