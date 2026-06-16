import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import type { Message } from '../query-engine/types.js';
import type { Checkpoint, Session, SessionState } from './types.js';

export class SessionManager {
  private sessions = new Map<string, Session>();
  private checkpoints = new Map<string, Checkpoint[]>();
  private db?: Database.Database;

  constructor(db?: Database.Database) {
    this.db = db;
  }

  create(userId?: string): Session {
    const session: Session = {
      id: randomUUID(),
      state: 'idle',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [],
      metadata: { userId, questionsAsked: 0, dimensions: [] },
    };
    this.sessions.set(session.id, session);

    if (this.db) {
      this.db
        .prepare(
          `INSERT INTO sessions (id, state, user_id, metadata, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(
          session.id,
          session.state,
          userId ?? null,
          JSON.stringify(session.metadata),
          Math.floor(session.createdAt / 1000),
          Math.floor(session.updatedAt / 1000),
        );
    }
    return session;
  }

  get(id: string): Session | undefined {
    if (this.sessions.has(id)) return this.sessions.get(id);
    if (!this.db) return undefined;

    const row = this.db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as
      | Record<string, unknown>
      | undefined;
    if (!row) return undefined;

    const messages = this._loadMessages(id);
    const session: Session = {
      id: row.id as string,
      state: row.state as SessionState,
      createdAt: (row.created_at as number) * 1000,
      updatedAt: (row.updated_at as number) * 1000,
      messages,
      metadata: row.metadata ? JSON.parse(row.metadata as string) : { questionsAsked: 0, dimensions: [] },
    };
    this.sessions.set(id, session);
    return session;
  }

  transition(id: string, newState: SessionState): void {
    const session = this.sessions.get(id);
    if (!session) throw new Error(`Session ${id} not found`);

    const valid = this._validTransitions(session.state);
    if (!valid.includes(newState)) {
      throw new Error(`Invalid transition: ${session.state} → ${newState}`);
    }

    session.state = newState;
    session.updatedAt = Date.now();

    if (this.db) {
      this.db
        .prepare('UPDATE sessions SET state = ?, updated_at = ? WHERE id = ?')
        .run(newState, Math.floor(session.updatedAt / 1000), id);
    }
  }

  addMessage(id: string, message: Message): void {
    const session = this.sessions.get(id);
    if (!session) throw new Error(`Session ${id} not found`);

    session.messages.push(message);
    session.updatedAt = Date.now();

    if (message.role === 'user') session.metadata.questionsAsked++;

    if (this.db) {
      this.db
        .prepare(
          `INSERT INTO messages (session_id, role, content, tool_call_id, tool_calls)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run(
          id,
          message.role,
          message.content ?? null,
          message.toolCallId ?? null,
          message.toolCalls ? JSON.stringify(message.toolCalls) : null,
        );
      this.db
        .prepare(
          'UPDATE sessions SET updated_at = ?, metadata = ? WHERE id = ?',
        )
        .run(
          Math.floor(session.updatedAt / 1000),
          JSON.stringify(session.metadata),
          id,
        );
    }
  }

  /** Delete a session and all its messages. */
  delete(id: string): boolean {
    this.sessions.delete(id);
    this.checkpoints.delete(id);
    if (this.db) {
      this.db.prepare('DELETE FROM messages WHERE session_id = ?').run(id);
      const info = this.db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
      return info.changes > 0;
    }
    return true;
  }

  /** Return sessions ordered by recent activity (for sidebar list). */
  list(limit = 20): Array<{
    id: string;
    state: string;
    createdAt: number;
    updatedAt: number;
    messageCount: number;
    preview: string;
  }> {
    if (!this.db) {
      return Array.from(this.sessions.values())
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, limit)
        .map((s) => ({
          id: s.id,
          state: s.state,
          createdAt: s.createdAt,
          updatedAt: s.updatedAt,
          messageCount: s.messages.filter((m) => m.role === 'user' || m.role === 'assistant').length,
          preview: s.messages.find((m) => m.role === 'user')?.content?.slice(0, 50) ?? '新会话',
        }));
    }

    const rows = this.db
      .prepare(
        `SELECT s.id, s.state, s.created_at, s.updated_at,
                (SELECT COUNT(*) FROM messages WHERE session_id = s.id AND role IN ('user','assistant')) AS message_count,
                (SELECT content FROM messages WHERE session_id = s.id AND role = 'user' ORDER BY id LIMIT 1) AS preview
         FROM sessions s
         ORDER BY s.updated_at DESC
         LIMIT ?`,
      )
      .all(limit) as Record<string, unknown>[];

    return rows.map((r) => ({
      id: r.id as string,
      state: r.state as string,
      createdAt: (r.created_at as number) * 1000,
      updatedAt: (r.updated_at as number) * 1000,
      messageCount: r.message_count as number,
      preview: ((r.preview as string | null) ?? '新会话').slice(0, 50),
    }));
  }

  /** Return display messages (user + assistant only) for a session. */
  getDisplayMessages(
    sessionId: string,
  ): Array<{ role: string; content: string; toolCalls?: string[] }> {
    if (!this.db) {
      return (
        this.sessions
          .get(sessionId)
          ?.messages.filter((m) => m.role === 'user' || m.role === 'assistant')
          .map((m) => ({
            role: m.role,
            content: m.content ?? '',
            toolCalls: m.toolCalls?.map((tc) => tc.name),
          })) ?? []
      );
    }

    const rows = this.db
      .prepare(
        `SELECT role, content, tool_calls FROM messages
         WHERE session_id = ? AND role IN ('user','assistant')
         ORDER BY id`,
      )
      .all(sessionId) as Record<string, unknown>[];

    return rows.map((r) => ({
      role: r.role as string,
      content: (r.content as string | null) ?? '',
      toolCalls: r.tool_calls
        ? (JSON.parse(r.tool_calls as string) as Array<{ name: string }>).map((tc) => tc.name)
        : undefined,
    }));
  }

  checkpoint(id: string): Checkpoint {
    const session = this.sessions.get(id);
    if (!session) throw new Error(`Session ${id} not found`);

    const cp: Checkpoint = {
      id: randomUUID(),
      sessionId: id,
      createdAt: Date.now(),
      messageIndex: session.messages.length,
      state: session.state,
      metadata: { ...session.metadata },
    };

    const list = this.checkpoints.get(id) ?? [];
    list.push(cp);
    this.checkpoints.set(id, list);
    return cp;
  }

  rewind(sessionId: string, checkpointId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Session ${sessionId} not found`);

    const list = this.checkpoints.get(sessionId) ?? [];
    const cp = list.find((c) => c.id === checkpointId);
    if (!cp) throw new Error(`Checkpoint ${checkpointId} not found`);

    session.messages = session.messages.slice(0, cp.messageIndex);
    session.state = cp.state;
    session.metadata = { ...cp.metadata };
    session.updatedAt = Date.now();
  }

  listActive(): Session[] {
    return Array.from(this.sessions.values()).filter(
      (s) => s.state === 'active' || s.state === 'paused',
    );
  }

  private _loadMessages(sessionId: string): Message[] {
    if (!this.db) return [];
    const rows = this.db
      .prepare('SELECT role, content, tool_call_id, tool_calls FROM messages WHERE session_id = ? ORDER BY id')
      .all(sessionId) as Record<string, unknown>[];

    return rows.map((r) => ({
      role: r.role as Message['role'],
      content: (r.content as string | null) ?? undefined,
      toolCallId: (r.tool_call_id as string | null) ?? undefined,
      toolCalls: r.tool_calls ? JSON.parse(r.tool_calls as string) : undefined,
    }));
  }

  private _validTransitions(current: SessionState): SessionState[] {
    const map: Record<SessionState, SessionState[]> = {
      idle: ['active'],
      active: ['paused', 'completed', 'error'],
      paused: ['active', 'completed'],
      completed: [],
      error: ['active'],
    };
    return map[current];
  }
}
