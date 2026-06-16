'use client';

import { Brain, MessageSquare, Plus, Trash2 } from 'lucide-react';

export interface SessionMeta {
  id: string;
  state: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
  preview: string;
}

interface Props {
  onNewSession: () => void;
  onSelectSession: (id: string) => void;
  onDeleteSession: (id: string) => void;
  currentSessionId: string | null;
  sessions: SessionMeta[];
  model: string;
  onModelChange: (model: string) => void;
}

const MODELS = [
  { id: 'claude', label: 'Claude' },
  { id: 'openai', label: 'GPT-4o' },
  { id: 'deepseek', label: 'DeepSeek' },
  { id: 'qgenie', label: 'Qgenie' },
];

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return '刚刚';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  return `${Math.floor(diff / 86_400_000)} 天前`;
}

export function Sidebar({
  onNewSession,
  onSelectSession,
  onDeleteSession,
  currentSessionId,
  sessions,
  model,
  onModelChange,
}: Props) {
  return (
    <aside className="hidden w-64 flex-col border-r border-zinc-800 bg-surface p-4 md:flex overflow-y-auto">
      <div className="mb-6 flex items-center gap-2">
        <Brain className="text-primary" size={24} />
        <span className="text-lg font-semibold">面试诊断</span>
      </div>

      <button
        onClick={onNewSession}
        className="mb-5 flex w-full items-center justify-center gap-2 rounded-xl border border-zinc-700 py-2 text-sm text-zinc-300 transition hover:border-primary hover:text-primary"
      >
        <Plus size={15} />
        新建会话
      </button>

      <div className="mb-5">
        <label className="mb-2 block text-xs font-medium text-zinc-400">模型</label>
        <div className="space-y-1">
          {MODELS.map((m) => (
            <button
              key={m.id}
              onClick={() => onModelChange(m.id)}
              className={`w-full rounded-lg px-3 py-2 text-left text-sm transition ${
                model === m.id
                  ? 'bg-primary/20 text-primary'
                  : 'text-zinc-400 hover:bg-surface-light hover:text-zinc-200'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 min-h-0">
        <label className="mb-2 block text-xs font-medium text-zinc-400">会话历史</label>
        {sessions.length === 0 ? (
          <p className="text-xs text-zinc-600 px-1">暂无历史会话</p>
        ) : (
          <div className="space-y-1">
            {sessions.map((s) => (
              <div
                key={s.id}
                className={`group relative rounded-lg transition ${
                  s.id === currentSessionId
                    ? 'bg-primary/15 border border-primary/30'
                    : 'hover:bg-surface-light'
                }`}
              >
                <button
                  onClick={() => onSelectSession(s.id)}
                  className="w-full px-3 py-2 text-left pr-8"
                >
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <MessageSquare
                      size={11}
                      className={s.id === currentSessionId ? 'text-primary' : 'text-zinc-500'}
                    />
                    <span
                      className={`text-xs truncate flex-1 ${
                        s.id === currentSessionId ? 'text-zinc-200' : 'text-zinc-400'
                      }`}
                    >
                      {s.preview || '新会话'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-zinc-600">{s.messageCount} 条消息</span>
                    <span className="text-[10px] text-zinc-600">{relativeTime(s.updatedAt)}</span>
                  </div>
                </button>

                {/* Delete button — visible on hover */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteSession(s.id);
                  }}
                  title="删除会话"
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 hidden group-hover:flex items-center justify-center w-6 h-6 rounded text-zinc-500 hover:text-red-400 hover:bg-red-400/10 transition"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-4 pt-4 border-t border-zinc-800">
        <label className="mb-1.5 block text-xs font-medium text-zinc-400">考察维度</label>
        <div className="space-y-0.5 text-xs text-zinc-600">
          <p>架构设计 / Harness 工程</p>
          <p>模型能力 / RAG</p>
          <p>多 Agent / 评测 / 全栈</p>
        </div>
      </div>
    </aside>
  );
}
