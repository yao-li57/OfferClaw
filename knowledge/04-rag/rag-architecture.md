# RAG 知识增强

## Q：RAG 的整体架构是什么？离线索引和在线检索各自做了什么？

> 来源：AI 工程师面试

**新手答**："RAG 就是把文档存进向量数据库，然后查出来拼到 prompt 里"

**高手答**：

RAG 分两条管线：

**离线索引管线**：
1. 文档加载（PDF/HTML/MD → 纯文本）
2. 分块（Chunking）— 按语义或固定长度切割
3. Embedding 计算 — 每块生成向量
4. 向量写入 — 存到向量数据库（Pinecone/Weaviate/pgvector）
5. 可选：提取关键词写到倒排索引（支持混合检索）

**在线检索管线**：
1. Query 理解 — 可选 HyDE（生成假设答案再检索）
2. 向量检索 — ANN 搜索 topK 候选
3. 混合检索 — 合并 BM25 稀疏检索结果
4. Re-ranking — cross-encoder 对候选重排
5. 上下文组装 — 控制 chunk 数量和 token 预算
6. LLM 生成 — 带 retrieved context 的 prompt

**差距在哪**：新手只知道"存取"，高手区分离线/在线、理解每步的职责，能说出瓶颈在哪层（通常是 chunking 策略和 re-ranking）。

---

## Q：Chunking 策略怎么选？Fixed-size、Recursive 和 Semantic 的 trade-off？

> 来源：NLP 工程师面试

**新手答**："按 512 个字符切一刀就行"

**高手答**：

| 策略 | 原理 | 适合场景 | 缺点 |
|------|------|---------|------|
| Fixed-size | 固定字符/token 数切割 | 格式规整的纯文本 | 会切断语义，chunk 边界随机 |
| Recursive | 按段落→句→词优先级递归切割 | 通用文档 | 同一章节可能被切成多块 |
| Semantic | 用 embedding 相似度判断边界 | 长篇叙述性文本 | 计算成本高，边界不稳定 |
| Document-aware | 按 markdown heading/HTML tag | 结构化文档 | 依赖文档有清晰结构 |

工程实践：
- **Overlap**：相邻 chunk 保留 10-20% 重叠，避免答案跨 chunk 丢失
- **Chunk 大小**：检索用小 chunk（128-256 tokens），生成用大 chunk（父 chunk）— Parent Document Retriever 模式
- **Metadata**：每个 chunk 保留来源、页码、章节标题，检索后用于引用

**差距在哪**：新手用 512 固定切，高手能说出 small-to-big retrieval 和 overlap 的原理。

---

## Q：向量检索的 ANN 算法有哪些？HNSW 和 IVF 怎么选？

> 来源：搜索工程师面试

**新手答**："就是计算余弦相似度找最近的向量"

**高手答**：

暴力计算 cosine similarity 在百万规模下是 O(n)，生产上不可行，需要近似最近邻（ANN）算法：

- **HNSW**（Hierarchical Navigable Small World）：图结构，检索路径是多层跳跃图。高查询速度（<10ms@百万级），高内存占用（约 4-8 bytes/vector + graph edges），适合内存充足的实时检索
- **IVF**（Inverted File Index）：先聚类，只在最近的 nprobe 个簇里暴力搜索。内存省，可以配合 PQ 量化进一步压缩，适合超大规模（10亿+）
- **ScaNN/DiskANN**：针对磁盘访问优化的 ANN，适合超出内存的规模

实际选型：
- <1000万向量、SLA <50ms → HNSW（Pinecone/Weaviate 默认）
- >1亿向量、内存受限 → IVF + PQ（FAISS）
- 需要磁盘持久化、写多读少 → DiskANN

**差距在哪**：新手只知道"余弦相似度"，高手区分精确/近似检索、能说出 HNSW 的 graph 跳跃原理和内存代价。

---

## Q：稀疏检索（BM25）和密集检索（向量）怎么融合？混合检索的 RRF 是什么？

> 来源：信息检索工程师面试

**新手答**："两种方法各取一半，拼在一起"

**高手答**：

稠密检索（Dense）和稀疏检索（Sparse）各有盲区：
- Dense：擅长语义相似，但精确词匹配（专有名词、代码、产品型号）效果差
- Sparse (BM25)：精确词匹配很好，但无法处理同义词、多语言

融合方法 — **RRF（Reciprocal Rank Fusion）**：
```
score_rrf = sum(1 / (k + rank_i))   k 通常取 60
```
不需要归一化各自的分数（dense 分数是余弦 0-1，BM25 是 TF-IDF 无界），只用名次排名融合，鲁棒性强。

工程实现：
1. 并行执行 BM25 检索 + 向量检索各取 top-N（N=20-50）
2. RRF 合并，取最终 top-K
3. 可选：cross-encoder re-ranking 进一步精筛

实测效果：混合检索比单纯向量检索在有专有名词的查询上 NDCG 提升 10-15%。

**差距在哪**：新手把融合理解为"分数相加"，高手知道跨系统分数不可直接相加，RRF 用名次而非分数来规避这个问题。

---

## Q：Re-ranking 阶段为什么需要 cross-encoder？bi-encoder 不够吗？

> 来源：机器学习工程师面试

**新手答**："re-ranking 就是把结果重新排一下序"

**高手答**：

**Bi-encoder**（向量检索用）：query 和 document 分别 encode，得到两个向量做点积。问题在于 query 和 document 的 attention 没有交互，丢失了"这段话是否真的回答了这个问题"的判断能力。但 bi-encoder 快，O(1) 检索。

**Cross-encoder**（re-ranking 用）：把 `[query, document]` 拼接输入同一个 transformer，所有 token 之间做全局 attention，输出一个相关性 score。能捕捉精细的语义匹配，但无法预计算，查询时要对每个候选做一次 forward pass，O(K) 开销。

架构实践（两阶段检索）：
1. **召回**：bi-encoder 向量检索 top-100（ms 级）
2. **精排**：cross-encoder 对 100 个候选重排，取 top-5（100-200ms）
3. 总延迟控制在 200-500ms

常用 cross-encoder：`ms-marco-MiniLM-L-6-v2`（6层，快）、`bge-reranker-large`（中文友好）

**差距在哪**：新手不区分 bi/cross encoder，高手理解召回-精排两阶段的延迟-精度 trade-off。

---

## Q：如何评估 RAG 系统的质量？RAGAS 框架评估的是哪些维度？

> 来源：AI 平台工程师面试

**新手答**："看用户满不满意"

**高手答**：

RAG 的评估需要独立评估 Retrieval 质量和 Generation 质量：

**RAGAS 4 个核心指标**：
1. **Faithfulness**（忠实度）：回答中的每个陈述是否有 retrieved context 支撑？用 LLM 逐句验证是否可以从 context 推导。高 faithfulness 意味着模型没有"编造"。
2. **Answer Relevance**（答案相关性）：回答是否真的回答了问题？用 LLM 从回答逆向生成 N 个假设问题，计算它们与原问题的 embedding 相似度。
3. **Context Precision**（上下文精确率）：retrieved 的 chunk 里有多少是真正有用的？高 precision 意味着没检索到很多噪声 chunk。
4. **Context Recall**（上下文召回率）：ground truth 答案所需的信息，有多少被成功检索到？

工程监控：
- 用 RAGAS 跑自动化评估集（50-200 个 golden QA pair）
- 设置 faithfulness < 0.8 触发告警（幻觉风险）
- context_recall < 0.7 说明 chunking 或检索需要优化

**差距在哪**：新手只看主观满意度，高手区分检索质量和生成质量，能用定量指标持续监控。

---

## Q：RAG 和 Fine-tuning 怎么选？什么场景必须 Fine-tuning？

> 来源：AI 工程师面试

**新手答**："RAG 比较容易，Fine-tuning 效果好"

**高手答**：

| 维度 | RAG | Fine-tuning |
|------|-----|-------------|
| 知识更新 | 实时（改索引即可） | 需要重新训练 |
| 私有文档 | 天然适合 | 知识泄露风险（memorization） |
| 推理成本 | 高（每次检索+长 prompt） | 低（短 prompt 足够） |
| 格式/风格控制 | 弱 | 强 |
| 领域词汇 | 检索可弥补 | 模型直接掌握 |

**必须 Fine-tuning 的场景**：
1. 输出格式有极高一致性要求（JSON Schema、特定代码风格）
2. 专有领域词汇量极大（医疗/法律/金融），检索 context 放不下所有术语
3. 推理延迟要求极低，context 太长不可接受
4. 需要改变模型的"行为模式"（语气、拒绝策略）

**RAG 优先的场景**：
1. 知识库频繁更新（新闻、法规、产品文档）
2. 需要精确引用来源（可信度验证）
3. 训练数据不足

黄金法则：先 RAG，测效果；瓶颈在"行为"不在"知识"时才考虑 Fine-tuning。

**差距在哪**：新手把两者对立，高手理解它们解决不同问题，且可以组合（RAG + Fine-tuned model）。

---

## Q：HyDE（Hypothetical Document Embeddings）是什么原理？什么时候用？

> 来源：检索增强研究员面试

**新手答**："没听说过"

**高手答**：

HyDE 解决的是**查询端和文档端的语义分布不匹配**问题：

问题：用户查询通常很短（"RAG 怎么评估？"），而文档 chunk 是完整段落。两者的 embedding 空间分布不同，短查询的向量可能离相关文档的向量较远。

HyDE 做法：
1. 用 LLM 根据查询生成一段假设性的答案（Hypothetical Document）
2. 用这个假设答案的 embedding 去检索向量数据库
3. 假设答案和真实文档在"文档空间"里更接近，检索效果更好

适用场景：
- 查询很短但需要从长文档中检索
- 查询是问题形式但文档是陈述形式（Q/A 不对齐）
- 检索 recall 不足时的改进手段

代价：增加一次 LLM 调用（延迟 +200-500ms），以及如果假设答案生成偏了会引入噪声。

工程建议：A/B 测试 HyDE 和标准检索，只在 recall 有显著提升时才上线。

**差距在哪**：新手不知道查询-文档分布不匹配问题，高手能解释 HyDE 的原理和代价权衡。
