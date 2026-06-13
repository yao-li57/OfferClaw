import { describe, it, expect } from 'vitest';
import { ContextManager } from '../../src/context/manager.js';

describe('ContextManager', () => {
  it('should build system prompt from layers by priority', () => {
    const mgr = new ContextManager();
    mgr.setLayer('system', 'You are an agent');
    mgr.setLayer('knowledge', 'Relevant docs here');
    mgr.setLayer('immediate', 'Current task context');

    const prompt = mgr.buildSystemPrompt();
    expect(prompt).toContain('You are an agent');
    expect(prompt).toContain('Relevant docs here');
    expect(prompt).toContain('Current task context');

    // system (100) > immediate (90) > knowledge (80)
    const parts = prompt.split('\n\n');
    expect(parts[0]).toBe('You are an agent');
    expect(parts[1]).toBe('Current task context');
    expect(parts[2]).toBe('Relevant docs here');
  });

  it('should not compress when under limit', () => {
    const mgr = new ContextManager(100000);
    const messages = [
      { role: 'user' as const, content: 'short message' },
      { role: 'assistant' as const, content: 'short reply' },
    ];

    const result = mgr.compress(messages);
    expect(result.level).toBe('none');
    expect(result.messages).toEqual(messages);
  });

  it('should compress long conversations', () => {
    const mgr = new ContextManager(500);
    const messages = Array.from({ length: 20 }, (_, i) => ({
      role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
      content: 'x'.repeat(200),
    }));

    const result = mgr.compress(messages);
    expect(result.level).not.toBe('none');
    expect(result.messages.length).toBeLessThan(messages.length);
  });
});
