import type { RiskLevel } from '../tools/types.js';
import type { AuditEntry, PermissionDecision, PermissionRule } from './types.js';

export class PermissionGate {
  private rules = new Map<string, PermissionRule>();
  private auditLog: AuditEntry[] = [];
  private callCounts = new Map<string, { count: number; windowStart: number }>();

  registerRule(rule: PermissionRule): void {
    this.rules.set(rule.toolName, rule);
  }

  check(toolName: string, riskLevel: RiskLevel, sessionId: string): PermissionDecision {
    const rule = this.rules.get(toolName);

    if (rule?.rateLimitPerMinute) {
      const key = `${sessionId}:${toolName}`;
      const now = Date.now();
      const tracker = this.callCounts.get(key);

      if (tracker && now - tracker.windowStart < 60000) {
        if (tracker.count >= rule.rateLimitPerMinute) {
          return { allowed: false, reason: 'Rate limit exceeded' };
        }
        tracker.count++;
      } else {
        this.callCounts.set(key, { count: 1, windowStart: now });
      }
    }

    if (riskLevel === 'critical') {
      return { allowed: true, requiresUserConfirm: true };
    }
    if (riskLevel === 'high' && rule?.requiresConfirmation) {
      return { allowed: true, requiresUserConfirm: true };
    }

    return { allowed: true };
  }

  recordAudit(entry: AuditEntry): void {
    this.auditLog.push(entry);
  }

  getAuditLog(sessionId?: string): AuditEntry[] {
    if (!sessionId) return this.auditLog;
    return this.auditLog.filter((e) => e.sessionId === sessionId);
  }
}
