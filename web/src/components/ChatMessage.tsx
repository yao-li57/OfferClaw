'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Bot, User, Wrench } from 'lucide-react';

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: string[];
  isError?: boolean;
}

interface Props {
  message: Message;
  isStreaming?: boolean;
}

export function ChatMessage({ message, isStreaming }: Props) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
          isUser ? 'bg-blue-600' : 'bg-primary'
        }`}
      >
        {isUser ? <User size={16} /> : <Bot size={16} />}
      </div>

      <div
        className={`max-w-[80%] rounded-xl px-4 py-3 ${
          isUser
            ? 'bg-blue-600/20 text-zinc-100'
            : message.isError
              ? 'bg-red-900/20 text-red-300'
              : 'bg-surface-light text-zinc-200'
        }`}
      >
        {message.toolCalls && message.toolCalls.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1">
            {message.toolCalls.map((tool, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1 rounded bg-primary/20 px-2 py-0.5 text-xs text-primary"
              >
                <Wrench size={10} />
                {tool}
              </span>
            ))}
          </div>
        )}

        <div className={`markdown-body text-sm leading-relaxed ${isStreaming && !message.content ? 'cursor-blink' : ''}`}>
          {isUser ? (
            <p className="whitespace-pre-wrap">{message.content}</p>
          ) : (
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
          )}
        </div>
      </div>
    </div>
  );
}
