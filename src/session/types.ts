import type { Message } from '../query-engine/types.js';

export type SessionState = 'idle' | 'active' | 'paused' | 'completed' | 'error';

export interface Session {
  id: string;
  state: SessionState;
  createdAt: number;
  updatedAt: number;
  messages: Message[];
  metadata: SessionMetadata;
}

export interface SessionMetadata {
  userId?: string;
  topic?: string;
  questionsAsked: number;
  totalScore?: number;
  dimensions: string[];
}

export interface Checkpoint {
  id: string;
  sessionId: string;
  createdAt: number;
  messageIndex: number;
  state: SessionState;
  metadata: SessionMetadata;
}
