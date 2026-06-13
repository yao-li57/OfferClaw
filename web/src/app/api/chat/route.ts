import { NextRequest } from 'next/server';

const BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:3001';

export async function POST(req: NextRequest) {
  const body = await req.json();

  // In production, proxy to the backend API server
  // In dev/mock mode, generate mock SSE response directly
  const useMock = !process.env.BACKEND_URL;

  if (useMock) {
    return mockSSEResponse(body);
  }

  const backendRes = await fetch(`${BACKEND_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  return new Response(backendRes.body, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}

function mockSSEResponse(body: { message: string; model?: string }) {
  const encoder = new TextEncoder();
  const message = body.message ?? '';

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      await sleep(100);

      const response = generateMockResponse(message);

      // Simulate streaming
      const chunks = chunkText(response);
      for (const chunk of chunks) {
        send({ type: 'text_delta', content: chunk });
        await sleep(30);
      }

      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}

function generateMockResponse(input: string): string {
  const lower = input.toLowerCase();

  if (lower.includes('你好') || lower.includes('hello')) {
    return `你好！我是面试诊断 Agent，专注于 AI Agent / LLM 工程方向的面试辅导。\n\n你可以：\n1. 输入面试题 + 你的回答，我会给出诊断\n2. 问我任何 Agent 相关的面试问题\n3. 让我模拟面试官追问`;
  }

  if (lower.includes('react') || lower.includes('agent') || lower.includes('循环')) {
    return `## 诊断结果\n\n### 评分：6.5 / 10\n\n你的回答触及了核心概念，但缺少工程细节。\n\n**新手答**：「ReAct 就是先思考再行动」\n\n**高手答**：\n\nReAct 的核心是 Observe → Think → Act → Observe 闭环。工程关键点：\n1. **循环终止**：max_iterations 兜底\n2. **错误恢复**：结构化错误信息喂回模型\n3. **Context 膨胀**：sliding window 或 summarization\n4. **可观测性**：每轮结构化日志\n\n### 改进建议\n- 先给概念定义，再展开工程要点\n- 提到生产环境踩坑经验\n- 用具体数字增强说服力`;
  }

  if (lower.includes('维度') || lower.includes('分类')) {
    return `当前支持 **7 个考察维度**：\n\n1. 架构设计 (architecture)\n2. Harness 工程 (engineering)\n3. 模型能力 (model)\n4. RAG 知识增强 (rag)\n5. 多 Agent 协作 (multi-agent)\n6. 评测质量 (evaluation)\n7. 全栈工程 (full-stack)\n\n你想从哪个维度开始？`;
  }

  return `收到！请用以下格式输入：\n\n**题目**：（面试问题）\n**我的回答**：（你的作答）\n\n我会给出评分、差距分析和改进建议。`;
}

function chunkText(text: string): string[] {
  const chunks: string[] = [];
  let i = 0;
  while (i < text.length) {
    const size = 3 + Math.floor(Math.random() * 8);
    chunks.push(text.slice(i, i + size));
    i += size;
  }
  return chunks;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
