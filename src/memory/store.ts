import { randomUUID } from 'node:crypto';
import type { MemoryEntry, MemoryQuery } from './types.js';

export class MemoryStore {
  private entries: MemoryEntry[] = [];

  add(entry: Omit<MemoryEntry, 'id' | 'createdAt' | 'lastAccessedAt' | 'accessCount'>): MemoryEntry {
    const full: MemoryEntry = {
      ...entry,
      id: randomUUID(),
      createdAt: Date.now(),
      lastAccessedAt: Date.now(),
      accessCount: 0,
    };
    this.entries.push(full);
    return full;
  }

  query(q: MemoryQuery): MemoryEntry[] {
    let results = this.entries;

    if (q.sessionId) {
      results = results.filter((e) => e.sessionId === q.sessionId);
    }
    if (q.type) {
      results = results.filter((e) => e.type === q.type);
    }
    if (q.minImportance !== undefined) {
      results = results.filter((e) => e.importance >= q.minImportance!);
    }
    if (q.query) {
      const lower = q.query.toLowerCase();
      results = results.filter((e) => e.content.toLowerCase().includes(lower));
    }

    results.sort((a, b) => b.importance - a.importance);

    if (q.limit) {
      results = results.slice(0, q.limit);
    }

    for (const entry of results) {
      entry.lastAccessedAt = Date.now();
      entry.accessCount++;
    }

    return results;
  }

  getBySession(sessionId: string): MemoryEntry[] {
    return this.entries.filter((e) => e.sessionId === sessionId);
  }

  remove(id: string): boolean {
    const idx = this.entries.findIndex((e) => e.id === id);
    if (idx === -1) return false;
    this.entries.splice(idx, 1);
    return true;
  }

  size(): number {
    return this.entries.length;
  }
}
