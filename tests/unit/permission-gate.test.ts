import { describe, it, expect } from 'vitest';
import { PermissionGate } from '../../src/permission/gate.js';

describe('PermissionGate', () => {
  it('should allow low-risk tools without confirmation', () => {
    const gate = new PermissionGate();
    const decision = gate.check('search_knowledge', 'low', 'session-1');
    expect(decision.allowed).toBe(true);
    expect(decision.requiresUserConfirm).toBeUndefined();
  });

  it('should require confirmation for critical risk', () => {
    const gate = new PermissionGate();
    const decision = gate.check('dangerous_tool', 'critical', 'session-1');
    expect(decision.allowed).toBe(true);
    expect(decision.requiresUserConfirm).toBe(true);
  });

  it('should enforce rate limits', () => {
    const gate = new PermissionGate();
    gate.registerRule({
      toolName: 'search_knowledge',
      riskLevel: 'low',
      requiresConfirmation: false,
      rateLimitPerMinute: 3,
    });

    gate.check('search_knowledge', 'low', 's1');
    gate.check('search_knowledge', 'low', 's1');
    gate.check('search_knowledge', 'low', 's1');
    const fourth = gate.check('search_knowledge', 'low', 's1');

    expect(fourth.allowed).toBe(false);
    expect(fourth.reason).toContain('Rate limit');
  });

  it('should record audit entries', () => {
    const gate = new PermissionGate();
    gate.recordAudit({
      timestamp: Date.now(),
      sessionId: 's1',
      toolName: 'test',
      riskLevel: 'low',
      decision: 'allowed',
    });

    const log = gate.getAuditLog('s1');
    expect(log).toHaveLength(1);
    expect(log[0].toolName).toBe('test');
  });
});
