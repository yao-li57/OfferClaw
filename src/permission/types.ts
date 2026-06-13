import type { RiskLevel } from '../tools/types.js';

export interface PermissionRule {
  toolName: string;
  riskLevel: RiskLevel;
  requiresConfirmation: boolean;
  rateLimitPerMinute?: number;
}

export interface PermissionDecision {
  allowed: boolean;
  reason?: string;
  requiresUserConfirm?: boolean;
}

export interface AuditEntry {
  timestamp: number;
  sessionId: string;
  toolName: string;
  riskLevel: RiskLevel;
  decision: 'allowed' | 'denied' | 'confirmed';
  input?: Record<string, unknown>;
  userId?: string;
}
