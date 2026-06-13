export interface MemoryEntry {
  id: string;
  sessionId: string;
  type: 'fact' | 'preference' | 'weakness' | 'strength' | 'context';
  content: string;
  importance: number;
  createdAt: number;
  lastAccessedAt: number;
  accessCount: number;
}

export interface MemoryQuery {
  sessionId?: string;
  type?: MemoryEntry['type'];
  query?: string;
  limit?: number;
  minImportance?: number;
}
