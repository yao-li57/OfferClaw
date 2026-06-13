'use client';

import { MessageSquare } from 'lucide-react';

interface Props {
  sessionId: string | null;
  questionsCount: number;
}

export function Header({ sessionId, questionsCount }: Props) {
  return (
    <header className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
      <div className="flex items-center gap-2 text-sm text-zinc-400">
        <MessageSquare size={14} />
        <span>会话 {sessionId?.slice(0, 8) ?? '...'}</span>
      </div>
      <div className="text-xs text-zinc-500">
        已问 {questionsCount} 题
      </div>
    </header>
  );
}
