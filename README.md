# OfferClaw — AI 全链路求职辅导 Agent

> 纯手写 Agent Loop，不依赖 LangChain / LangGraph，完整实现 10 层 Harness 工程架构

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-18+-339933?style=flat-square&logo=node.js)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5+-3178c6?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-14+-000000?style=flat-square&logo=next.js)](https://nextjs.org/)

---

## 项目简介

OfferClaw 是一个面向 AI Agent / LLM 工程方向求职者的全链路辅导系统。核心特点：

- **纯手写 Agent Loop** — 不依赖任何 Agent 框架，完整实现 10 层 Harness 架构，每层职责单一、可独立替换
- **Skills 复合编排** — 三个内置 Skill（全链路诊断 / JD全分析 / 快速模拟面试），`AsyncGenerator<SkillEvent>` 流式进度，`invoke_skill` 工具双路触发
- **并行诊断编排** — 内容 / 表达 / 语音三通道 Sub-agent 并发执行，速度比串行快 2-3x，RRF 加权分数融合，失败隔离
- **知识库驱动** — 385+ 道面试题，覆盖 15 个核心考察维度，**双通道检索**：SQLite FTS5（词法）+ Embedding 向量（语义）× Reciprocal Rank Fusion 融合
- **持久化记忆** — 每次诊断结果写入 SQLite，跨会话追踪薄弱点，二次作答自动更新分数
- **Web UI** — Next.js 14 + SSE 流式输出，多会话管理，支持文件上传和语音输入

---

## 界面截图

![首页](./assets/首页.png)

<table>
  <tr>
    <td width="50%">
      <img src="./assets/知识库维度.png" alt="知识库维度" />
      <p align="center"><sub>知识库维度 — 实时统计各维度题目数量</sub></p>
    </td>
    <td width="50%">
      <img src="./assets/薄弱点分析.png" alt="薄弱点分析" />
      <p align="center"><sub>薄弱点分析 — 跨会话追踪，维度级学习报告</sub></p>
    </td>
  </tr>
  <tr>
    <td colspan="2">
      <img src="./assets/模拟问题.png" alt="模拟面试" />
      <p align="center"><sub>模拟面试 — 从知识库抽题，流式输出诊断结果</sub></p>
    </td>
  </tr>
</table>

---

## 功能模块

| 模块 | 能力 |
|:---|:---|
| 🎯 面试诊断 | 输入面试题 + 回答 → **三通道并行诊断**（内容/表达/语音）→ 评分 + 差距分析 + 改进建议 |
| 📋 JD 分析 | 贴入 JD → 技术栈提取 + 职级判断 + 面试准备重点 |
| 📝 简历优化 | 段落级诊断：量化度 / STAR 结构 / 关键词覆盖 |
| 🔗 简历-JD 匹配 | 关键词覆盖率 + 缺失项 + 定向包装建议 |
| 🎲 模拟面试 | 从知识库按维度抽题，难度可选 |
| 🎙️ 实时面试模拟 | TTS 提问 → 实时缺陷检测 → 逐题反馈 → 总结报告 |
| 📊 薄弱点追踪 | 跨会话记录每道题得分，生成维度级学习报告 |

---

## 快速开始

### 公共步骤

```bash
git clone https://github.com/yao-li57/OfferClaw.git
cd OfferClaw

# 安装依赖
npm install

# 配置 API Key（至少配一个）
cp .env.example .env
# 编辑 .env 填入 key（支持 Claude / OpenAI / DeepSeek / 自定义 OpenAI 兼容端点）

# 构建知识库索引（knowledge/ + learn-agent-interview/ 合并写入 SQLite）
npm run build-kb
```

### 方式一：Web UI

```bash
# 终端 1 — 启动后端（默认端口 3001）
npm run server

# 终端 2 — 启动 Web UI（默认端口 3000）
cd web && npm install && npm run dev
# 访问 http://localhost:3000
```

### 方式二：CLI 交互模式

```bash
# 启动交互式 REPL（自动恢复上次会话）
npm start

# 指定模型
npm start -- --model claude-sonnet-4-20250514
```

启动后直接输入面试题和回答，支持以下斜杠命令：

| 命令 | 说明 |
|:---|:---|
| `/help` | 帮助信息 |
| `/skills` | 列出所有可用 Skill |
| `/dimensions` | 查看知识库维度分布 |
| `/status` | 当前 session 状态 |
| `/reset` | 开启新会话 |
| `/quit` | 退出 |

### 方式三：单次诊断（脚本 / CI）

```bash
npm run diagnose -- -q "什么是 ReAct 模式？" -a "就是让模型先想再做"
```

---

## 架构设计

### Harness 10 层模型

OfferClaw 的核心是一套手写的 **10 层 Harness** 架构，每一层职责单一、可独立替换，不依赖任何 Agent 框架。

```
用户输入
    │
    ▼
┌──────────────────────────────────────────────────────────────┐
│  10  Command          /help /skills /reset …                 │  ← 斜杠命令拦截层
├──────────────────────────────────────────────────────────────┤
│   9  Hook Pipeline    inputSanitizer · tokenCounter          │  ← pre/post-tool 治理
├──────────────────────────────────────────────────────────────┤
│   8  Session          状态机 idle→active→paused · checkpoint │  ← 会话生命周期
├──────────────────────────────────────────────────────────────┤
│   7  Permission Gate  RiskLevel · Rate Limit · Audit Log     │  ← 权限与审计
├──────────────────────────────────────────────────────────────┤
│   6  Memory           weakness/strength · 重要度衰减          │  ← 跨会话长期记忆
├──────────────────────────────────────────────────────────────┤
│   5  Context Manager  5 层优先级 · 3 级压缩 · Token 预算     │  ← System Prompt 组装
├──────────────────────────────────────────────────────────────┤
│   4  Query Engine     Provider Router · Retry · Stream       │  ← 多 Provider 统一调用
│                       Claude / GPT-4o / DeepSeek / Mock      │
├──────────────────────────────────────────────────────────────┤
│   3  Skills           full-diagnosis · jd-full-analysis      │  ← 多工具复合工作流
│                       quick-mock  （AsyncGenerator 流式进度）│
├──────────────────────────────────────────────────────────────┤
│   2  Tools            15 内置工具 · RiskLevel · invoke_skill │  ← 原子能力单元
│                       parallel_diagnose（3维并行 + RRF融合） │
├──────────────────────────────────────────────────────────────┤
│   1  Sub-agent        DiagnosisOrchestrator · SubAgent       │  ← 并发执行 + 失败隔离
│                       ConcurrencyPool（maxConcurrency=3）    │
└──────────────────────────────────────────────────────────────┘
    │
    ▼
输出（流式 SSE / CLI）
```

| 层 | 模块 | 核心职责 |
|:--|:--|:--|
| 10 | `src/command/` | 斜杠命令解析，在消息到达 Agent 前拦截处理 |
| 9 | `src/hooks/` | pre-tool 输入净化、post-tool 结果改写、token 计数 |
| 8 | `src/session/` | 对话状态机 + checkpoint/rewind + SQLite 持久化 |
| 7 | `src/permission/` | 工具风险分级（low/medium/high/critical）+ 速率限制 + 审计日志 |
| 6 | `src/memory/` | 长期记忆存取、重要度衰减、跨会话薄弱点追踪 |
| 5 | `src/context/` | 5 优先级层（system > immediate > knowledge > memory > session）+ 3 级压缩 |
| 4 | `src/query-engine/` | Provider 路由、流式 SSE 收集、指数退避重试 |
| 3 | `src/skills/` | SkillRegistry + `AsyncGenerator<SkillEvent>` 流式进度编排 |
| 2 | `src/tools/` | ToolRegistry + 15 内置工具，含 `parallel_diagnose` 三维并行诊断 |
| 1 | `src/agent/` | SubAgent + DiagnosisOrchestrator + ConcurrencyPool |

### 请求流

```
用户消息
 → Command 拦截（/skills? 直接返回）
 → AgentLoop.run()
     ├─ Memory 加载薄弱点 → Context 注入
     ├─ Context 压缩 → buildSystemPrompt()
     ├─ QueryEngine.query() ──→ LLM 响应
     │       └─ ProviderRouter → Provider.stream() → StreamCollector
     ├─ type=text → 返回
     └─ type=tool_use
           ├─ PermissionGate.check()
           ├─ HookPipeline.runPreTool()
           ├─ ToolRegistry.execute()
           │     └─ invoke_skill? → SkillRegistry.run()
           │           └─ Skill steps → ToolRegistry.execute()（并行/串行）
           │                 └─ parallel_diagnose → Orchestrator
           │                       └─ ConcurrencyPool → SubAgent × 3
           ├─ HookPipeline.runPostTool()
           └─ 结果追加 messages → 下一轮迭代
```

### 技术栈

| 层级 | 选型 |
|:---|:---|
| LLM 调用 | `@anthropic-ai/sdk` + `openai` SDK（无框架直调） |
| 支持模型 | Claude / GPT-4o / DeepSeek / 任意 OpenAI 兼容端点 |
| 运行时 | Node.js 18+ + TypeScript 5.5 (ES2022 ESM) |
| 数据库 | better-sqlite3（会话 / 记忆 / 知识库） |
| 知识检索 | SQLite FTS5（词法）+ OpenAI `text-embedding-3-small`（向量）× Reciprocal Rank Fusion |
| 前端 | Next.js 14 + Tailwind CSS + SSE 流式 |

---

## 目录结构

```
src/
├── agent/           # Layer 1 — SubAgent / DiagnosisOrchestrator / ConcurrencyPool
├── skills/          # Layer 3 — SkillRegistry + 3 内置 Skills（full-diagnosis / jd-full-analysis / quick-mock）
├── query-engine/    # Layer 4 — 多 Provider 统一调用（重试 / 路由 / 流式）
│   └── providers/   # Claude / OpenAI / DeepSeek / Mock
├── tools/
│   └── builtin/     # Layer 2 — 15 个内置工具（含 parallel_diagnose / invoke_skill）
├── context/         # Layer 5 — 5 优先级层 + 3 级压缩
├── memory/          # Layer 6 — SQLite 持久化记忆 + 重要度衰减
├── session/         # Layer 8 — 会话状态机 + checkpoint
├── permission/      # Layer 7 — 风险分级 + 速率限制 + 审计日志
├── hooks/           # Layer 9 — pre/post-tool Hook 管线
├── command/         # Layer 10 — 斜杠命令（/help /skills /dimensions …）
└── db/              # SQLite schema 与连接
knowledge/           # 面试题知识库（Markdown → SQLite FTS5 + Embedding）
learn-agent-interview/  # 385+ 道结构化面试题（15 个维度，新手答/高手答/差距分析）
web/                 # Next.js Web UI
└── src/
    ├── app/api/     # SSE 聊天 / 会话 / 文件上传 / 语音转写
    └── components/  # Sidebar / ChatMessage / ChatInput
```

---

## 环境变量

```env
# 至少配置一个 LLM provider
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
DEEPSEEK_API_KEY=sk-...

# 自定义 OpenAI 兼容端点（三项都填才启用，优先级最高）
LLM_BASE_URL=https://your-endpoint/v1
LLM_API_KEY=your-key
LLM_MODEL=your-model-name

# 知识库向量检索（需 OpenAI 兼容的 embedding 端点）
EMBEDDING_MODEL=text-embedding-3-small
```

---

## License

[MIT](LICENSE) © [yao-li57](https://github.com/yao-li57)
