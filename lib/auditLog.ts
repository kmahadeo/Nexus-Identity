/**
 * lib/auditLog.ts — Real audit event logging backed by localStorage.
 *
 * Every security-relevant mutation (vault, passkeys, teams, admin, auth)
 * writes an AuditEvent here.  The log is capped at MAX_EVENTS entries (FIFO).
 */

import { sessionStorage_ } from './storage';

/* ── Types ──────────────────────────────────────────────────────────────── */

export interface AuditEvent {
  id: string;
  timestamp: number;
  action: string;           // e.g. 'vault.entry.created', 'passkey.registered'
  actor: string;            // principalId
  actorEmail: string;
  actorRole: string;
  resource?: string;        // entry ID, team ID, etc.
  resourceType?: string;    // 'vault_entry', 'passkey', 'team', etc.
  details: string;
  ipAddress: string;        // '127.0.0.1' for local
  result: 'success' | 'denied' | 'error';
}

export interface AuditFilters {
  actor?: string;
  action?: string;
  resourceType?: string;
  result?: AuditEvent['result'];
  from?: number;            // epoch ms
  to?: number;              // epoch ms
}

/* ── Constants ──────────────────────────────────────────────────────────── */

const AUDIT_KEY = 'nexus-audit-log';
const MAX_EVENTS = 1000;

/* ── Helpers ────────────────────────────────────────────────────────────── */

function readLog(): AuditEvent[] {
  try {
    return JSON.parse(localStorage.getItem(AUDIT_KEY) ?? '[]') as AuditEvent[];
  } catch {
    return [];
  }
}

function writeLog(events: AuditEvent[]): void {
  try {
    localStorage.setItem(AUDIT_KEY, JSON.stringify(events));
  } catch { /* quota */ }
}

/* ── Public API ─────────────────────────────────────────────────────────── */

/**
 * Persist a new audit event.  Automatically populates actor fields from the
 * current session when they are not supplied.
 */
export function logAuditEvent(
  event: Omit<AuditEvent, 'id' | 'timestamp' | 'actor' | 'actorEmail' | 'actorRole' | 'ipAddress'> & {
    actor?: string;
    actorEmail?: string;
    actorRole?: string;
    ipAddress?: string;
  },
): AuditEvent {
  const session = sessionStorage_.get();

  const full: AuditEvent = {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    actor: event.actor ?? session?.principalId ?? 'unknown',
    actorEmail: event.actorEmail ?? session?.email ?? 'unknown',
    actorRole: event.actorRole ?? session?.role ?? 'unknown',
    ipAddress: event.ipAddress ?? '127.0.0.1',
    action: event.action,
    resource: event.resource,
    resourceType: event.resourceType,
    details: event.details,
    result: event.result,
  };

  const log = readLog();
  log.unshift(full);
  // FIFO cap
  if (log.length > MAX_EVENTS) {
    log.length = MAX_EVENTS;
  }
  writeLog(log);
  return full;
}

/**
 * Retrieve audit events with optional filters.
 */
export function getAuditLog(filters?: AuditFilters): AuditEvent[] {
  let log = readLog();

  if (!filters) return log;

  if (filters.actor) {
    log = log.filter(e => e.actor === filters.actor);
  }
  if (filters.action) {
    log = log.filter(e => e.action.startsWith(filters.action!));
  }
  if (filters.resourceType) {
    log = log.filter(e => e.resourceType === filters.resourceType);
  }
  if (filters.result) {
    log = log.filter(e => e.result === filters.result);
  }
  if (filters.from != null) {
    log = log.filter(e => e.timestamp >= filters.from!);
  }
  if (filters.to != null) {
    log = log.filter(e => e.timestamp <= filters.to!);
  }

  return log;
}

/**
 * Get all audit events for a specific resource (by ID).
 */
export function getAuditLogForResource(resourceId: string): AuditEvent[] {
  return readLog().filter(e => e.resource === resourceId);
}

/**
 * Clear all audit events (admin use only).
 */
export function clearAuditLog(): void {
  writeLog([]);
}
