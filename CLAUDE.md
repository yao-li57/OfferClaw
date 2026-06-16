# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# CLI (root) — uses tsx, no build step needed for dev
npm start                                              # interactive REPL session
npm run diagnose -- -q "<question>" -a "<answer>"      # one-shot diagnosis
npm run build-kb                                       # parse knowledge/ → SQLite (data/agent.db)
npm run build                                          # tsc → dist/
npm test                                               # vitest watch
npm run test:e2e                                       # vitest run tests/e2e
npx vitest run tests/unit/<name>.test.ts               # single test file
npx vitest run -t "<test name>"                        # single test by name

# Web UI (separate workspace)
cd web && npm install && npm run dev                   # Next.js 14 dev server
```

Configure at least one provider key in `.env` (`ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `DEEPSEEK_API_KEY`). With no keys, `createApp()` falls back to `MockProvider` so tests run offline — do not assume real LLM responses in unit tests.

## Architecture

This is a hand-written Agent Loop (no LangChain / LangGraph). The 10-layer Harness model is the load-bearing abstraction — most modules in `src/` map 1:1 to a layer, and `src/app.ts` is the composition root that wires them all into an `AgentLoop`.

### Request flow
`src/index.ts` (CLI) → `createApp()` (`src/app.ts`) → `AgentLoop.run(sessionId, userMessage)` (`src/agent/loop.ts`):

1. `SessionManager` appends the user message and transitions state `idle → active`.
2. `MemoryStore.query()` pulls user-scoped memories; `ContextManager.setLayer('memory', …)` injects them.
3. Loop iterates up to `maxIterations` (default 10):
   - `ContextManager.compress(messages)` — three levels: `none` (under target), `summary` (ratio < 2x), `aggressive` (≥ 2x). Target = 60% of `maxTokens` (default 100k).
   - `ContextManager.buildSystemPrompt()` joins layers by priority: `system(100) > immediate(90) > knowledge(80) > memory(60) > session(40)`.
   - `QueryEngine.query()` resolves provider via `ProviderRouter` (model name → provider, fallback to first registered), wraps `provider.stream()` in `withRetry`, and accumulates events through `StreamCollector` into a `ParsedResponse`.
   - If `response.type === 'text'` → append assistant message, return.
   - If `response.type === 'tool_use'` → for each tool call: `PermissionGate.check()` → `HookPipeline.runPreTool()` → `ToolRegistry.execute()` → `HookPipeline.runPostTool()` → audit. Tool result becomes a `role: 'tool'` message and the loop iterates.

### Layer responsibilities

| Layer | Module | Notes |
|---|---|---|
| Agent Loop | `src/agent/loop.ts` | Orchestrates one user turn end-to-end; the only place tool execution happens. |
| Query Engine | `src/query-engine/` | Provider-agnostic streaming. `engine.ts` (retry + collect), `router.ts` (model→provider map), `stream.ts` (event collector), `providers/{claude,openai,deepseek,mock}.ts`. All providers implement the same `LLMProvider` interface; add a new provider by implementing it and registering in `app.ts:buildProviders()`. |
| Tools | `src/tools/` | `registry.ts` holds tool defs; `builtin/` contains 13 domain tools (interview diagnosis, JD analysis, resume optimization, mock + realtime interview). Each tool declares a `RiskLevel` (`low`/`medium`/`high`/`critical`) which `PermissionGate` keys off. |
| Permission | `src/permission/gate.ts` | `critical` always requires user confirm; `high` requires confirm if rule says so; per-session per-tool rate limiting via 60s sliding window. All decisions go through `recordAudit()`. |
| Context | `src/context/manager.ts` | 5 named layers + 3-level compression. Token estimation is `chars / 3.5` — rough, not tokenizer-accurate. |
| Memory | `src/memory/` | `MemoryStore.query({ sessionId, limit })` returns user-scoped memories injected as a context layer each turn. |
| Session | `src/session/` | State machine (`idle`/`active`/`paused`/`completed`) + message log. |
| Hooks | `src/hooks/pipeline.ts` | `runPreTool` can mutate input or veto execution; `runPostTool` can rewrite the result. Built-ins: `inputSanitizerHook`, `tokenCounterHook`. |
| Command | `src/command/` | Slash commands (`/help`, `/status`, `/dimensions`, `/quit`, `/reset`); intercepted in `src/index.ts` REPL before reaching the agent. |
| Sub-agent | `src/sub-agent/` | Concurrency pool + runtime for spawning specialized sub-agents. |
| Realtime | `src/realtime/` | TTS + 8-rule defect analyzer for live mock interviews; surfaced as the `realtimeInterview` tool. |
| Knowledge | `src/knowledge/` | `parser.ts` walks `knowledge/{01-architecture,02-engineering,03-model}/*.md`; `search.ts` uses SQLite FTS5. Build with `npm run build-kb` before relying on `search-knowledge` tool. |
| DB | `src/db/` | `better-sqlite3` wrapper; default path `data/agent.db`. |

### Web UI
`web/` is an independent Next.js 14 workspace (own `package.json`, `tsconfig.json`). It calls the agent over SSE via `web/src/app/api/chat/` and `web/src/app/api/session/`. Changes to the agent's streaming contract must be reflected in `web/src/lib/sse.ts`.

### Knowledge base
Markdown under `knowledge/` is the source of truth; the SQLite DB is a derived index. After editing knowledge files, re-run `npm run build-kb` — the agent reads from SQLite, not the filesystem.

## Conventions

- ESM only (`"type": "module"`). Imports must use `.js` extensions even for `.ts` source (TS `moduleResolution: bundler`, `target: ES2022`).
- Tests live in `tests/unit/` (and `tests/e2e/` when present). `tsconfig.json` excludes `tests/` from the build.
- When adding a tool: put it in `src/tools/builtin/`, declare a `RiskLevel`, register it in `src/tools/index.ts:createToolRegistry()`. The system prompt in `src/app.ts` enumerates capabilities — keep it in sync when capabilities materially change.
- Provider keys gate which models appear in `ProviderRouter`. If you reference a model name in code or docs, verify it's listed in `buildProviders()` for the matching provider.
