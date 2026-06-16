# 多 Agent 协作

## Q：多 Agent 系统的主要通信模式有哪些？各有什么 trade-off？

> 来源：AI 平台架构面试

**新手答**："Agent 之间互相调用就行了"

**高手答**：

多 Agent 通信有三种主要模式：

**1. 集中式 Orchestrator（主从模式）**：
一个 Orchestrator Agent 控制整体流程，通过 tool call 或消息派发任务给 Worker Agent，收集结果后决定下一步。
- 优点：流程可控、可审计、容易 debug
- 缺点：Orchestrator 是单点，如果它幻觉了整个任务就偏了

**2. 去中心化 Peer-to-Peer**：
Agent 之间直接通信，每个 Agent 根据收到的消息决定自己的行为。类似 Actor 模型。
- 优点：灵活，每个 Agent 可独立进化
- 缺点：没有全局视图，死锁/循环调用难以检测

**3. 黑板系统（Shared State）**：
所有 Agent 通过共享的"黑板"（共享内存/DB）读写状态，不直接互相通信。
- 优点：松耦合，Agent 可动态加入/退出
- 缺点：并发写竞争，需要锁或版本控制

工程实践：绝大多数生产系统用 Orchestrator 模式，因为可审计性最重要。P2P 和黑板适合研究原型。

**差距在哪**：新手想不到通信模式这个维度，高手能说出三种模式的结构差异和各自适用的失败模式。

---

## Q：如何防止多 Agent 系统中的循环调用和死锁？

> 来源：高级工程师面试

**新手答**："加个 visited 集合记录调用过的 Agent"

**高手答**：

循环调用和死锁在 Agent 系统里有不同根因：

**循环调用（A→B→A）**：
- 检测：每次 Agent 调用携带调用链 `call_chain: [A, B, C...]`，调用前检查目标是否已在链中
- 深度限制：全局 max_depth（通常 5-8），超出则返回错误而不是继续调用

**死锁（A 等 B，B 等 A）**：
- 资源超时：所有 Agent 调用设置超时（30-120s），超时后回收资源
- 乐观锁：共享资源用版本号，写入前检查版本，冲突则重试而不是等待
- 依赖图检测：维护运行时依赖图，用 DFS 检测环

**消息风暴（一个 Agent 派发了过多任务）**：
- 限制单次任务派发数量（max_subtasks = 10）
- 并发池控制（concurrency = 5），避免资源耗尽

工程建议：把 call_chain 注入到每个 Agent 的 system context 里，它自己就能意识到调用链并避免循环。

**差距在哪**：新手只想到 visited 集合，高手区分循环/死锁两类问题，给出超时+深度+依赖图三层防护。

---

## Q：Orchestrator + Worker 模式中，Orchestrator 怎么知道什么时候"任务完成"？

> 来源：AI 系统工程师面试

**新手答**："Worker 执行完就算完成了"

**高手答**：

任务完成的判断是多 Agent 系统中最难的问题之一：

**方案一：明确的终止信号**
Worker 执行完后返回结构化结果，其中包含 `status: done/partial/failed`。Orchestrator 收到所有 Worker 的 `done` 才算完成。问题：Worker 的"done"可能是幻觉（任务其实没完成但模型说完了）。

**方案二：Verifier Agent**
引入第三个 Agent 负责验证结果质量。Orchestrator 只有在 Verifier 确认后才关闭任务。类似代码 review 流程。

**方案三：基于目标的终止（Goal-conditioned）**
Orchestrator 在开始时定义明确的**可验证目标**（如"文件已生成"、"测试通过"、"API 返回 200"），通过执行检查而非相信 Worker 的报告来判断完成。

**方案四：人工确认（Human-in-the-loop）**
高风险任务不允许自动完成，必须人类确认。通过 permission gate 实现。

工程选型：低风险任务 → 方案一；高价值任务 → 方案二或三；不可逆操作 → 方案四。

**差距在哪**：新手信任 Agent 的自我报告，高手意识到"Agent 说完成了"≠"任务真的完成了"，需要独立验证机制。

---

## Q：多 Agent 并行执行时如何做状态同步？并发写冲突怎么处理？

> 来源：分布式系统工程师面试

**新手答**："加锁就行了"

**高手答**：

多 Agent 并行时的状态同步是分布式并发问题在 AI 系统的体现：

**乐观锁（推荐）**：
- 共享状态带版本号 `{data, version: 5}`
- Agent 读取时记录版本，写入时 CAS：`UPDATE WHERE version=5`
- 冲突时重试而非等待，适合冲突概率低的场景

**消息队列（最终一致）**：
- Agent 通过消息队列交换增量更新（操作日志），而不是直接读写共享状态
- 优点：Agent 解耦，可回放
- 缺点：有延迟，不适合需要强一致的决策

**状态分区（避免冲突）**：
- 最好的并发是"没有并发"——通过任务分区让每个 Agent 只负责自己的数据分区，根本不需要锁
- 例：把文档按页码分给不同 Agent 处理，结果合并

**禁止共享（Immutable Input）**：
- Agent 只读取输入，不写入共享状态，结果通过 Orchestrator 汇总
- 最简单、最安全，也是 Orchestrator 模式的精髓

**差距在哪**：新手想到悲观锁，但锁在分布式 Agent 环境下容易死锁。高手优先设计"无冲突"架构，退而求其次才用乐观锁。

---

## Q：Agent 的任务分解（Task Decomposition）有哪些策略？

> 来源：AI 产品架构师面试

**新手答**："让 Agent 自己想怎么分就怎么分"

**高手答**：

任务分解是多 Agent 系统成功的关键，有几种策略：

**1. Plan-and-Execute（先规划后执行）**：
- Planner Agent 把任务分解成有序步骤列表
- Executor Agent 逐步执行
- 优点：全局视图清晰，便于 review
- 缺点：计划可能和执行现实脱节（计划时不知道某步骤会失败）

**2. ReAct 式动态分解**：
- 每一步根据上一步的结果动态决定下一步
- 优点：适应性强
- 缺点：难以预见全局复杂度，容易超出 max_iterations

**3. DAG（有向无环图）分解**：
- 显式建模任务依赖关系：A 完成后才能开始 B 和 C；B 和 C 完成后才能开始 D
- 并行执行无依赖的分支（B 和 C 并发），提升效率
- 优点：可视化清晰，并行度高
- 缺点：提前建模 DAG 需要对任务有深入理解

**4. Hierarchical Decomposition**：
- 任务树形分解：顶层任务拆成中层子任务，中层再拆成底层原子操作
- 适合大型、复杂任务（写一篇论文 → 章节 → 段落 → 句子）

**差距在哪**：新手依赖模型自己分解，高手理解不同分解策略的适用场景，并知道 DAG 并行执行是提升吞吐的关键。

---

## Q：如何设计 Agent 的能力路由？Orchestrator 怎么知道该派给哪个 Worker？

> 来源：AI 平台架构师面试

**新手答**："在 prompt 里写好每个 Agent 负责什么，让 LLM 判断"

**高手答**：

能力路由的核心是让 Orchestrator 准确地把子任务分配给有能力完成它的 Worker。方案：

**1. 基于 LLM 的意图路由**：
Orchestrator 的 tools 就是各个 Worker（每个 Worker 是一个 tool），LLM 根据任务描述和 tool schema 决定调哪个。关键：**tool description 写得越精确，路由越准**。

**2. 能力注册表（Capability Registry）**：
每个 Worker 注册自己的能力向量或关键词（如 `{name: 'code-agent', capabilities: ['python', 'javascript', 'testing']}`），路由时做 semantic match。比纯 LLM 路由快且可控。

**3. 规则路由 + LLM 兜底**：
高频任务类型预先写死路由规则（快，稳定），长尾用 LLM 分类（慢但覆盖面广）。

**Worker 过载处理**：
- 每个 Worker 维护一个队列，超过容量时路由到备选 Worker 或返回"当前不可用"
- Orchestrator 需要有 retry/fallback 逻辑

**差距在哪**：新手依赖 LLM "聪明地判断"，高手知道 LLM 路由需要精心设计 schema，且有规则兜底，生产上不能全靠模型判断。
