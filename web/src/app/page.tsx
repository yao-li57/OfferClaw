'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { ChatMessage, type Message } from '@/components/ChatMessage';
import { ChatInput } from '@/components/ChatInput';
import { Sidebar, type SessionMeta } from '@/components/Sidebar';
import { Header } from '@/components/Header';

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [model, setModel] = useState('qgenie');
  const [attachedFile, setAttachedFile] = useState<{ name: string; content: string } | null>(null);
  const [sessions, setSessions] = useState<SessionMeta[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // On mount: load session list and restore last active session
  useEffect(() => {
    void initSessions();
  }, []);

  async function initSessions(retryCount = 0) {
    try {
      const res = await fetch('/api/sessions');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { sessions: SessionMeta[] };
      const list: SessionMeta[] = data.sessions ?? [];
      setSessions(list);

      const savedId = typeof window !== 'undefined' ? localStorage.getItem('sessionId') : null;
      const match = savedId && list.find((s) => s.id === savedId);

      if (match) {
        await switchToSession(match.id, list);
      } else if (list.length > 0) {
        await switchToSession(list[0].id, list);
      } else {
        await createNewSession(list);
      }
    } catch {
      // Backend not ready yet — retry up to 4 times before creating a new session
      if (retryCount < 4) {
        setTimeout(() => { void initSessions(retryCount + 1); }, 1500);
      } else {
        await createNewSession([]);
      }
    }
  }

  async function switchToSession(id: string, currentList?: SessionMeta[]) {
    setSessionId(id);
    if (typeof window !== 'undefined') localStorage.setItem('sessionId', id);

    try {
      const res = await fetch(`/api/session/${id}/messages`);
      const data = await res.json() as { messages: Array<{ role: string; content: string; toolCalls?: string[] }> };
      const loaded: Message[] = (data.messages ?? []).map((m, i) => ({
        id: `loaded-${i}`,
        role: m.role as 'user' | 'assistant',
        content: m.content ?? '',
        toolCalls: m.toolCalls,
      }));
      setMessages(loaded);
    } catch {
      setMessages([]);
    }

    // Update sessions list to highlight current
    if (currentList) setSessions(currentList);
  }

  const refreshSessions = useCallback(async () => {
    try {
      const res = await fetch('/api/sessions');
      const data = await res.json() as { sessions: SessionMeta[] };
      setSessions(data.sessions ?? []);
    } catch {}
  }, []);

  async function createNewSession(currentList?: SessionMeta[]) {
    try {
      const res = await fetch('/api/session', { method: 'POST' });
      const data = await res.json() as { sessionId: string };
      const id = data.sessionId;
      setSessionId(id);
      setMessages([]);
      if (typeof window !== 'undefined') localStorage.setItem('sessionId', id);
      // Refresh session list after a moment (new session may not have messages yet)
      setTimeout(() => { void refreshSessions(); }, 300);
    } catch {
      const fallback = 'local-' + Date.now();
      setSessionId(fallback);
    }
  }

  async function sendMessage(content: string) {
    if (!content.trim() || isStreaming) return;

    const apiMessage = attachedFile
      ? `【已上传文件：${attachedFile.name}】\n${attachedFile.content}\n\n${content}`
      : content;
    const displayContent = attachedFile ? `📎 ${attachedFile.name}\n${content}` : content;

    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: displayContent };
    setMessages((prev) => [...prev, userMsg]);
    setAttachedFile(null);
    setIsStreaming(true);

    const assistantId = (Date.now() + 1).toString();
    setMessages((prev) => [...prev, { id: assistantId, role: 'assistant', content: '' }]);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: apiMessage, sessionId, model }),
      });

      if (!response.body) throw new Error('No response body');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6);
          if (data === '[DONE]') continue;

          try {
            const event = JSON.parse(data);
            if (event.type === 'text_delta') {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId ? { ...m, content: m.content + event.content } : m,
                ),
              );
            } else if (event.type === 'tool_call') {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? { ...m, toolCalls: [...(m.toolCalls ?? []), event.name] }
                    : m,
                ),
              );
            } else if (event.type === 'error') {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? { ...m, content: `错误: ${event.message}`, isError: true }
                    : m,
                ),
              );
            }
          } catch {}
        }
      }
    } catch (err) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, content: `错误: ${(err as Error).message}`, isError: true }
            : m,
        ),
      );
    } finally {
      setIsStreaming(false);
      void refreshSessions(); // update session list (message count / preview)
    }
  }

  async function deleteSession(id: string) {
    try {
      await fetch(`/api/session/${id}/messages`, { method: 'DELETE' });
    } catch {}
    if (id === sessionId) {
      const remaining = sessions.filter((s) => s.id !== id);
      if (remaining.length > 0) {
        await switchToSession(remaining[0].id);
      } else {
        await createNewSession([]);
      }
    }
    setSessions((prev) => prev.filter((s) => s.id !== id));
    if (typeof window !== 'undefined' && localStorage.getItem('sessionId') === id) {
      localStorage.removeItem('sessionId');
    }
  }

  return (
    <div className="flex h-screen">
      <Sidebar
        onNewSession={() => void createNewSession(sessions)}
        onSelectSession={(id) => void switchToSession(id)}
        onDeleteSession={(id) => void deleteSession(id)}
        currentSessionId={sessionId}
        sessions={sessions}
        model={model}
        onModelChange={setModel}
      />
      <main className="flex flex-1 flex-col min-w-0">
        <Header sessionId={sessionId} questionsCount={messages.filter((m) => m.role === 'user').length} />
        <div className="flex-1 overflow-y-auto px-4 py-6">
          <div className="mx-auto max-w-3xl space-y-4">
            {messages.length === 0 && <WelcomeScreen onSend={sendMessage} />}
            {messages.map((msg) => (
              <ChatMessage
                key={msg.id}
                message={msg}
                isStreaming={isStreaming && msg === messages[messages.length - 1]}
              />
            ))}
            <div ref={messagesEndRef} />
          </div>
        </div>
        <ChatInput
          onSend={sendMessage}
          disabled={isStreaming}
          attachedFile={attachedFile}
          onAttachFile={(name, content) => setAttachedFile({ name, content })}
          onClearFile={() => setAttachedFile(null)}
        />
      </main>
    </div>
  );
}

function WelcomeScreen({ onSend }: { onSend: (text: string) => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <h1 className="mb-4 text-3xl font-bold text-primary">面试诊断 Agent</h1>
      <p className="mb-8 max-w-md text-zinc-400">
        输入面试题和你的回答，获取结构化诊断。支持追问模拟、答案对比、学习路径推荐。
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {[
          '帮我诊断一下 ReAct 循环的回答',
          '列出所有考察维度',
          '模拟一场 Agent 架构面试',
          '我的薄弱点在哪里',
        ].map((text) => (
          <button
            key={text}
            onClick={() => onSend(text)}
            className="rounded-lg border border-zinc-700 px-4 py-3 text-left text-sm text-zinc-300 transition hover:border-primary hover:bg-surface-light"
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}
