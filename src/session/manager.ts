import { randomUUID } from 'node:crypto';
import type { Message } from '../query-engine/types.js';
import type { Checkpoint, Session, SessionState } from './types.js';

export class SessionManager {
  private sessions = new Map<string, Session>();
  private checkpoints = new Map<string, Checkpoint[]>();

  create(userId?: string): Session {
    const session: Session = {
      id: randomUUID(),
      state: 'idle',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [],
      metadata: {
        userId,
        questionsAsked: 0,
        dimensions: [],
      },
    };
    this.sessions.set(session.id, session);
    return session;
  }

  get(id: string): Session | undefined {
    return this.sessions.get(id);
  }

  transition(id: string, newState: SessionState): void {
    const session = this.sessions.get(id);
    if (!session) throw new Error(`Session ${id} not found`);

    const valid = this.validTransitions(session.state);
    if (!valid.includes(newState)) {
      throw new Error(`Invalid transition: ${session.state} → ${newState}`);
    }

    session.state = newState;
    session.updatedAt = Date.now();
  }

  addMessage(id: string, message: Message): void {
    const session = this.sessions.get(id);
    if (!session) throw new Error(`Session ${id} not found`);

    session.messages.push(message);
    session.updatedAt = Date.now();

    if (message.role === 'user') {
      session.metadata.questionsAsked++;
    }
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

  private validTransitions(current: SessionState): SessionState[] {
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
