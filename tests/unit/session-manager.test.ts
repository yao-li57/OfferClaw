import { describe, it, expect } from 'vitest';
import { SessionManager } from '../../src/session/manager.js';

describe('SessionManager', () => {
  it('should create a new session', () => {
    const mgr = new SessionManager();
    const session = mgr.create('user-1');

    expect(session.id).toBeTruthy();
    expect(session.state).toBe('idle');
    expect(session.metadata.userId).toBe('user-1');
  });

  it('should transition states correctly', () => {
    const mgr = new SessionManager();
    const session = mgr.create();

    mgr.transition(session.id, 'active');
    expect(mgr.get(session.id)!.state).toBe('active');

    mgr.transition(session.id, 'paused');
    expect(mgr.get(session.id)!.state).toBe('paused');

    mgr.transition(session.id, 'completed');
    expect(mgr.get(session.id)!.state).toBe('completed');
  });

  it('should reject invalid transitions', () => {
    const mgr = new SessionManager();
    const session = mgr.create();

    expect(() => mgr.transition(session.id, 'completed')).toThrow('Invalid transition');
  });

  it('should add messages and track count', () => {
    const mgr = new SessionManager();
    const session = mgr.create();
    mgr.transition(session.id, 'active');

    mgr.addMessage(session.id, { role: 'user', content: 'hello' });
    mgr.addMessage(session.id, { role: 'assistant', content: 'hi' });
    mgr.addMessage(session.id, { role: 'user', content: 'question' });

    const s = mgr.get(session.id)!;
    expect(s.messages).toHaveLength(3);
    expect(s.metadata.questionsAsked).toBe(2);
  });

  it('should checkpoint and rewind', () => {
    const mgr = new SessionManager();
    const session = mgr.create();
    mgr.transition(session.id, 'active');

    mgr.addMessage(session.id, { role: 'user', content: 'msg1' });
    mgr.addMessage(session.id, { role: 'assistant', content: 'reply1' });

    const cp = mgr.checkpoint(session.id);

    mgr.addMessage(session.id, { role: 'user', content: 'msg2' });
    mgr.addMessage(session.id, { role: 'assistant', content: 'reply2' });
    expect(mgr.get(session.id)!.messages).toHaveLength(4);

    mgr.rewind(session.id, cp.id);
    expect(mgr.get(session.id)!.messages).toHaveLength(2);
  });
});
