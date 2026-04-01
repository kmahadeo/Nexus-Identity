/**
 * lib/permissions.ts — Role-Based Access Control (RBAC) + Just-In-Time (JIT) access.
 *
 * Modelled on NIST SP 800-162 (RBAC) and CISA Zero Trust guidelines.
 * Every resource operation must call canDo() before executing.
 */

import type { UserRole, SecurityPolicy } from './storage';
import { policyStorage, sessionStorage_, vaultStorage } from './storage';

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

/* ── Policy Enforcement Engine ──────────────────────────────────────────── */

export interface PolicyResult {
  allowed: boolean;
  reason?: string;
  enforcement: 'block' | 'warn' | 'advisory';
}

export type PolicyAction =
  | 'vault.entry.add'
  | 'vault.entry.view_secret'
  | 'vault.entry.delete'
  | 'vault.access'
  | 'session.validate'
  | 'admin.action';

export interface PolicyContext {
  /** The password/secret value being stored (for password-policy checks). */
  password?: string;
  /** Category of the vault entry being stored. */
  category?: string;
  /** Whether the current user has MFA / passkey enrolled. */
  hasMFA?: boolean;
  /** Number of passkeys the user has registered. */
  passkeyCount?: number;
  /** Epoch ms when the current session started. */
  sessionLoginAt?: number;
  /** User role. */
  role?: UserRole;
  /** User tier ('individual' | 'smb' | 'enterprise'). */
  tier?: string;
  /** Current vault entry count for the user. */
  vaultEntryCount?: number;
}

/**
 * Evaluate every enabled policy that is relevant to `action` and return the
 * strictest result.  If no relevant policy is found the action is allowed.
 */
export function enforcePolicy(
  action: PolicyAction,
  ctx: PolicyContext,
): PolicyResult {
  const policies = policyStorage.getAll().filter(p => p.enabled);
  const session = sessionStorage_.get();

  // Collect all violations; the strictest one wins.
  const violations: PolicyResult[] = [];

  for (const policy of policies) {
    const result = evaluatePolicy(policy, action, ctx, session);
    if (result && !result.allowed) {
      violations.push(result);
    }
  }

  if (violations.length === 0) {
    return { allowed: true, enforcement: 'advisory' };
  }

  // Sort: block > warn > advisory.
  const priority: Record<string, number> = { block: 3, warn: 2, advisory: 1 };
  violations.sort((a, b) => (priority[b.enforcement] ?? 0) - (priority[a.enforcement] ?? 0));

  return violations[0];
}

function evaluatePolicy(
  policy: SecurityPolicy,
  action: PolicyAction,
  ctx: PolicyContext,
  session: ReturnType<typeof sessionStorage_.get>,
): PolicyResult | null {
  switch (policy.type) {
    /* ── Password policy ─────────────────────────────────────────────── */
    case 'password': {
      if (action !== 'vault.entry.add') return null;
      if (ctx.category !== 'password') return null;
      const pw = ctx.password ?? '';
      const minLen = Number(policy.config.minLength ?? 12);
      const reasons: string[] = [];
      if (pw.length < minLen) reasons.push(`Password must be at least ${minLen} characters`);
      if (policy.config.requireUpper && !/[A-Z]/.test(pw)) reasons.push('Must contain an uppercase letter');
      if (policy.config.requireLower && !/[a-z]/.test(pw)) reasons.push('Must contain a lowercase letter');
      if (policy.config.requireNumber && !/[0-9]/.test(pw)) reasons.push('Must contain a number');
      if (policy.config.requireSymbol && !/[^A-Za-z0-9]/.test(pw)) reasons.push('Must contain a special character');
      if (reasons.length === 0) return null;
      return {
        allowed: policy.enforcement === 'advisory',
        reason: reasons.join('. '),
        enforcement: policy.enforcement,
      };
    }

    /* ── MFA policy ──────────────────────────────────────────────────── */
    case 'mfa': {
      if (action !== 'vault.entry.view_secret' && action !== 'vault.access') return null;
      const hasMFA = ctx.hasMFA ?? (ctx.passkeyCount != null && ctx.passkeyCount > 0);
      if (hasMFA) return null;
      return {
        allowed: policy.enforcement === 'advisory',
        reason: 'MFA enrollment is required to access vault secrets. Register a passkey first.',
        enforcement: policy.enforcement,
      };
    }

    /* ── Session policy ──────────────────────────────────────────────── */
    case 'session': {
      if (action !== 'session.validate' && action !== 'vault.access') return null;
      const loginAt = ctx.sessionLoginAt ?? session?.loginAt;
      if (!loginAt) return null;
      const maxMinutes = Number(policy.config.timeoutMinutes ?? 30);
      const elapsed = (Date.now() - loginAt) / 60_000;
      if (elapsed <= maxMinutes) return null;
      return {
        allowed: false,
        reason: `Session expired (${maxMinutes}-minute limit). Please re-authenticate.`,
        enforcement: policy.enforcement,
      };
    }

    /* ── Vault policy (entry limits per tier) ────────────────────────── */
    case 'vault': {
      if (action !== 'vault.entry.add') return null;
      const tier = ctx.tier ?? session?.tier ?? 'individual';
      const count = ctx.vaultEntryCount ?? vaultStorage.getRaw().length;
      const limits: Record<string, number> = { individual: 50, smb: 200, enterprise: 10000 };
      const limit = limits[tier] ?? 50;
      if (count < limit) return null;
      return {
        allowed: false,
        reason: `Vault entry limit reached for your tier (${tier}: ${limit} entries). Upgrade to add more.`,
        enforcement: policy.enforcement,
      };
    }

    /* ── Access policy (role-based operation check) ──────────────────── */
    case 'access': {
      const role = ctx.role ?? session?.role;
      if (!role) return null;
      // Guest and contractor cannot do admin actions
      if (action === 'admin.action' && (role === 'guest' || role === 'contractor')) {
        return {
          allowed: false,
          reason: `Your role (${role}) does not have permission for this operation.`,
          enforcement: policy.enforcement,
        };
      }
      // Guest cannot add vault entries
      if (action === 'vault.entry.add' && role === 'guest') {
        return {
          allowed: false,
          reason: 'Guest accounts cannot add vault entries. Please sign up for a full account.',
          enforcement: policy.enforcement,
        };
      }
      return null;
    }

    /* ── Conditional access policy ─────────────────────────────────────── */
    case 'conditional_access' as string: {
      // Conditional access policies are evaluated via evaluateConditionalAccess()
      // They don't go through the standard evaluatePolicy path
      return null;
    }

    default:
      return null;
  }
}

/* ── Conditional Access Evaluation ────────────────────────────────────── */

export interface ConditionalAccessContext {
  /** Does the user have registered passkeys (known device)? */
  hasPasskeys: boolean;
  /** Number of passkeys registered */
  passkeyCount: number;
  /** Does the user have TOTP set up? */
  hasTOTP: boolean;
  /** Epoch ms when the current session started */
  sessionLoginAt: number;
  /** User role */
  role: UserRole;
  /** What action is being attempted */
  action: 'vault_access' | 'admin_access' | 'credential_export';
  /** Is break-glass mode active? */
  breakGlassActive?: boolean;
}

export interface ConditionalAccessResult {
  access: 'allow' | 'mfa_required' | 'block';
  reason: string;
}

/** Stored conditional access rule configurable by admins */
export interface ConditionalAccessRule {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  condition: 'vault_mfa_timeout' | 'admin_hardware_key' | 'export_reauth';
  /** Threshold in minutes for time-based rules */
  thresholdMinutes?: number;
  createdAt: number;
}

const CA_RULES_KEY = 'nexus-conditional-access-rules';

export const conditionalAccessStorage = {
  getAll(): ConditionalAccessRule[] {
    try { return JSON.parse(localStorage.getItem(CA_RULES_KEY) ?? '[]'); } catch { return []; }
  },
  save(rules: ConditionalAccessRule[]): void {
    try { localStorage.setItem(CA_RULES_KEY, JSON.stringify(rules)); } catch {}
  },
  add(rule: ConditionalAccessRule): void {
    conditionalAccessStorage.save([...conditionalAccessStorage.getAll(), rule]);
  },
  toggle(id: string): void {
    conditionalAccessStorage.save(
      conditionalAccessStorage.getAll().map(r => r.id === id ? { ...r, enabled: !r.enabled } : r),
    );
  },
  remove(id: string): void {
    conditionalAccessStorage.save(conditionalAccessStorage.getAll().filter(r => r.id !== id));
  },
  /** Seed defaults if empty */
  ensureDefaults(): ConditionalAccessRule[] {
    const existing = conditionalAccessStorage.getAll();
    if (existing.length > 0) return existing;
    const defaults: ConditionalAccessRule[] = [
      { id: 'ca-1', name: 'Require MFA for vault access after 30 minutes', description: 'Users must re-authenticate with MFA if their session is older than 30 minutes when accessing the vault', enabled: true, condition: 'vault_mfa_timeout', thresholdMinutes: 30, createdAt: Date.now() },
      { id: 'ca-2', name: 'Block admin operations without hardware key', description: 'Admin-level operations require a registered hardware security key (passkey)', enabled: true, condition: 'admin_hardware_key', createdAt: Date.now() },
      { id: 'ca-3', name: 'Require re-authentication for credential export', description: 'Exporting credentials from the vault requires a fresh authentication', enabled: false, condition: 'export_reauth', thresholdMinutes: 5, createdAt: Date.now() },
    ];
    conditionalAccessStorage.save(defaults);
    return defaults;
  },
};

/**
 * Evaluate conditional access policies against the current context.
 * Break-glass mode bypasses all checks.
 */
export function evaluateConditionalAccess(ctx: ConditionalAccessContext): ConditionalAccessResult {
  // Break-glass bypasses all conditional access
  if (ctx.breakGlassActive) {
    return { access: 'allow', reason: 'Break-glass emergency access active — conditional access bypassed' };
  }

  const rules = conditionalAccessStorage.getAll().filter(r => r.enabled);
  const sessionAgeMinutes = (Date.now() - ctx.sessionLoginAt) / 60_000;
  const hasMFA = ctx.hasPasskeys || ctx.hasTOTP;

  for (const rule of rules) {
    switch (rule.condition) {
      case 'vault_mfa_timeout': {
        if (ctx.action !== 'vault_access') break;
        const threshold = rule.thresholdMinutes ?? 30;
        if (sessionAgeMinutes > threshold && !hasMFA) {
          return {
            access: 'mfa_required',
            reason: `Session is ${Math.round(sessionAgeMinutes)} minutes old. MFA re-authentication required after ${threshold} minutes for vault access.`,
          };
        }
        break;
      }
      case 'admin_hardware_key': {
        if (ctx.action !== 'admin_access') break;
        if (ctx.role === 'admin' && ctx.passkeyCount === 0) {
          return {
            access: 'block',
            reason: 'Admin operations require a registered hardware security key. Please register a passkey first.',
          };
        }
        break;
      }
      case 'export_reauth': {
        if (ctx.action !== 'credential_export') break;
        const threshold = rule.thresholdMinutes ?? 5;
        if (sessionAgeMinutes > threshold) {
          return {
            access: 'mfa_required',
            reason: `Credential export requires re-authentication. Session is ${Math.round(sessionAgeMinutes)} minutes old (limit: ${threshold} minutes).`,
          };
        }
        break;
      }
    }
  }

  return { access: 'allow', reason: 'All conditional access policies passed' };
}

/* ── Break-Glass Emergency Access ─────────────────────────────────────── */

export interface BreakGlassState {
  active: boolean;
  activatedBy: string;       // principalId
  activatedByName: string;
  reason: string;
  activatedAt: number;       // epoch ms
  expiresAt: number;         // epoch ms (1 hour from activation)
}

export interface BreakGlassLog {
  activatedAt: number;
  activatedBy: string;
}

const BREAK_GLASS_KEY = 'nexus-break-glass';
const BREAK_GLASS_LOG_KEY = 'nexus-break-glass-log';

export const breakGlassStorage = {
  get(): BreakGlassState | null {
    try {
      const raw = localStorage.getItem(BREAK_GLASS_KEY);
      if (!raw) return null;
      const state: BreakGlassState = JSON.parse(raw);
      // Auto-expire
      if (state.active && Date.now() > state.expiresAt) {
        breakGlassStorage.deactivate();
        return null;
      }
      return state.active ? state : null;
    } catch { return null; }
  },
  activate(principalId: string, name: string, reason: string): { success: boolean; error?: string } {
    // Check rate limit: max 3 activations per 24 hours
    const logs = breakGlassStorage.getLogs();
    const last24h = logs.filter(l => Date.now() - l.activatedAt < 24 * 60 * 60 * 1000);
    if (last24h.length >= 3) {
      return { success: false, error: 'Break-glass access has been used 3 times in the last 24 hours. Please wait before trying again.' };
    }

    const now = Date.now();
    const state: BreakGlassState = {
      active: true,
      activatedBy: principalId,
      activatedByName: name,
      reason,
      activatedAt: now,
      expiresAt: now + 60 * 60 * 1000, // 1 hour
    };
    try {
      localStorage.setItem(BREAK_GLASS_KEY, JSON.stringify(state));
      // Log activation
      logs.push({ activatedAt: now, activatedBy: principalId });
      localStorage.setItem(BREAK_GLASS_LOG_KEY, JSON.stringify(logs));
    } catch {}
    return { success: true };
  },
  deactivate(): void {
    try { localStorage.removeItem(BREAK_GLASS_KEY); } catch {}
  },
  getLogs(): BreakGlassLog[] {
    try { return JSON.parse(localStorage.getItem(BREAK_GLASS_LOG_KEY) ?? '[]'); } catch { return []; }
  },
  isActive(): boolean {
    return breakGlassStorage.get() !== null;
  },
  getUsageCount24h(): number {
    const logs = breakGlassStorage.getLogs();
    return logs.filter(l => Date.now() - l.activatedAt < 24 * 60 * 60 * 1000).length;
  },
};

/* ── Active Session Management ────────────────────────────────────────── */

export interface ActiveSession {
  id: string;
  principalId: string;
  name: string;
  email: string;
  device: string;
  loginAt: number;
  lastActive: number;
  ipAddress: string;
}

const ACTIVE_SESSIONS_KEY = 'nexus-active-sessions';

export const activeSessionStorage = {
  getAll(): ActiveSession[] {
    try { return JSON.parse(localStorage.getItem(ACTIVE_SESSIONS_KEY) ?? '[]'); } catch { return []; }
  },
  save(sessions: ActiveSession[]): void {
    try { localStorage.setItem(ACTIVE_SESSIONS_KEY, JSON.stringify(sessions)); } catch {}
  },
  add(session: ActiveSession): void {
    const all = activeSessionStorage.getAll().filter(s => s.principalId !== session.principalId);
    all.push(session);
    activeSessionStorage.save(all);
  },
  remove(principalId: string): void {
    activeSessionStorage.save(activeSessionStorage.getAll().filter(s => s.principalId !== principalId));
  },
  removeById(id: string): void {
    activeSessionStorage.save(activeSessionStorage.getAll().filter(s => s.id !== id));
  },
  updateLastActive(principalId: string): void {
    activeSessionStorage.save(
      activeSessionStorage.getAll().map(s =>
        s.principalId === principalId ? { ...s, lastActive: Date.now() } : s,
      ),
    );
  },
};
