import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import type { MemoryEntry, MemoryQuery } from './types.js';

export class MemoryStore {
  private db?: Database.Database;
  private entries: MemoryEntry[] = []; // in-memory fallback when no DB

  constructor(db?: Database.Database) {
    this.db = db;
  }

  add(entry: Omit<MemoryEntry, 'id' | 'createdAt' | 'lastAccessedAt' | 'accessCount'>): MemoryEntry {
    const full: MemoryEntry = {
      ...entry,
      id: randomUUID(),
      createdAt: Date.now(),
      lastAccessedAt: Date.now(),
      accessCount: 0,
    };

    if (this.db) {
      this.db
        .prepare(
          `INSERT OR REPLACE INTO memories
           (id, session_id, type, content, importance, access_count, created_at, last_accessed_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          full.id,
          full.sessionId,
          full.type,
          full.content,
          full.importance,
          full.accessCount,
          Math.floor(full.createdAt / 1000),
          Math.floor(full.lastAccessedAt / 1000),
        );
    } else {
      this.entries.push(full);
    }

    return full;
  }

  query(q: MemoryQuery): MemoryEntry[] {
    if (this.db) return this._queryDb(q);
    return this._queryMemory(q);
  }

  private _queryDb(q: MemoryQuery): MemoryEntry[] {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (q.sessionId) { conditions.push('session_id = ?'); params.push(q.sessionId); }
    if (q.type) { conditions.push('type = ?'); params.push(q.type); }
    if (q.minImportance !== undefined) { conditions.push('importance >= ?'); params.push(q.minImportance); }
    if (q.query) { conditions.push('content LIKE ?'); params.push(`%${q.query.slice(0, 30)}%`); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = q.limit ? `LIMIT ${Number(q.limit)}` : '';
    const sql = `SELECT * FROM memories ${where} ORDER BY importance DESC ${limit}`;

    const rows = this.db!.prepare(sql).all(...params) as Record<string, unknown>[];

    if (rows.length) {
      const now = Math.floor(Date.now() / 1000);
      const ids = rows.map((r) => `'${r.id as string}'`).join(',');
      this.db!.prepare(
        `UPDATE memories SET last_accessed_at = ?, access_count = access_count + 1 WHERE id IN (${ids})`,
      ).run(now);
    }

    return rows.map((r) => this._rowToEntry(r));
  }

  private _queryMemory(q: MemoryQuery): MemoryEntry[] {
    let results = this.entries;
    if (q.sessionId) results = results.filter((e) => e.sessionId === q.sessionId);
    if (q.type) results = results.filter((e) => e.type === q.type);
    if (q.minImportance !== undefined) results = results.filter((e) => e.importance >= q.minImportance!);
    if (q.query) {
      const lower = q.query.toLowerCase();
      results = results.filter((e) => e.content.toLowerCase().includes(lower));
    }
    results = [...results].sort((a, b) => b.importance - a.importance);
    if (q.limit) results = results.slice(0, q.limit);
    for (const e of results) { e.lastAccessedAt = Date.now(); e.accessCount++; }
    return results;
  }

  private _rowToEntry(row: Record<string, unknown>): MemoryEntry {
    return {
      id: row.id as string,
      sessionId: row.session_id as string,
      type: row.type as MemoryEntry['type'],
      content: row.content as string,
      importance: row.importance as number,
      createdAt: (row.created_at as number) * 1000,
      lastAccessedAt: (row.last_accessed_at as number) * 1000,
      accessCount: row.access_count as number,
    };
  }

  getBySession(sessionId: string): MemoryEntry[] {
    return this.query({ sessionId });
  }

  /** Remove all entries whose content contains the given substring. Used for upsert-style updates. */
  removeByContent(substring: string): void {
    if (this.db) {
      this.db.prepare('DELETE FROM memories WHERE content LIKE ?').run(`%${substring}%`);
    } else {
      this.entries = this.entries.filter((e) => !e.content.includes(substring));
    }
  }

  remove(id: string): boolean {
    if (this.db) {
      return this.db.prepare('DELETE FROM memories WHERE id = ?').run(id).changes > 0;
    }
    const idx = this.entries.findIndex((e) => e.id === id);
    if (idx === -1) return false;
    this.entries.splice(idx, 1);
    return true;
  }

  size(): number {
    if (this.db) {
      return (this.db.prepare('SELECT COUNT(*) as cnt FROM memories').get() as { cnt: number }).cnt;
    }
    return this.entries.length;
  }
}
