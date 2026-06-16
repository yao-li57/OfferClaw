# LLM 评测与质量保障

## Q：如何系统性地评测一个 LLM 应用的质量？从哪些维度评？

> 来源：AI 质量工程师面试

**新手答**："让几个人用用看，觉得好就行"

**高手答**：

LLM 应用评测需要多层次框架：

**功能性指标**：
- Task Completion Rate：给定输入，系统是否完成了预期任务（0/1 分类）
- Tool Call Accuracy：工具调用中 tool name 选择正确率 + 参数填写正确率
- Format Compliance：输出是否符合规定格式（JSON 可解析率、字段完整率）

**质量指标**：
- Faithfulness：回答有无幻觉（是否有文档支撑）
- Coherence：多轮对话的连贯性
- Helpfulness：回答对用户是否真正有帮助（需要 human eval 或 LLM-as-judge）

**工程指标**：
- Latency P50/P95/P99：响应时间分位数
- Token Usage：input/output tokens per request（成本控制）
- Error Rate：LLM API 错误率、Tool 执行失败率

**安全指标**：
- Refusal Rate（拒绝率）：是否过度拒绝合理请求
- Jailbreak Resistance：对抗性输入的防御能力

评测方法：
- 离线：golden dataset（人工标注的 QA 对）+ automated metrics
- 在线：shadow traffic + A/B test + user feedback collection

**差距在哪**：新手只看"好不好用"，高手能设计覆盖功能/质量/工程/安全四个维度的可量化评测体系。

---

## Q：LLM-as-Judge 是什么？用它做评测有哪些坑？

> 来源：AI 平台工程师面试

**新手答**："就是用 GPT 打分"

**高手答**：

LLM-as-Judge 是用一个强 LLM（通常是 GPT-4 或 Claude）来评估另一个 LLM 的输出质量，作为人工评估的替代。

**常用范式**：
1. **Pointwise**：对单个回答打绝对分（1-5 分），有 position bias 问题
2. **Pairwise**：给两个回答让 judge 选更好的，更稳定，但无法量化差距
3. **Reference-based**：有 golden answer，judge 评估候选答案和 golden 的差距

**主要坑**：
1. **Position Bias**：judge 倾向于给出现在前面的答案更高分。缓解：随机调换 A/B 顺序做两次，取平均。
2. **Verbosity Bias**：judge 倾向于认为更长的回答更好，即使内容并不更好。
3. **Self-preference**：Claude 做 judge 可能偏向 Claude 风格的输出，GPT 做 judge 同理。重要评测用不同 judge 交叉验证。
4. **Calibration**：judge 的分数分布是否反映真实质量？需要用人工标注集校准。

Meta-evaluation：用人工标注来评估 judge 的一致性（Cohen's Kappa > 0.7 才算可信）。

**差距在哪**：新手认为"用 GPT-4 打分就很客观"，高手知道 judge 本身有 bias，需要系统性缓解和校准。

---

## Q：如何评测 Agent 的 Tool Calling 准确率？

> 来源：Agent 工程师面试

**新手答**："看它有没有调对工具"

**高手答**：

Tool Calling 评测需要分解成多个子指标：

**工具选择准确率（Tool Selection）**：
给定查询，Agent 是否选择了正确的工具（或正确地不调工具）？
```
tool_selection_accuracy = correct_tool_calls / total_queries
```
需要 golden dataset，每条记录包含查询 + 期望调用的工具名。

**参数填写准确率（Argument Quality）**：
工具选对了，但参数填错了同样失败。
- 必填参数缺失率
- 参数格式错误率（类型错误、超范围）
- 参数语义错误率（字段填的值不对）

**End-to-End 任务成功率**：
最终指标，工具调对+参数填对+执行成功+结果正确。

**评测集构造**：
1. 覆盖每个工具的 happy path
2. 覆盖边界 case（工具不够用时应该不调用）
3. 覆盖工具组合（需要先调 A 再调 B 的场景）

**回归测试**：每次更改 system prompt 或 tool schema 后跑全量评测集，防止退化。

**差距在哪**：新手只看"有没有调工具"，高手细分工具选择、参数填写、执行结果三层，并建立持续回归测试。

---

## Q：A/B 测试 prompt 时如何保证统计显著性？需要多大样本量？

> 来源：AI 产品工程师面试

**新手答**："跑几十条看哪个好"

**高手答**：

Prompt A/B 测试是统计假设检验问题：

**样本量计算**：
```
n = (Z_α/2 + Z_β)² × 2p(1-p) / δ²
```
- α = 0.05（显著性水平），Z = 1.96
- β = 0.2（功效 80%），Z = 0.84
- p ≈ 当前转化率，δ = 最小可检测差异

实际经验：若 baseline 成功率 70%，想检测 5% 提升，需要约 1300 条/组。

**分流策略**：
- Session-level 分流（同一用户同一 session 体验同一版本，避免组内污染）
- 随机哈希（session_id % 2 → A/B），保证可重现

**指标选择**：
- Primary metric：最终业务指标（完成率、用户满意度）
- Guardrail metrics：不能变差的指标（错误率、拒绝率）
- 如果 guardrail 指标变差，即使 primary 变好也不能上线

**多重检验修正**：
同时测多个 prompt 变体时，用 Bonferroni 修正 α，避免 false positive 累积。

**差距在哪**：新手凭感觉判断哪个 prompt 更好，高手用统计检验，能计算需要多少样本，知道 guardrail 指标同等重要。

---

## Q：如何建立 LLM 应用的黄金测试集（Golden Dataset）？

> 来源：AI 质量工程师面试

**新手答**："找几个典型问题写上答案"

**高手答**：

Golden Dataset 的质量直接决定评测的价值，构建原则：

**覆盖维度**：
1. **Happy path**：正常使用场景，系统应该正确处理（60%）
2. **Edge cases**：边界情况（空输入、超长输入、格式异常）（15%）
3. **Adversarial**：恶意或混淆输入，测试安全和鲁棒性（10%）
4. **Regression cases**：历史上曾经出过问题的用例（15%）

**标注质量**：
- 至少 2 个标注员交叉验证，计算 Inter-annotator Agreement（Cohen's Kappa）
- Kappa < 0.6 说明标准不清晰，需要重写标注指南
- 对于主观题（"好不好"），给出评分标准而非直接答案

**动态维护**：
- 每个线上 bug 修复后，把该 case 加入 regression set
- 每季度审查并删除过时的 case
- 用生产流量 + 人工过滤来扩充（在线-离线闭环）

**规模参考**：
- 早期：100-300 条，覆盖核心流程即可
- 成熟系统：1000-5000 条，按功能模块分层
- 不要追求数量，每条都要有人 review

**差距在哪**：新手随机选几条，高手按维度分层覆盖，有 annotator agreement 质检，并建立动态维护机制。

---

## Q：如何持续监控线上 LLM 应用的质量退化？

> 来源：AI 平台 SRE 面试

**新手答**："看用户反馈"

**高手答**：

线上质量监控需要主动检测而非被动等反馈：

**实时指标（秒级）**：
- API 错误率（rate_limit / auth / 5xx）→ 告警阈值 > 1%
- 首 token 延迟（TTFT）P95 → > 3s 告警
- 流式完成率（有没有 stream 中断）

**近实时指标（分钟级）**：
- Tool 调用失败率（工具执行返回 error）
- 空回复率（output tokens < 10，模型可能拒绝回答了）
- 截断率（stop_reason = max_tokens，说明输出被截断）

**离线指标（天级）**：
- 定期跑 golden dataset 的自动化评测
- Faithfulness / Answer Relevance 趋势图
- 用户 thumbs up/down 比率

**漂移检测**：
- 输入分布漂移（用户问的问题类型变了）→ embedding drift 检测
- 模型行为漂移（provider 悄悄更新了模型）→ 版本锁定 + canary 测试

**闭环**：
生产异常 → 自动保存完整 trace → 人工 review → 加入 regression set → 下次不再出错

**差距在哪**：新手只看用户反馈，高手建立三个时间粒度的监控体系，并有自动化告警和闭环机制。
