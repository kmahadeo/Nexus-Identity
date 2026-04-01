/**
 * lib/directorySync.ts — Core directory sync engine for SCIM 2.0 integration.
 *
 * Manages directory connections (Entra ID, Okta, Duo, Workday, Google Workspace,
 * Custom SCIM), bidirectional sync simulation, JIT provisioning, attribute
 * mapping, and SIEM event forwarding (Sentinel, Splunk, custom webhook).
 *
 * All data is persisted in localStorage.
 */

import { userRegistry, type RegisteredUser } from './storage';
import { logAuditEvent, type AuditEvent } from './auditLog';
import { logLog } from './logger';

/* ── Types ─────────────────────────────────────────────────────────────── */

export type DirectoryProvider =
  | 'entra_id'
  | 'okta'
  | 'duo'
  | 'workday'
  | 'google_workspace'
  | 'custom_scim';

export interface AttributeMapping {
  source: string;       // SCIM / provider field
  target: string;       // Nexus field
  direction: 'in' | 'out' | 'both';
}

export interface DirectoryConnection {
  id: string;
  name: string;
  provider: DirectoryProvider;
  status: 'connected' | 'disconnected' | 'syncing' | 'error';
  config: {
    tenantUrl: string;
    clientId?: string;
    hasSecret: boolean;
    scopes?: string[];
    syncInterval: number;         // minutes
    syncDirection: 'inbound' | 'outbound' | 'bidirectional';
    attributeMapping: AttributeMapping[];
    lastSyncAt: number | null;
    lastSyncResult: 'success' | 'partial' | 'error' | null;
    lastSyncCount: number;
    totalUsers: number;
    totalGroups: number;
  };
  createdAt: number;
}

export interface SyncEvent {
  id: string;
  connectionId: string;
  timestamp: number;
  action: 'create' | 'update' | 'deactivate' | 'reactivate' | 'group_assign' | 'group_remove';
  userName: string;
  userEmail: string;
  details: string;
  result: 'success' | 'error' | 'skipped';
}

export type SIEMType = 'sentinel' | 'splunk' | 'custom';

export interface SIEMConnection {
  id: string;
  name: string;
  type: SIEMType;
  endpointUrl: string;
  authHeader?: string;
  hasAuthToken: boolean;
  enabled: boolean;
  lastForwardedAt: number | null;
  eventsForwarded: number;
  createdAt: number;
}

export interface SCIMProviderConfig {
  displayName: string;
  baseUrlHint: string;
  authMethods: string[];
  scimVersion: string;
  capabilities: string[];
  endpoints: { path: string; description: string }[];
}

/* ── Storage Keys ──────────────────────────────────────────────────────── */

const CONNECTIONS_KEY = 'nexus-directory-connections';
const SYNC_HISTORY_KEY = 'nexus-sync-history';
const SIEM_KEY = 'nexus-siem-connections';
const MAX_SYNC_EVENTS = 500;

/* ── Helpers ───────────────────────────────────────────────────────────── */

function ls<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw != null ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function lsSet(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch { /* quota */ }
}

/* ── Directory Connection CRUD ─────────────────────────────────────────── */

export function getConnections(): DirectoryConnection[] {
  return ls<DirectoryConnection[]>(CONNECTIONS_KEY, []);
}

export function getConnection(id: string): DirectoryConnection | undefined {
  return getConnections().find(c => c.id === id);
}

export function saveConnection(connection: DirectoryConnection): void {
  const all = getConnections();
  const idx = all.findIndex(c => c.id === connection.id);
  if (idx >= 0) {
    all[idx] = connection;
  } else {
    all.push(connection);
  }
  lsSet(CONNECTIONS_KEY, all);
  // Sync to Supabase
  syncDirectoryToSupabase('save', connection);
}

export function deleteConnection(id: string): void {
  lsSet(CONNECTIONS_KEY, getConnections().filter(c => c.id !== id));
  lsSet(SYNC_HISTORY_KEY, getSyncHistory().filter(e => e.connectionId !== id));
  syncDirectoryToSupabase('delete', { id } as DirectoryConnection);
}

async function syncDirectoryToSupabase(action: string, conn: DirectoryConnection) {
  try {
    const { getSupabase, isSupabaseConfigured } = await import('./supabase');
    if (!isSupabaseConfigured()) return;
    const client = getSupabase();
    if (!client) return;

    if (action === 'save') {
      // Ensure profile exists for FK constraint on created_by
      const session = (() => {
        try { return JSON.parse(localStorage.getItem('nexus-session') ?? 'null'); } catch { return null; }
      })();
      if (session?.principalId) {
        const { data: profileExists } = await client.from('profiles')
          .select('principal_id').eq('principal_id', session.principalId).maybeSingle();
        if (!profileExists) {
          await client.from('profiles').insert({
            principal_id: session.principalId, email: session.email || 'unknown',
            name: session.name || 'User', role: session.role || 'individual',
            tier: session.tier || 'individual', is_active: true, mfa_enabled: false,
            passkeys_count: 0, vault_count: 0,
          });
        }
      }
      const { error } = await client.from('directory_connections').upsert({
        id: conn.id, name: conn.name, provider: conn.provider,
        status: conn.status, tenant_url: conn.config?.tenantUrl || '',
        client_id: conn.config?.clientId || '', has_secret: conn.config?.hasSecret || false,
        sync_interval: conn.config?.syncInterval || 30,
        sync_direction: conn.config?.syncDirection || 'inbound',
        attribute_mapping: conn.config?.attributeMapping || [],
        last_sync_at: conn.config?.lastSyncAt ? new Date(conn.config.lastSyncAt).toISOString() : null,
        last_sync_result: conn.config?.lastSyncResult || null,
        last_sync_count: conn.config?.lastSyncCount || 0,
        total_users: conn.config?.totalUsers || 0,
        total_groups: conn.config?.totalGroups || 0,
        created_by: session?.principalId || 'system',
      }, { onConflict: 'id' });
      if (error) console.error('[SB] directory save:', error.code, error.message);
    } else if (action === 'delete') {
      await client.from('directory_connections').delete().eq('id', conn.id);
    }
  } catch(e) { console.error("[SB]", e); }
}

/* ── Sync History ──────────────────────────────────────────────────────── */

export function getSyncHistory(connectionId?: string): SyncEvent[] {
  const all = ls<SyncEvent[]>(SYNC_HISTORY_KEY, []);
  if (connectionId) return all.filter(e => e.connectionId === connectionId);
  return all;
}

function appendSyncEvents(events: SyncEvent[]): void {
  const all = ls<SyncEvent[]>(SYNC_HISTORY_KEY, []);
  const updated = [...events, ...all].slice(0, MAX_SYNC_EVENTS);
  lsSet(SYNC_HISTORY_KEY, updated);
}

/* ── Default Attribute Mappings ────────────────────────────────────────── */

const BASE_SCIM_MAPPINGS: AttributeMapping[] = [
  { source: 'userName', target: 'email', direction: 'both' },
  { source: 'displayName', target: 'name', direction: 'both' },
  { source: 'active', target: 'isActive', direction: 'both' },
  { source: 'title', target: 'jobTitle', direction: 'in' },
  { source: 'urn:ietf:params:scim:schemas:extension:enterprise:2.0:User:department', target: 'department', direction: 'in' },
  { source: 'urn:ietf:params:scim:schemas:extension:enterprise:2.0:User:manager', target: 'managerId', direction: 'in' },
];

const PROVIDER_EXTRA_MAPPINGS: Record<DirectoryProvider, AttributeMapping[]> = {
  entra_id: [
    { source: 'userPrincipalName', target: 'email', direction: 'in' },
    { source: 'givenName', target: 'firstName', direction: 'in' },
    { source: 'surname', target: 'lastName', direction: 'in' },
    { source: 'jobTitle', target: 'jobTitle', direction: 'in' },
    { source: 'department', target: 'department', direction: 'in' },
    { source: 'officeLocation', target: 'office', direction: 'in' },
    { source: 'accountEnabled', target: 'isActive', direction: 'both' },
  ],
  okta: [
    { source: 'profile.login', target: 'email', direction: 'in' },
    { source: 'profile.firstName', target: 'firstName', direction: 'in' },
    { source: 'profile.lastName', target: 'lastName', direction: 'in' },
    { source: 'profile.department', target: 'department', direction: 'in' },
    { source: 'profile.title', target: 'jobTitle', direction: 'in' },
    { source: 'status', target: 'isActive', direction: 'in' },
  ],
  duo: [
    { source: 'username', target: 'email', direction: 'in' },
    { source: 'realname', target: 'name', direction: 'in' },
    { source: 'status', target: 'isActive', direction: 'in' },
    { source: 'phones', target: 'mfaDevices', direction: 'in' },
  ],
  workday: [
    { source: 'Worker_ID', target: 'employeeId', direction: 'in' },
    { source: 'Email_Address', target: 'email', direction: 'in' },
    { source: 'Legal_Name', target: 'name', direction: 'in' },
    { source: 'Cost_Center', target: 'costCenter', direction: 'in' },
    { source: 'Supervisory_Organization', target: 'department', direction: 'in' },
    { source: 'Hire_Date', target: 'startDate', direction: 'in' },
  ],
  google_workspace: [
    { source: 'primaryEmail', target: 'email', direction: 'in' },
    { source: 'name.fullName', target: 'name', direction: 'in' },
    { source: 'suspended', target: 'isActive', direction: 'in' },
    { source: 'orgUnitPath', target: 'department', direction: 'in' },
    { source: 'isAdmin', target: 'isAdmin', direction: 'in' },
  ],
  custom_scim: BASE_SCIM_MAPPINGS,
};

export function getDefaultAttributeMappings(provider: DirectoryProvider): AttributeMapping[] {
  if (provider === 'custom_scim') return [...BASE_SCIM_MAPPINGS];
  return [...PROVIDER_EXTRA_MAPPINGS[provider]];
}

/* ── SCIM Provider Config ──────────────────────────────────────────────── */

export function getSCIMProviderConfig(provider: DirectoryProvider): SCIMProviderConfig {
  const configs: Record<DirectoryProvider, SCIMProviderConfig> = {
    entra_id: {
      displayName: 'Microsoft Entra ID',
      baseUrlHint: 'https://graph.microsoft.com/v1.0',
      authMethods: ['OAuth 2.0 Client Credentials', 'Certificate-based'],
      scimVersion: '2.0',
      capabilities: ['User provisioning', 'Group sync', 'Schema discovery', 'Bulk operations', 'Incremental sync'],
      endpoints: [
        { path: '/users', description: 'User provisioning and management' },
        { path: '/groups', description: 'Group membership sync' },
        { path: '/servicePrincipals', description: 'App registrations' },
        { path: '/auditLogs/directoryAudits', description: 'Directory audit events' },
      ],
    },
    okta: {
      displayName: 'Okta',
      baseUrlHint: 'https://{yourOktaDomain}/api/v1',
      authMethods: ['API Token', 'OAuth 2.0'],
      scimVersion: '2.0',
      capabilities: ['User provisioning', 'Group push', 'Profile sync', 'Lifecycle management', 'JIT provisioning'],
      endpoints: [
        { path: '/Users', description: 'SCIM user endpoint' },
        { path: '/Groups', description: 'SCIM group endpoint' },
        { path: '/api/v1/users', description: 'Okta Users API' },
        { path: '/api/v1/groups', description: 'Okta Groups API' },
      ],
    },
    duo: {
      displayName: 'Duo Security',
      baseUrlHint: 'https://api-{hostname}.duosecurity.com',
      authMethods: ['HMAC Auth (ikey/skey)'],
      scimVersion: '1.1',
      capabilities: ['User sync', 'Device inventory', 'MFA status', 'Authentication logs'],
      endpoints: [
        { path: '/admin/v1/users', description: 'User management' },
        { path: '/admin/v1/groups', description: 'Group management' },
        { path: '/admin/v2/logs/authentication', description: 'Auth logs' },
      ],
    },
    workday: {
      displayName: 'Workday',
      baseUrlHint: 'https://wd5-services1.myworkday.com/{tenant}',
      authMethods: ['OAuth 2.0', 'WS-Security'],
      scimVersion: '2.0',
      capabilities: ['HR data sync', 'Joiner-mover-leaver automation', 'Org structure', 'Cost center mapping'],
      endpoints: [
        { path: '/scim/v2/Users', description: 'SCIM user provisioning' },
        { path: '/ccx/api/v1/workers', description: 'Worker data' },
        { path: '/ccx/api/v1/organizations', description: 'Org structure' },
      ],
    },
    google_workspace: {
      displayName: 'Google Workspace',
      baseUrlHint: 'https://admin.googleapis.com',
      authMethods: ['OAuth 2.0 Service Account', 'Domain-wide delegation'],
      scimVersion: '2.0',
      capabilities: ['User provisioning', 'Group sync', 'OU management', 'License assignment'],
      endpoints: [
        { path: '/admin/directory/v1/users', description: 'User management' },
        { path: '/admin/directory/v1/groups', description: 'Group management' },
        { path: '/admin/reports/v1/activity', description: 'Activity reports' },
      ],
    },
    custom_scim: {
      displayName: 'Custom SCIM 2.0',
      baseUrlHint: 'https://your-provider.com/scim/v2',
      authMethods: ['Bearer Token', 'OAuth 2.0', 'Basic Auth'],
      scimVersion: '2.0',
      capabilities: ['User provisioning', 'Group sync', 'Schema discovery'],
      endpoints: [
        { path: '/Users', description: 'SCIM Users endpoint' },
        { path: '/Groups', description: 'SCIM Groups endpoint' },
        { path: '/Schemas', description: 'Schema discovery' },
        { path: '/ServiceProviderConfig', description: 'Provider capabilities' },
        { path: '/Bulk', description: 'Bulk operations' },
      ],
    },
  };
  return configs[provider];
}

/* ── Simulated Directory Sync ──────────────────────────────────────────── */

const FIRST_NAMES = ['Alice', 'Bob', 'Carol', 'David', 'Eva', 'Frank', 'Grace', 'Henry', 'Iris', 'James', 'Kate', 'Liam', 'Maya', 'Noah', 'Olivia', 'Peter', 'Quinn', 'Rachel', 'Sam', 'Tara'];
const LAST_NAMES = ['Chen', 'Rodriguez', 'Patel', 'Kim', 'Tanaka', 'Schmidt', 'O\'Brien', 'Singh', 'Johansson', 'Martinez', 'Lee', 'Thompson', 'Williams', 'Brown', 'Garcia'];

const ENTRA_DEPARTMENTS = ['Engineering', 'Sales', 'Legal', 'Finance', 'Marketing', 'Product', 'HR', 'Security', 'Operations'];
const OKTA_DEPARTMENTS = ['Platform Engineering', 'Customer Success', 'GTM', 'Corp Finance', 'InfoSec', 'DevOps', 'Data Science'];
const DUO_DEPARTMENTS = ['IT Security', 'Network Ops', 'Identity', 'Compliance'];
const WORKDAY_DEPARTMENTS = ['R&D', 'Professional Services', 'Finance & Accounting', 'People Operations', 'Business Development'];
const GOOGLE_DEPARTMENTS = ['Cloud Engineering', 'UX Design', 'Analytics', 'Support', 'Infrastructure'];

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateSimulatedUsers(provider: DirectoryProvider, count: number): { name: string; email: string; department: string }[] {
  const deptMap: Record<DirectoryProvider, string[]> = {
    entra_id: ENTRA_DEPARTMENTS,
    okta: OKTA_DEPARTMENTS,
    duo: DUO_DEPARTMENTS,
    workday: WORKDAY_DEPARTMENTS,
    google_workspace: GOOGLE_DEPARTMENTS,
    custom_scim: ENTRA_DEPARTMENTS,
  };
  const departments = deptMap[provider];
  const users: { name: string; email: string; department: string }[] = [];
  const usedEmails = new Set<string>();

  for (let i = 0; i < count; i++) {
    const first = pickRandom(FIRST_NAMES);
    const last = pickRandom(LAST_NAMES);
    const name = `${first} ${last}`;
    let email = `${first.toLowerCase()}.${last.toLowerCase().replace(/'/g, '')}@corp.nexus.io`;
    // Ensure uniqueness
    let suffix = 1;
    while (usedEmails.has(email)) {
      email = `${first.toLowerCase()}.${last.toLowerCase().replace(/'/g, '')}${suffix}@corp.nexus.io`;
      suffix++;
    }
    usedEmails.add(email);
    users.push({ name, email, department: pickRandom(departments) });
  }
  return users;
}

export function simulateDirectorySync(connectionId: string): {
  success: boolean;
  syncedCount: number;
  events: SyncEvent[];
  error?: string;
} {
  const conn = getConnection(connectionId);
  if (!conn) return { success: false, syncedCount: 0, events: [], error: 'Connection not found' };

  // Mark as syncing
  const syncingConn = { ...conn, status: 'syncing' as const };
  saveConnection(syncingConn);

  try {
    const count = 5 + Math.floor(Math.random() * 12); // 5-16 users
    const simulatedUsers = generateSimulatedUsers(conn.provider, count);
    const existingUsers = userRegistry.getAll();
    const events: SyncEvent[] = [];

    for (const user of simulatedUsers) {
      const existing = existingUsers.find(u => u.email === user.email);
      let action: SyncEvent['action'];
      let details: string;

      if (!existing) {
        // JIT provision — create new user in registry
        action = 'create';
        details = `JIT provisioned from ${getSCIMProviderConfig(conn.provider).displayName} (${user.department})`;
        userRegistry.upsert({
          principalId: `dir-${crypto.randomUUID().slice(0, 8)}`,
          name: user.name,
          email: user.email,
          role: 'individual',
          tier: 'enterprise',
          loginAt: Date.now(),
        });
      } else if (!existing.isActive && Math.random() > 0.7) {
        action = 'reactivate';
        details = `Reactivated via directory sync (${user.department})`;
        userRegistry.updateUser(existing.principalId, { isActive: true });
      } else {
        action = 'update';
        details = `Profile attributes refreshed from directory (${user.department})`;
        userRegistry.updateUser(existing.principalId, { name: user.name });
      }

      // Randomly assign groups
      if (Math.random() > 0.8) {
        events.push({
          id: crypto.randomUUID(),
          connectionId,
          timestamp: Date.now() - Math.floor(Math.random() * 1000),
          action: 'group_assign',
          userName: user.name,
          userEmail: user.email,
          details: `Added to group "${user.department}"`,
          result: 'success',
        });
      }

      events.push({
        id: crypto.randomUUID(),
        connectionId,
        timestamp: Date.now(),
        action,
        userName: user.name,
        userEmail: user.email,
        details,
        result: Math.random() > 0.05 ? 'success' : 'error',
      });
    }

    // Randomly deactivate a user (simulate leaver)
    if (Math.random() > 0.6 && existingUsers.length > 2) {
      const leaver = pickRandom(existingUsers.filter(u => u.isActive));
      if (leaver) {
        userRegistry.deactivate(leaver.principalId);
        events.push({
          id: crypto.randomUUID(),
          connectionId,
          timestamp: Date.now(),
          action: 'deactivate',
          userName: leaver.name,
          userEmail: leaver.email,
          details: `Deactivated — user not found in directory source`,
          result: 'success',
        });
      }
    }

    appendSyncEvents(events);

    const errorCount = events.filter(e => e.result === 'error').length;
    const syncResult = errorCount === 0 ? 'success' : errorCount < events.length ? 'partial' : 'error';

    // Update connection
    const updatedConn: DirectoryConnection = {
      ...conn,
      status: 'connected',
      config: {
        ...conn.config,
        lastSyncAt: Date.now(),
        lastSyncResult: syncResult,
        lastSyncCount: events.filter(e => e.result === 'success').length,
        totalUsers: userRegistry.getAll().length,
        totalGroups: Math.ceil(userRegistry.getAll().length / 4),
      },
    };
    saveConnection(updatedConn);

    // Audit log
    logAuditEvent({
      action: 'directory.sync.completed',
      resource: connectionId,
      resourceType: 'directory_connection',
      details: `Directory sync completed: ${events.length} events, ${errorCount} errors (${getSCIMProviderConfig(conn.provider).displayName})`,
      result: 'success',
    });

    return { success: true, syncedCount: events.filter(e => e.result === 'success').length, events };
  } catch (err) {
    const errorConn: DirectoryConnection = {
      ...conn,
      status: 'error',
      config: { ...conn.config, lastSyncAt: Date.now(), lastSyncResult: 'error' },
    };
    saveConnection(errorConn);
    return { success: false, syncedCount: 0, events: [], error: String(err) };
  }
}

/* ── SIEM Connection CRUD ──────────────────────────────────────────────── */

export function getSIEMConnections(): SIEMConnection[] {
  return ls<SIEMConnection[]>(SIEM_KEY, []);
}

export function saveSIEMConnection(conn: SIEMConnection): void {
  const all = getSIEMConnections();
  const idx = all.findIndex(c => c.id === conn.id);
  if (idx >= 0) {
    all[idx] = conn;
  } else {
    all.push(conn);
  }
  lsSet(SIEM_KEY, all);
}

export function deleteSIEMConnection(id: string): void {
  lsSet(SIEM_KEY, getSIEMConnections().filter(c => c.id !== id));
}

/* ── SIEM Event Formatters ─────────────────────────────────────────────── */

/**
 * Format an audit event as a CEF (Common Event Format) string.
 * CEF:Version|Device Vendor|Device Product|Device Version|Signature ID|Name|Severity|Extensions
 */
export function formatCEFEvent(event: AuditEvent): string {
  const severityMap: Record<string, number> = {
    success: 3,
    denied: 7,
    error: 8,
  };
  const severity = severityMap[event.result] ?? 5;
  const extensions = [
    `src=${event.ipAddress}`,
    `suser=${event.actorEmail}`,
    `act=${event.action}`,
    `outcome=${event.result}`,
    `msg=${event.details.replace(/[|\\=]/g, ' ')}`,
    `rt=${event.timestamp}`,
    event.resource ? `cs1=${event.resource}` : '',
    event.resourceType ? `cs1Label=${event.resourceType}` : '',
  ].filter(Boolean).join(' ');

  return `CEF:0|Nexus Identity|NexusIAM|1.0|${event.action}|${event.action}|${severity}|${extensions}`;
}

/**
 * Format an audit event for Splunk HTTP Event Collector (HEC).
 */
export function formatSplunkHEC(event: AuditEvent): object {
  return {
    time: Math.floor(event.timestamp / 1000),
    host: 'nexus-identity',
    source: 'nexus:audit',
    sourcetype: 'nexus:audit:json',
    index: 'main',
    event: {
      id: event.id,
      action: event.action,
      actor: event.actorEmail,
      actorRole: event.actorRole,
      resource: event.resource ?? null,
      resourceType: event.resourceType ?? null,
      details: event.details,
      result: event.result,
      ipAddress: event.ipAddress,
      timestamp: new Date(event.timestamp).toISOString(),
    },
  };
}

/**
 * Format an audit event for Azure Sentinel / Azure Monitor Logs ingestion.
 */
export function formatSentinelEvent(event: AuditEvent): object {
  return {
    TimeGenerated: new Date(event.timestamp).toISOString(),
    OperationName: event.action,
    Category: 'IdentityAudit',
    ResultType: event.result === 'success' ? 'Success' : event.result === 'denied' ? 'Failure' : 'Error',
    ResultDescription: event.details,
    CallerIpAddress: event.ipAddress,
    Identity: event.actorEmail,
    Level: event.result === 'success' ? 'Informational' : 'Warning',
    Properties: {
      eventId: event.id,
      actorPrincipalId: event.actor,
      actorRole: event.actorRole,
      resource: event.resource ?? null,
      resourceType: event.resourceType ?? null,
    },
  };
}

/**
 * Simulate forwarding audit events to a SIEM connection.
 * Returns the number of events "forwarded".
 */
export function simulateSIEMForward(siemId: string, events: AuditEvent[]): number {
  const conn = getSIEMConnections().find(c => c.id === siemId);
  if (!conn || !conn.enabled) return 0;

  // In a real implementation, this would POST to the endpoint.
  // Here we just format and log.
  const formatted = events.map(e => {
    switch (conn.type) {
      case 'sentinel': return formatSentinelEvent(e);
      case 'splunk': return formatSplunkHEC(e);
      default: return e;
    }
  });

  // Log for debugging
  logLog(`[SIEM] Forwarded ${formatted.length} events to ${conn.name} (${conn.type})`);

  // Update the SIEM connection stats
  saveSIEMConnection({
    ...conn,
    lastForwardedAt: Date.now(),
    eventsForwarded: conn.eventsForwarded + formatted.length,
  });

  return formatted.length;
}
