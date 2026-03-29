/**
 * lib/permissions.ts — Role-Based Access Control (RBAC) + Just-In-Time (JIT) access.
 *
 * Modelled on NIST SP 800-162 (RBAC) and CISA Zero Trust guidelines.
 * Every resource operation must call canDo() before executing.
 */

import type { UserRole } from './storage';

/* ── Permission catalogue ─────────────────────────────────────────────── */

export type Permission =
  | 'vault:read:own'   | 'vault:write:own'   | 'vault:delete:own'
  | 'vault:read:shared'| 'vault:write:shared'
  | 'vault:read:all'   | 'vault:admin'
  | 'passkey:read:own' | 'passkey:write:own'  | 'passkey:delete:own'
  | 'passkey:read:all' | 'passkey:admin'
  | 'team:read'        | 'team:write'         | 'team:admin'
  | 'admin:users:read' | 'admin:users:write'
  | 'admin:policies:read' | 'admin:policies:write'
  | 'admin:siem:read'  | 'admin:compliance:read' | 'admin:audit:read'
  | 'settings:read:own'| 'settings:write:own' | 'settings:admin'
  | 'integrations:read'| 'integrations:write' | 'integrations:admin'
  | 'developer:read'   | 'developer:write';

/* ── Role → permission matrix ─────────────────────────────────────────── */

const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  admin: [
    'vault:read:own','vault:write:own','vault:delete:own',
    'vault:read:shared','vault:write:shared','vault:read:all','vault:admin',
    'passkey:read:own','passkey:write:own','passkey:delete:own','passkey:read:all','passkey:admin',
    'team:read','team:write','team:admin',
    'admin:users:read','admin:users:write',
    'admin:policies:read','admin:policies:write',
    'admin:siem:read','admin:compliance:read','admin:audit:read',
    'settings:read:own','settings:write:own','settings:admin',
    'integrations:read','integrations:write','integrations:admin',
    'developer:read','developer:write',
  ],
  individual: [
    'vault:read:own','vault:write:own','vault:delete:own','vault:read:shared',
    'passkey:read:own','passkey:write:own','passkey:delete:own',
    'team:read',
    'settings:read:own','settings:write:own',
    'integrations:read','developer:read',
  ],
  team: [
    'vault:read:own','vault:write:own','vault:delete:own',
    'vault:read:shared','vault:write:shared',
    'passkey:read:own','passkey:write:own','passkey:delete:own',
    'team:read','team:write',
    'settings:read:own','settings:write:own',
    'integrations:read','developer:read',
  ],
  contractor: [
    'vault:read:own','vault:read:shared',
    'passkey:read:own','passkey:write:own','passkey:delete:own',
    'settings:read:own',
  ],
  guest: [
    'vault:read:own',   // demo entries only — enforced in useQueries
    'passkey:read:own',
    'settings:read:own',
  ],
};

export function hasPermission(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export function getPermissions(role: UserRole): Permission[] {
  return ROLE_PERMISSIONS[role] ?? [];
}

/* ── JIT (Just-In-Time) access ────────────────────────────────────────── */

export interface JITGrant {
  id: string;
  grantedTo: string;      // principalId
  grantedBy: string;      // principalId of granting admin
  permission: Permission;
  resource?: string;      // optional: specific resource ID
  reason: string;
  expiresAt: number;      // epoch ms
  usedAt?: number;
  revoked?: boolean;
}

const JIT_KEY = 'nexus-jit-grants';

export const jitStorage = {
  getAll(): JITGrant[] {
    try { return JSON.parse(localStorage.getItem(JIT_KEY) ?? '[]'); } catch { return []; }
  },
  save(grants: JITGrant[]): void {
    try { localStorage.setItem(JIT_KEY, JSON.stringify(grants)); } catch {}
  },
  grant(g: Omit<JITGrant, 'id'>): JITGrant {
    const full: JITGrant = { ...g, id: crypto.randomUUID() };
    jitStorage.save([...jitStorage.getAll(), full]);
    return full;
  },
  revoke(id: string): void {
    jitStorage.save(jitStorage.getAll().map(g => g.id === id ? { ...g, revoked: true } : g));
  },
  getActiveFor(principalId: string): JITGrant[] {
    const now = Date.now();
    return jitStorage.getAll().filter(g =>
      g.grantedTo === principalId && !g.revoked && g.expiresAt > now,
    );
  },
  hasJITGrant(principalId: string, permission: Permission, resource?: string): boolean {
    return jitStorage.getActiveFor(principalId).some(g =>
      g.permission === permission &&
      (resource == null || g.resource == null || g.resource === resource),
    );
  },
};

/** Full check: role-based OR JIT grant. */
export function canDo(
  principalId: string,
  role: UserRole,
  permission: Permission,
  resource?: string,
): boolean {
  return hasPermission(role, permission) ||
    jitStorage.hasJITGrant(principalId, permission, resource);
}

export function isOwner(resourceOwnerId: string, requestingPrincipalId: string): boolean {
  return resourceOwnerId === requestingPrincipalId;
}
