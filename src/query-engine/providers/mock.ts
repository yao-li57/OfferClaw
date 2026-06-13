import type { LLMProvider, Message, StreamEvent, StreamParams, ToolSchema } from '../types.js';

export class MockProvider implements LLMProvider {
  name = 'mock';

  async *stream(params: StreamParams): AsyncIterable<StreamEvent> {
    const lastMsg = params.messages[params.messages.length - 1];
    const userContent = lastMsg?.content ?? '';
    const hasTools = (params.tools?.length ?? 0) > 0;

    const response = this.generateResponse(userContent, params.messages, hasTools, params.tools);

    if (response.type === 'tool_call') {
      yield { type: 'tool_use_start', id: `mock_tc_${Date.now()}`, name: response.toolName! };
      yield { type: 'tool_use_delta', input: JSON.stringify(response.toolInput!) };
      yield { type: 'tool_use_end' };
      yield {
        type: 'message_end',
        usage: { inputTokens: 100, outputTokens: 50 },
        stopReason: 'tool_use',
      };
    } else {
      const chunks = this.chunkText(response.text!);
      for (const chunk of chunks) {
        yield { type: 'text_delta', content: chunk };
        await sleep(15);
      }
      yield {
        type: 'message_end',
        usage: { inputTokens: 100, outputTokens: Math.ceil(response.text!.length / 4) },
        stopReason: 'end_turn',
      };
    }
  }

  async countTokens(messages: Message[]): Promise<number> {
    return messages.reduce((sum, m) => sum + (m.content?.length ?? 0) / 4, 0);
  }

  private generateResponse(
    userContent: string,
    messages: Message[],
    hasTools: boolean,
    tools?: ToolSchema[],
  ): { type: 'text' | 'tool_call'; text?: string; toolName?: string; toolInput?: Record<string, unknown> } {
    const lower = userContent.toLowerCase();
    const lastRole = messages[messages.length - 1]?.role;

    // If previous message was a tool result, generate text response based on it
    if (lastRole === 'tool') {
      return { type: 'text', text: this.generateFromToolResult(userContent, messages) };
    }

    // Decide whether to call a tool
    if (hasTools && tools?.length) {
      if (lower.includes('诊断') || lower.includes('题目') || lower.includes('我的回答')) {
        const question = this.extractQuestion(userContent);
        const answer = this.extractAnswer(userContent);
        if (question && answer) {
          return {
            type: 'tool_call',
            toolName: 'diagnose_answer',
            toolInput: { question, answer },
          };
        }
      }

      if (lower.includes('搜索') || lower.includes('查找') || lower.includes('知识库')) {
        return {
          type: 'tool_call',
          toolName: 'search_knowledge',
          toolInput: { query: userContent.slice(0, 50), limit: 5 },
        };
      }

      if (lower.includes('维度') || lower.includes('分类')) {
        return { type: 'tool_call', toolName: 'list_dimensions', toolInput: {} };
      }

      if (lower.includes('追问') || lower.includes('深入')) {
        return {
          type: 'tool_call',
          toolName: 'generate_followup',
          toolInput: { question: userContent, answer: '', depth: 'medium' },
        };
      }
    }

    return { type: 'text', text: this.generateTextResponse(userContent) };
  }

  private generateTextResponse(input: string): string {
    const lower = input.toLowerCase();

    if (lower.includes('你好') || lower.includes('hello') || lower.includes('hi')) {
      return `你好！我是面试诊断 Agent，专注于 AI Agent / LLM 工程方向的面试辅导。

你可以：
1. 直接输入一道面试题 + 你的回答，我会给出诊断
2. 输入 /dimensions 查看所有考察维度
3. 让我模拟面试官向你追问

试试看，输入一道你想练习的题目吧。`;
    }

    return `收到你的输入。请用以下格式让我帮你诊断：

**题目**：（面试问题）
**我的回答**：（你的作答内容）

或者直接说"帮我诊断一下 XXX 的回答"，我会调用诊断工具分析。`;
  }

  private generateFromToolResult(toolResult: string, messages: Message[]): string {
    try {
      const data = JSON.parse(toolResult);

      // Handle list_dimensions result
      if (data.dimensions) {
        return `当前知识库包含 **7 个考察维度**：\n\n${data.dimensions.map((d: any, i: number) => `${i + 1}. **${d.name}** (${d.id})`).join('\n')}\n\n你想从哪个维度开始练习？`;
      }

      // Handle search_knowledge result
      if (data.results !== undefined) {
        if (data.results.length === 0) {
          return `在知识库中搜索了"${data.query}"，暂未找到完全匹配的题目。你可以直接输入完整的面试题，我来帮你分析。`;
        }
        const items = data.results.slice(0, 3).map((r: any) => `- **${r.title}**：${r.question}`).join('\n');
        return `找到以下相关题目：\n\n${items}\n\n需要我对其中某道题进行详细讲解吗？`;
      }

      // Handle diagnose_answer result
      if (data.score !== undefined) {
        return this.buildDiagnosisResponse(data, messages);
      }

      // Handle generate_followup result
      if (data.followups) {
        const qs = data.followups.map((f: string, i: number) => `${i + 1}. ${f}`).join('\n');
        return `## 面试官可能的追问\n\n${qs}\n\n${data.hint ? `> 💡 ${data.hint}` : ''}\n\n你要试着回答其中一个吗？`;
      }
    } catch {}

    return `已处理完成。你还想继续练习其他题目吗？`;
  }

  private buildDiagnosisResponse(data: any, messages: Message[]): string {
    const score = data.score;
    const gaps = data.gaps ?? [];
    const suggestions = data.suggestions ?? [];
    const breakdown = data.breakdown ?? {};
    const question = data.question ?? '该面试题';

    // Find the original user question from earlier messages
    const userMsg = messages.find((m) => m.role === 'user' && m.content && m.content.length > 20);
    const originalAnswer = userMsg?.content?.slice(0, 100) ?? '';

    const scoreEmoji = score.overall >= 7 ? '🟢' : score.overall >= 5 ? '🟡' : '🔴';

    let response = `## 诊断结果\n\n`;
    response += `### ${scoreEmoji} 总分：${score.overall} / ${score.max}\n\n`;

    // Breakdown table
    response += `| 维度 | 得分 | 评价 |\n|------|------|------|\n`;
    if (breakdown.technicalDepth !== undefined) {
      response += `| 技术深度 | ${breakdown.technicalDepth}/10 | ${breakdown.technicalDepth >= 7 ? '✅ 有深度' : breakdown.technicalDepth >= 5 ? '⚠️ 一般' : '❌ 偏浅'} |\n`;
    }
    if (breakdown.structure !== undefined) {
      response += `| 表达结构 | ${breakdown.structure}/10 | ${breakdown.structure >= 7 ? '✅ 清晰' : breakdown.structure >= 5 ? '⚠️ 松散' : '❌ 缺乏层次'} |\n`;
    }
    if (breakdown.practicalExperience !== undefined) {
      response += `| 实践经验 | ${breakdown.practicalExperience}/10 | ${breakdown.practicalExperience >= 7 ? '✅ 有实战' : breakdown.practicalExperience >= 5 ? '⚠️ 偏理论' : '❌ 缺少案例'} |\n`;
    }
    if (breakdown.completeness !== undefined) {
      response += `| 完整性 | ${breakdown.completeness}/10 | ${breakdown.completeness >= 7 ? '✅ 全面' : breakdown.completeness >= 5 ? '⚠️ 有遗漏' : '❌ 不够完整'} |\n`;
    }

    // Gaps
    if (gaps.length > 0) {
      response += `\n### 主要差距\n\n`;
      response += gaps.map((g: string) => `- ${g}`).join('\n');
    }

    // Suggestions
    if (suggestions.length > 0) {
      response += `\n\n### 改进建议\n\n`;
      response += suggestions.map((s: string, i: number) => `${i + 1}. ${s}`).join('\n');
    }

    // Closing
    response += `\n\n---\n要我针对这道题生成追问，还是换一道题练习？`;

    return response;
  }

  private extractQuestion(text: string): string | undefined {
    const qMatch = text.match(/题目[：:]\s*(.+?)(?:\n\n|我的回答|$)/s);
    if (qMatch) return qMatch[1].trim();
    const diagMatch = text.match(/诊断.*?[：:]\s*(.+?)(?:\n|$)/);
    if (diagMatch) return diagMatch[1].trim();
    return undefined;
  }

  private extractAnswer(text: string): string | undefined {
    const aMatch = text.match(/(?:我的)?回答[：:]\s*(.+)/s);
    if (aMatch) return aMatch[1].trim();
    return undefined;
  }

  private chunkText(text: string): string[] {
    const chunks: string[] = [];
    let i = 0;
    while (i < text.length) {
      const size = 4 + Math.floor(Math.random() * 12);
      chunks.push(text.slice(i, i + size));
      i += size;
    }
    return chunks;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
