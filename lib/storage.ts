/**
 * lib/storage.ts — Persistent key-value helpers backed by localStorage.
 * All user-facing data is scoped by principalId to prevent cross-user data access.
 */

import type { VaultEntry } from '../backend';

/* ── Generic helpers ─────────────────────────────────────────────────────── */

function ls<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw != null ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function lsSet(key: string, value: unknown): void {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* quota */ }
}

/* ── Session / Role ──────────────────────────────────────────────────────── */

export type UserRole = 'admin' | 'individual' | 'team' | 'contractor' | 'guest';

export interface SessionData {
  principalId: string;
  name: string;
  email: string;
  role: UserRole;
  tier: 'individual' | 'smb' | 'enterprise';
  loginAt: number;
}

export const sessionStorage_ = {
  get(): SessionData | null {
    return ls<SessionData | null>('nexus-session', null);
  },
  set(s: SessionData): void {
    lsSet('nexus-session', s);
  },
  clear(): void {
    localStorage.removeItem('nexus-session');
  },
};

/* ── User Registry (admin-visible, persists all accounts) ─────────────── */

export interface RegisteredUser {
  principalId: string;
  name: string;
  email: string;
  role: UserRole;
  tier: string;
  firstLoginAt: number;
  lastLoginAt: number;
  isActive: boolean;
  mfaEnabled: boolean;
  passkeysCount: number;
  vaultCount: number;
}

const REGISTRY_KEY = 'nexus-user-registry';

export const userRegistry = {
  getAll(): RegisteredUser[] {
    return ls<RegisteredUser[]>(REGISTRY_KEY, []);
  },
  upsert(session: SessionData): void {
    const all = userRegistry.getAll();
    const existing = all.find(u => u.principalId === session.principalId);
    const passkeysCount = (() => {
      try { return JSON.parse(localStorage.getItem(`nexus-passkeys-${session.principalId}`) ?? '[]').length; } catch { return 0; }
    })();
    const vaultCount = (() => {
      try { return JSON.parse(localStorage.getItem(`nexus-vault-${session.principalId}`) ?? '[]').length; } catch { return 0; }
    })();
    if (existing) {
      lsSet(REGISTRY_KEY, all.map(u =>
        u.principalId === session.principalId
          ? { ...u, name: session.name, email: session.email, role: session.role, tier: session.tier, lastLoginAt: session.loginAt, isActive: true, passkeysCount, vaultCount }
          : u,
      ));
    } else {
      lsSet(REGISTRY_KEY, [...all, {
        principalId: session.principalId,
        name: session.name,
        email: session.email,
        role: session.role,
        tier: session.tier,
        firstLoginAt: session.loginAt,
        lastLoginAt: session.loginAt,
        isActive: true,
        mfaEnabled: passkeysCount > 0,
        passkeysCount,
        vaultCount,
      }]);
    }
  },
  updateUser(principalId: string, updates: Partial<RegisteredUser>): void {
    lsSet(REGISTRY_KEY, userRegistry.getAll().map(u =>
      u.principalId === principalId ? { ...u, ...updates } : u,
    ));
  },
  deactivate(principalId: string): void {
    userRegistry.updateUser(principalId, { isActive: false });
  },
};

/* ── Settings ─────────────────────────────────────────────────────────────── */

export interface AIProviderConfig {
  provider: 'anthropic' | 'openai' | 'gemini' | 'custom';
  apiKey: string;
  model: string;
  enabled: boolean;
  baseUrl?: string;
}

export interface AppSettings {
  notifications: {
    security: boolean;
    account: boolean;
    aiInsights: boolean;
    billing: boolean;
    email: boolean;
    push: boolean;
  };
  security: {
    twoFactor: boolean;
    biometric: boolean;
    autoLock: boolean;
    sessionTimeoutMinutes: number;
    requirePasswordOnView: boolean;
  };
  ai: {
    anthropicApiKey: string;
    model: string;
    enabled: boolean;
    activeProvider: 'anthropic' | 'openai' | 'gemini' | 'custom';
    providers: AIProviderConfig[];
  };
  vault: {
    masterPasswordHash: string;
    saltHex: string;
    isLocked: boolean;
  };
}

const DEFAULT_AI_PROVIDERS: AIProviderConfig[] = [
  { provider: 'anthropic', apiKey: '', model: 'claude-haiku-4-5-20251001', enabled: false },
  { provider: 'openai',    apiKey: '', model: 'gpt-4o-mini',               enabled: false },
  { provider: 'gemini',    apiKey: '', model: 'gemini-1.5-flash',          enabled: false },
  { provider: 'custom',    apiKey: '', model: '',                           enabled: false, baseUrl: '' },
];

const DEFAULT_SETTINGS: AppSettings = {
  notifications: { security: true, account: true, aiInsights: true, billing: false, email: true, push: true },
  security: { twoFactor: true, biometric: true, autoLock: true, sessionTimeoutMinutes: 30, requirePasswordOnView: false },
  ai: {
    anthropicApiKey: '',
    model: 'claude-haiku-4-5-20251001',
    enabled: true,
    activeProvider: 'anthropic',
    providers: DEFAULT_AI_PROVIDERS,
  },
  vault: { masterPasswordHash: '', saltHex: '', isLocked: true },
};

export const settings = {
  get(): AppSettings {
    const stored = ls<AppSettings>('nexus-settings', DEFAULT_SETTINGS);
    // Ensure providers array is always populated (migration for old data)
    if (!stored.ai.providers || stored.ai.providers.length === 0) {
      stored.ai.providers = DEFAULT_AI_PROVIDERS;
      stored.ai.activeProvider = stored.ai.activeProvider ?? 'anthropic';
    }
    return stored;
  },
  set(s: AppSettings): void {
    lsSet('nexus-settings', s);
  },
  patch(partial: Partial<AppSettings>): void {
    settings.set({ ...settings.get(), ...partial });
  },
  getAiKey(): string {
    const s = settings.get();
    const active = s.ai.providers?.find(p => p.provider === s.ai.activeProvider);
    return active?.apiKey || s.ai.anthropicApiKey || '';
  },
  getActiveProvider(): AIProviderConfig | null {
    const s = settings.get();
    return s.ai.providers?.find(p => p.provider === s.ai.activeProvider) ?? null;
  },
};

/* ── Vault Entries (user-scoped) ──────────────────────────────────────────── */

function vaultKey(principalId?: string): string {
  const id = principalId ?? sessionStorage_.get()?.principalId;
  const role = sessionStorage_.get()?.role;
  if (!id || role === 'guest') return 'nexus-vault-demo';
  return `nexus-vault-${id}`;
}

export const vaultStorage = {
  getRaw(principalId?: string): VaultEntry[] {
    return ls<VaultEntry[]>(vaultKey(principalId), []);
  },
  save(entries: VaultEntry[], principalId?: string): void {
    lsSet(vaultKey(principalId), entries);
    // Update registry count
    const session = sessionStorage_.get();
    if (session) {
      userRegistry.updateUser(session.principalId, { vaultCount: entries.length });
    }
  },
  add(entry: VaultEntry, principalId?: string): void {
    vaultStorage.save([...vaultStorage.getRaw(principalId), entry], principalId);
  },
  delete(id: string, principalId?: string): void {
    vaultStorage.save(vaultStorage.getRaw(principalId).filter(e => e.id !== id), principalId);
  },
  update(entry: VaultEntry, principalId?: string): void {
    vaultStorage.save(vaultStorage.getRaw(principalId).map(e => e.id === entry.id ? entry : e), principalId);
  },
  /** Admin-only: get all entries across all users */
  getAllUsers(): { user: RegisteredUser; entries: VaultEntry[] }[] {
    return userRegistry.getAll().map(u => ({
      user: u,
      entries: ls<VaultEntry[]>(`nexus-vault-${u.principalId}`, []),
    }));
  },
};

/* ── Security Policies ────────────────────────────────────────────────────── */

export interface SecurityPolicy {
  id: string;
  name: string;
  description: string;
  type: 'password' | 'mfa' | 'session' | 'vault' | 'access' | 'compliance';
  severity: 'low' | 'medium' | 'high' | 'critical';
  enabled: boolean;
  enforcement: 'advisory' | 'warn' | 'block';
  config: Record<string, string | number | boolean>;
  createdAt: number;
  createdBy: string;
  lastModified: number;
}

const DEFAULT_POLICIES: SecurityPolicy[] = [
  { id: 'pol-1', name: 'Password Complexity', description: 'Minimum 12 characters with uppercase, lowercase, number, and symbol', type: 'password', severity: 'high', enabled: true, enforcement: 'warn', config: { minLength: 12, requireUpper: true, requireLower: true, requireNumber: true, requireSymbol: true }, createdAt: Date.now(), createdBy: 'system', lastModified: Date.now() },
  { id: 'pol-2', name: 'MFA Enforcement', description: 'All accounts must have multi-factor authentication enabled', type: 'mfa', severity: 'critical', enabled: true, enforcement: 'block', config: { graceperiodDays: 7, allowedMethods: 'passkey,totp,sms' }, createdAt: Date.now(), createdBy: 'system', lastModified: Date.now() },
  { id: 'pol-3', name: 'Session Timeout', description: 'Inactive sessions auto-lock after configured interval', type: 'session', severity: 'medium', enabled: true, enforcement: 'block', config: { timeoutMinutes: 30, warnBeforeMinutes: 5 }, createdAt: Date.now(), createdBy: 'system', lastModified: Date.now() },
  { id: 'pol-4', name: 'Credential Rotation', description: 'Passwords and API keys must be rotated every 90 days', type: 'vault', severity: 'high', enabled: true, enforcement: 'warn', config: { rotationDays: 90, apiKeyRotationDays: 90 }, createdAt: Date.now(), createdBy: 'system', lastModified: Date.now() },
  { id: 'pol-5', name: 'Passkey-First Authentication', description: 'Encourage passwordless authentication via FIDO2 passkeys', type: 'access', severity: 'medium', enabled: true, enforcement: 'advisory', config: { nudgeOnPasswordLogin: true, blockPasswordAfterPasskeyDays: 0 }, createdAt: Date.now(), createdBy: 'system', lastModified: Date.now() },
  { id: 'pol-6', name: 'Vault Encryption at Rest', description: 'All vault entries must be encrypted with AES-256-GCM', type: 'vault', severity: 'critical', enabled: true, enforcement: 'block', config: { algorithm: 'AES-256-GCM', kdf: 'PBKDF2', iterations: 310000 }, createdAt: Date.now(), createdBy: 'system', lastModified: Date.now() },
];

const POLICIES_KEY = 'nexus-policies';

export const policyStorage = {
  getAll(): SecurityPolicy[] {
    const stored = ls<SecurityPolicy[]>(POLICIES_KEY, []);
    if (stored.length === 0) {
      policyStorage.save(DEFAULT_POLICIES);
      return DEFAULT_POLICIES;
    }
    return stored;
  },
  save(policies: SecurityPolicy[]): void {
    lsSet(POLICIES_KEY, policies);
  },
  add(policy: SecurityPolicy): void {
    policyStorage.save([...policyStorage.getAll(), policy]);
  },
  update(policy: SecurityPolicy): void {
    policyStorage.save(policyStorage.getAll().map(p => p.id === policy.id ? policy : p));
  },
  delete(id: string): void {
    policyStorage.save(policyStorage.getAll().filter(p => p.id !== id));
  },
  toggle(id: string): void {
    policyStorage.save(policyStorage.getAll().map(p => p.id === id ? { ...p, enabled: !p.enabled, lastModified: Date.now() } : p));
  },
};

/* ── Connector / Integration Config ───────────────────────────────────────── */

export type ConnectorId = 'entra_id' | 'okta' | 'active_directory' | 'google_workspace' | 'ping_identity' | 'auth0' | 'cisco_duo' | 'hypr';

export interface ConnectorConfig {
  id: ConnectorId;
  name: string;
  enabled: boolean;
  config: {
    tenantId?: string;
    clientId?: string;
    clientSecret?: string;
    domain?: string;
    apiKey?: string;
    baseUrl?: string;
    ldapServer?: string;
    ldapPort?: string;
    baseDn?: string;
  };
  status: 'connected' | 'disconnected' | 'error' | 'pending';
  lastSync?: number;
  connectedAt?: number;
  syncedUsers?: number;
}

const CONNECTORS_KEY = 'nexus-connectors';

export const connectorStorage = {
  getAll(): ConnectorConfig[] {
    return ls<ConnectorConfig[]>(CONNECTORS_KEY, []);
  },
  get(id: ConnectorId): ConnectorConfig | undefined {
    return connectorStorage.getAll().find(c => c.id === id);
  },
  save(connectors: ConnectorConfig[]): void {
    lsSet(CONNECTORS_KEY, connectors);
  },
  upsert(config: ConnectorConfig): void {
    const all = connectorStorage.getAll();
    const existing = all.find(c => c.id === config.id);
    if (existing) {
      connectorStorage.save(all.map(c => c.id === config.id ? config : c));
    } else {
      connectorStorage.save([...all, config]);
    }
  },
  updateStatus(id: ConnectorId, status: ConnectorConfig['status'], extra?: Partial<ConnectorConfig>): void {
    const all = connectorStorage.getAll();
    connectorStorage.save(all.map(c => c.id === id ? { ...c, status, ...extra } : c));
  },
};

/* ── Notification log ────────────────────────────────────────────────────── */

export interface NotificationItem {
  id: string;
  title: string;
  body: string;
  type: 'security' | 'info' | 'warning' | 'success';
  read: boolean;
  createdAt: number;
}

export const notificationStorage = {
  getAll(): NotificationItem[] {
    return ls<NotificationItem[]>('nexus-notifications', []);
  },
  add(n: Omit<NotificationItem, 'id' | 'read' | 'createdAt'>): void {
    const all = notificationStorage.getAll();
    all.unshift({ ...n, id: crypto.randomUUID(), read: false, createdAt: Date.now() });
    lsSet('nexus-notifications', all.slice(0, 100));
  },
  markRead(id: string): void {
    lsSet('nexus-notifications', notificationStorage.getAll().map(n => n.id === id ? { ...n, read: true } : n));
  },
  markAllRead(): void {
    lsSet('nexus-notifications', notificationStorage.getAll().map(n => ({ ...n, read: true })));
  },
};
