# Harness 工程实践

## Q：什么是 Agent Harness？和 LangChain 这类框架有什么区别？

> 来源：AI 工程师面试

**新手答**："Harness 就是 Agent 的框架，和 LangChain 差不多"

**高手答**：

Agent Harness 是围绕 LLM 构建的**工程基础设施层**，它和框架的本质区别在于：

- **框架**（LangChain/LangGraph）：提供抽象和组合原语，你在它的 API 范式里编程。好处是快速原型，代价是黑盒——出了问题你得去读框架源码理解它帮你做了什么。
- **Harness**：你自己写 Agent Loop，自己控制每一步的逻辑。Harness 不是"另一个框架"，而是"不用框架时你需要自己搭的那些基础设施"。

Harness 10 层模型：
1. **Tools**：工具注册、schema 声明、dispatcher
2. **Skills**：多 tool 编排的复合能力
3. **Query Engine**：LLM 调用、重试、缓存、多 provider 路由
4. **Context**：多层上下文组装、压缩策略
5. **Memory**：长期记忆存取、重要度衰减
6. **Permission**：工具调用的风险分级和审计
7. **Sessions**：对话状态机、checkpoint、rewind
8. **Command**：用户指令解析（/help, /reset 等）
9. **Hook**：pre-tool / post-tool 的治理管线
10. **Sub-agent**：子 Agent 运行时、并发池

为什么选择 Harness 而不是 LangChain：
- 生产环境需要对每一层有完全控制权
- 框架升级可能 break 你的逻辑
- 调试时你知道每一行代码在干什么
- 性能瓶颈可以精确定位到具体层

**差距在哪**：新手把所有 Agent 相关的东西都叫"框架"，高手区分框架和基础设施、理解自建的 trade-off。

## Q：Agent 的错误处理策略应该怎么设计？

> 来源：高级工程师面试

**新手答**："try-catch 捕获异常，打个日志就行"

**高手答**：

Agent 的错误处理比普通后端复杂得多，因为 Agent Loop 是**多轮异步 + 外部依赖密集**的：

1. **分层错误分类**：
   - LLM 层：rate_limit（可重试）、context_length（需压缩后重试）、overloaded（退避重试）、auth（不可重试）
   - Tool 层：tool 执行超时、返回格式错误、权限不足
   - 系统层：OOM、网络断连

2. **错误恢复策略**：
   - LLM 429/529：指数退避 + jitter 重试
   - Context 超限：触发压缩后重试
   - Tool 失败：错误信息结构化后喂回模型，让模型决定下一步
   - 多次重试后仍失败：graceful degradation，告诉用户"这个能力暂时不可用"

3. **Circuit Breaker**：如果某个 provider 连续失败 N 次，自动切到备选 provider，而不是继续打已经挂了的 API。

4. **Checkpoint 恢复**：长对话中如果中间某一步出错，不应该从头重来。Session checkpoint 让你可以从最近的成功状态恢复。

**差距在哪**：try-catch 是最低级的错误处理。面试官期望看到分类、分层恢复策略和 graceful degradation 的设计思维。

## Q：Agent 的权限管理（Permission Gate）怎么设计？工具调用的风险分级如何落地？

> 来源：AI 安全工程师面试

**新手答**："用户有权限就让 Agent 操作，没权限就拒绝"

**高手答**：

Agent 工具的权限管理和 API 权限管理有本质区别：Agent 可能"被说服"去做它本不该做的事（prompt injection），所以权限必须在代码层硬编码，而不能依赖模型自己判断。

**风险分级**：
```
low      → 只读操作（搜索、查询、分析）→ 自动执行
medium   → 有副作用但可逆（写文件、发草稿）→ 记录但不阻断
high     → 不可逆或有外部成本（发送消息、调用付费 API）→ 需要配置规则放行
critical → 破坏性操作（删除数据、执行系统命令）→ 必须用户实时确认
```

**核心原则**：
- 每个 Tool 在声明时带 `riskLevel` 字段，不是运行时由 LLM 决定
- `PermissionGate.check(toolName, riskLevel, sessionContext)` 在执行前被调用，LLM 的输出内容不参与这个决策
- critical 工具即使 LLM 被 prompt inject 要求执行，也一定弹出人工确认

**审计**：
所有工具调用（包括被拒绝的）都写入 audit log：`{sessionId, tool, riskLevel, decision, timestamp}`，用于事后安全审查。

**Rate Limiting（防滥用）**：
高风险工具设置 session 级调用频率上限（如每 session 最多 5 次写操作），防止 Agent Loop 出 bug 时无限循环消耗资源或造成破坏。

**差距在哪**：新手把工具权限等同于用户权限，高手知道权限必须在代码层硬编码，且审计+限流是兜底防护，不能依赖"模型会自己判断"。

---

## Q：Hook Pipeline（pre-tool / post-tool）的设计思路是什么？有哪些典型用途？

> 来源：AI 工程师面试

**新手答**："就是工具调用前后加个回调"

**高手答**：

Hook Pipeline 是 Agent 的"治理层"，让你在不修改工具本身的情况下，统一注入横切关注点（cross-cutting concerns）。

**Pre-tool Hook（执行前）**：
- **输入清洗**：检测 prompt injection 特征，过滤恶意参数
- **参数校验**：类型检查、范围检查，不依赖 LLM 参数的合法性
- **用户确认**：critical 风险工具弹确认对话框
- **限流检查**：检查是否超出速率限制，超出则 veto 执行
- 可以**修改输入**（安全地重写参数）或**中止执行**（返回 `{continue: false}`）

**Post-tool Hook（执行后）**：
- **结果截断**：工具返回 100k 字符的 HTML，post-hook 截取前 2000 字，避免污染 context
- **敏感信息脱敏**：返回值中的 API key、密码替换为 `****`
- **token 计数**：统计工具结果的 token 消耗，更新 context 预算
- **结果格式化**：把原始数据转成模型更易理解的格式
- 可以**重写结果**，修改后的内容才传给 LLM

**Pipeline 执行模型**：
```
hooks 是有序数组，依次执行
pre-hook 返回 {continue: false} → 中止，不调用工具
post-hook 返回修改后的 result → 传递给下一个 post-hook
```

**差距在哪**：新手只用 hook 打日志，高手把 hook 当"治理管线"实现输入清洗、输出脱敏、流量控制，不污染工具本身的业务逻辑，也不需要每个工具自己实现这些逻辑。
