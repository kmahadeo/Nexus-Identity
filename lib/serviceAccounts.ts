/**
 * lib/serviceAccounts.ts — Service Accounts & Non-Human Identity management.
 *
 * Manages machine/agent/service identities with API key generation,
 * rotation policies, and audit logging. Enterprise-grade NHI support.
 *
 * Storage: localStorage (`nexus-service-accounts`) + Supabase audit sync.
 */

import { sessionStorage_ } from './storage';
import { logAuditEvent, getAuditLog } from './auditLog';
import { auditDB, type AuditRecord } from './supabaseStorage';
import { getSupabase, isSupabaseConfigured } from './supabase';
import type { Permission } from './permissions';

/** Sync a service account to Supabase (non-blocking) */
async function syncAccountToSupabase(account: ServiceAccount, action: 'upsert' | 'delete'): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const client = getSupabase();
  if (!client) return;

  if (action === 'delete') {
    await client.from('service_accounts').delete().eq('id', account.id);
    return;
  }

  // Upsert the account (without apiKeys — those go in a separate table)
  await client.from('service_accounts').upsert({
    id: account.id,
    name: account.name,
    type: account.type,
    description: account.description,
    owner_id: account.ownerId,
    owner_email: account.ownerEmail,
    status: account.status,
    permissions: account.permissions,
    scopes: account.scopes,
    rotation_policy: account.rotationPolicy,
    last_activity: account.lastActivity ? new Date(account.lastActivity).toISOString() : null,
    expires_at: account.expiresAt ? new Date(account.expiresAt).toISOString() : null,
  }, { onConflict: 'id' });

  // Sync API keys (hashes only, never plaintext)
  for (const key of account.apiKeys) {
    await client.from('service_account_keys').upsert({
      id: key.id,
      account_id: account.id,
      name: key.name,
      key_prefix: key.keyPrefix,
      hashed_key: key.hashedKey,
      expires_at: key.expiresAt ? new Date(key.expiresAt).toISOString() : null,
      last_used_at: key.lastUsedAt ? new Date(key.lastUsedAt).toISOString() : null,
    }, { onConflict: 'id' });
  }
}

/* ── Types ──────────────────────────────────────────────────────────────── */

export interface ServiceApiKey {
  id: string;
  keyPrefix: string;               // first 8 chars shown, rest hidden
  hashedKey: string;               // SHA-256 hex of the full key
  name: string;
  createdAt: number;
  lastUsedAt: number | null;
  expiresAt: number | null;
}

export interface ServiceAccount {
  id: string;
  name: string;                    // "CI/CD Pipeline", "Monitoring Agent"
  type: 'service' | 'agent' | 'machine';
  description: string;
  ownerId: string;                 // human owner's principalId
  ownerEmail: string;
  status: 'active' | 'suspended' | 'expired';
  apiKeys: ServiceApiKey[];
  permissions: Permission[];
  scopes: string[];                // 'vault:read', 'team:read', etc.
  rotationPolicy: number;          // days until key rotation required (30/60/90)
  lastActivity: number | null;
  createdAt: number;
  expiresAt: number | null;        // null = no expiry
}

/* ── Constants ──────────────────────────────────────────────────────────── */

const STORAGE_KEY = 'nexus-service-accounts';

export const SERVICE_SCOPES = [
  'vault:read',
  'vault:write',
  'team:read',
  'team:write',
  'admin:read',
  'admin:write',
  'audit:read',
  'integrations:read',
  'integrations:write',
] as const;

export type ServiceScope = typeof SERVICE_SCOPES[number];

/* ── Helpers ────────────────────────────────────────────────────────────── */

function readAccounts(): ServiceAccount[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as ServiceAccount[];
  } catch {
    return [];
  }
}

function writeAccounts(accounts: ServiceAccount[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(accounts));
  } catch { /* quota */ }
}

/** SHA-256 hash of a string, returned as hex. */
async function sha256Hex(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Generate a crypto-random string of given byte length, hex-encoded. */
function randomHex(bytes: number): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Log to both local audit log and Supabase. */
function logServiceEvent(
  action: string,
  resource: string,
  details: string,
  result: 'success' | 'denied' | 'error' = 'success',
): void {
  // Local audit log
  logAuditEvent({
    action,
    resource,
    resourceType: 'service_account',
    details,
    result,
  });

  // Supabase audit sync (fire-and-forget)
  const session = sessionStorage_.get();
  const record: AuditRecord = {
    action,
    actor_id: session?.principalId ?? 'unknown',
    actor_email: session?.email ?? 'unknown',
    actor_role: session?.role ?? 'unknown',
    resource_id: resource,
    resource_type: 'service_account',
    details,
    ip_address: '127.0.0.1',
    result,
  };
  auditDB.log(record).catch(() => {});
}

/* ── Public API ─────────────────────────────────────────────────────────── */

/**
 * Retrieve all service accounts.
 */
export function getServiceAccounts(): ServiceAccount[] {
  const accounts = readAccounts();
  const now = Date.now();
  // Auto-expire accounts that have passed their expiresAt
  let changed = false;
  for (const acc of accounts) {
    if (acc.status === 'active' && acc.expiresAt && acc.expiresAt < now) {
      acc.status = 'expired';
      changed = true;
    }
  }
  if (changed) writeAccounts(accounts);
  return accounts;
}

/**
 * Get a single service account by ID.
 */
export function getServiceAccount(id: string): ServiceAccount | undefined {
  return getServiceAccounts().find(a => a.id === id);
}

/**
 * Create or update a service account.
 */
export function saveServiceAccount(account: ServiceAccount): void {
  const accounts = readAccounts();
  const idx = accounts.findIndex(a => a.id === account.id);
  if (idx >= 0) {
    accounts[idx] = account;
  } else {
    accounts.push(account);
    logServiceEvent(
      'service_account.created',
      account.id,
      `Service account "${account.name}" (${account.type}) created by ${account.ownerEmail}`,
    );
  }
  writeAccounts(accounts);
  syncAccountToSupabase(account, 'upsert').catch(() => {});
}

/**
 * Delete a service account permanently.
 */
export function deleteServiceAccount(id: string): void {
  const accounts = readAccounts();
  const account = accounts.find(a => a.id === id);
  if (account) {
    logServiceEvent(
      'service_account.deleted',
      id,
      `Service account "${account.name}" deleted`,
    );
  }
  writeAccounts(accounts.filter(a => a.id !== id));
  if (account) syncAccountToSupabase(account, 'delete').catch(() => {});
}

/**
 * Suspend a service account.
 */
export function suspendServiceAccount(id: string): void {
  const accounts = readAccounts();
  const account = accounts.find(a => a.id === id);
  if (account) {
    account.status = 'suspended';
    writeAccounts(accounts);
    syncAccountToSupabase(account, 'upsert').catch(() => {});
    logServiceEvent(
      'service_account.suspended',
      id,
      `Service account "${account.name}" suspended`,
    );
  }
}

/**
 * Reactivate a suspended/expired service account.
 */
export function activateServiceAccount(id: string): void {
  const accounts = readAccounts();
  const account = accounts.find(a => a.id === id);
  if (account) {
    account.status = 'active';
    writeAccounts(accounts);
    syncAccountToSupabase(account, 'upsert').catch(() => {});
    logServiceEvent(
      'service_account.activated',
      id,
      `Service account "${account.name}" reactivated`,
    );
  }
}

/**
 * Generate a new API key for a service account.
 * Returns the plaintext key — it will NOT be stored or retrievable after this call.
 */
export async function generateApiKey(
  accountId: string,
  keyName: string,
  expiresAt: number | null = null,
): Promise<{ plaintext: string; key: ServiceApiKey } | null> {
  const accounts = readAccounts();
  const account = accounts.find(a => a.id === accountId);
  if (!account) return null;

  const rawKey = `nxs_sa_${randomHex(16)}`;   // 32 hex chars = 16 bytes
  const hashedKey = await sha256Hex(rawKey);

  const apiKey: ServiceApiKey = {
    id: crypto.randomUUID(),
    keyPrefix: rawKey.slice(0, 8),
    hashedKey,
    name: keyName,
    createdAt: Date.now(),
    lastUsedAt: null,
    expiresAt,
  };

  account.apiKeys.push(apiKey);
  writeAccounts(accounts);
  syncAccountToSupabase(account, 'upsert').catch(() => {});

  logServiceEvent(
    'service_account.key.generated',
    accountId,
    `API key "${keyName}" (prefix: ${apiKey.keyPrefix}...) generated for "${account.name}"`,
  );

  return { plaintext: rawKey, key: apiKey };
}

/**
 * Validate an API key. Returns the matching service account if valid.
 */
export async function validateApiKey(key: string): Promise<ServiceAccount | null> {
  const hash = await sha256Hex(key);
  const now = Date.now();

  const accounts = readAccounts();
  for (const account of accounts) {
    if (account.status !== 'active') continue;
    for (const apiKey of account.apiKeys) {
      if (apiKey.hashedKey === hash) {
        // Check key expiry
        if (apiKey.expiresAt && apiKey.expiresAt < now) continue;
        // Update last used
        apiKey.lastUsedAt = now;
        account.lastActivity = now;
        writeAccounts(accounts);
        return account;
      }
    }
  }
  return null;
}

/**
 * Revoke (remove) a specific API key from a service account.
 */
export function revokeApiKey(accountId: string, keyId: string): boolean {
  const accounts = readAccounts();
  const account = accounts.find(a => a.id === accountId);
  if (!account) return false;

  const keyIdx = account.apiKeys.findIndex(k => k.id === keyId);
  if (keyIdx < 0) return false;

  const key = account.apiKeys[keyIdx];
  account.apiKeys.splice(keyIdx, 1);
  writeAccounts(accounts);
  syncAccountToSupabase(account, 'upsert').catch(() => {});

  // Also delete the key from Supabase
  if (isSupabaseConfigured()) {
    const client = getSupabase();
    if (client) client.from('service_account_keys').delete().eq('id', keyId);
  }

  logServiceEvent(
    'service_account.key.revoked',
    accountId,
    `API key "${key.name}" (prefix: ${key.keyPrefix}...) revoked from "${account.name}"`,
  );

  return true;
}

/**
 * Get audit events for a specific service account.
 */
export function getAccountActivity(accountId: string): ReturnType<typeof getAuditLog> {
  return getAuditLog({ action: 'service_account' }).filter(
    e => e.resource === accountId,
  );
}

/**
 * Check which accounts have API keys overdue for rotation.
 * Returns accounts where any key is older than the account's rotationPolicy.
 */
export function checkKeyRotation(): { account: ServiceAccount; overdueKeys: ServiceApiKey[] }[] {
  const now = Date.now();
  const results: { account: ServiceAccount; overdueKeys: ServiceApiKey[] }[] = [];

  for (const account of getServiceAccounts()) {
    if (account.status !== 'active') continue;
    const rotationMs = account.rotationPolicy * 24 * 60 * 60 * 1000;
    const overdueKeys = account.apiKeys.filter(k => (now - k.createdAt) > rotationMs);
    if (overdueKeys.length > 0) {
      results.push({ account, overdueKeys });
    }
  }

  return results;
}
