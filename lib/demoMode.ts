/**
 * lib/demoMode.ts — Demo Mode for Nexus Identity.
 *
 * Allows prospects to explore the full platform without billing.
 * Activated by entering a passphrase on the login screen.
 * Seeds realistic sample data (vault entries, team members, policies, audit log).
 */

import { sessionStorage_, userRegistry, roleRegistry, vaultStorage, policyStorage } from './storage';
import type { SessionData, SecurityPolicy } from './storage';
import { logAuditEvent } from './auditLog';

/* ── Constants ─────────────────────────────────────────────────────────── */

const DEMO_KEY = 'nexus-demo-mode';
const DEMO_SECRET = 'nexus-demo-2026';

/* ── Core API ──────────────────────────────────────────────────────────── */

/** Check if the app is currently running in demo mode. */
export function isDemoMode(): boolean {
  try {
    return localStorage.getItem(DEMO_KEY) === 'active';
  } catch {
    return false;
  }
}

/**
 * Enable demo mode if the passphrase matches.
 * Returns true on success, false if the passphrase is incorrect.
 */
export function enableDemoMode(passphrase: string): boolean {
  if (passphrase.trim() !== DEMO_SECRET) return false;
  try {
    localStorage.setItem(DEMO_KEY, 'active');
  } catch { /* quota */ }
  return true;
}

/** Disable demo mode and clean up the flag. */
export function disableDemoMode(): void {
  try {
    localStorage.removeItem(DEMO_KEY);
  } catch { /* ignore */ }
}

/** Returns display config for the current demo session. */
export function getDemoConfig(): { label: string; restrictions: string[] } {
  return {
    label: 'DEMO MODE',
    restrictions: [
      'Billing is disabled — no charges will occur',
      'Data resets when you clear browser storage',
      'All enterprise features are unlocked for evaluation',
    ],
  };
}

/* ── Demo User Constants ───────────────────────────────────────────────── */

const DEMO_PRINCIPAL = 'nexus-demo-admin-dXNlckBuZXh1';
const DEMO_EMAIL = 'demo@nexus-identity.io';
const DEMO_NAME = 'Demo Admin';

/* ── Demo Session ──────────────────────────────────────────────────────── */

/** Create a demo admin session and persist it. Returns the session. */
export function createDemoSession(): SessionData {
  const session: SessionData = {
    principalId: DEMO_PRINCIPAL,
    name: DEMO_NAME,
    email: DEMO_EMAIL,
    role: 'admin',
    tier: 'enterprise',
    loginAt: Date.now(),
  };
  sessionStorage_.set(session);
  userRegistry.upsert(session);
  roleRegistry.save({
    email: DEMO_EMAIL,
    name: DEMO_NAME,
    role: 'admin',
    tier: 'enterprise',
    principalId: DEMO_PRINCIPAL,
  });

  // Also set the tenant tier to enterprise
  try {
    localStorage.setItem('nexus-tenant-tier', 'enterprise');
  } catch { /* quota */ }

  return session;
}

/* ── Seed Function ─────────────────────────────────────────────────────── */

/**
 * Pre-populate the demo account with realistic sample data.
 * Safe to call multiple times — it only seeds if vault is empty.
 */
export function seedDemoData(): void {
  const existingVault = vaultStorage.getRaw(DEMO_PRINCIPAL);
  if (existingVault.length > 0) return; // Already seeded

  const now = BigInt(Date.now());
  const day = BigInt(86_400_000);

  // ── 1. Vault Entries (5 realistic services) ────────────────────────────

  const vaultEntries = [
    {
      id: 'demo-vault-github',
      name: 'GitHub',
      title: 'GitHub — Engineering Org',
      username: 'devops@acmecorp.com',
      password: 'demo-github-pat-not-real-token',
      url: 'https://github.com/acmecorp',
      category: 'Development',
      tags: ['engineering', 'source-control', 'ci-cd'],
      createdAt: now - day * 45n,
      updatedAt: now - day * 3n,
      notes: 'Main org account. SSO via Okta. PAT rotated quarterly — next rotation April 15.',
      encryptedData: '',
    },
    {
      id: 'demo-vault-aws',
      name: 'AWS',
      title: 'AWS — Production Account',
      username: 'iam-admin@acmecorp.com',
      password: 'demo-aws-access-key-not-real',
      url: 'https://acmecorp.signin.aws.amazon.com/console',
      category: 'Infrastructure',
      tags: ['cloud', 'production', 'iam'],
      createdAt: now - day * 120n,
      updatedAt: now - day * 7n,
      notes: 'Root account MFA enforced. Access key pair for CI pipeline. Region: us-east-1.',
      encryptedData: '',
    },
    {
      id: 'demo-vault-stripe',
      name: 'Stripe',
      title: 'Stripe — Payments Dashboard',
      username: 'billing@acmecorp.com',
      password: 'sk_demo_EXAMPLE_NOT_REAL_12345',
      url: 'https://dashboard.stripe.com',
      category: 'Finance',
      tags: ['payments', 'billing', 'api'],
      createdAt: now - day * 90n,
      updatedAt: now - day * 14n,
      notes: 'Live secret key for payment processing. Webhook endpoint configured at /api/webhooks/stripe.',
      encryptedData: '',
    },
    {
      id: 'demo-vault-slack',
      name: 'Slack',
      title: 'Slack — Workspace Admin',
      username: 'admin@acmecorp.com',
      password: 'demo-slack-bot-token-not-real',
      url: 'https://acmecorp.slack.com',
      category: 'Communication',
      tags: ['messaging', 'team', 'bot-token'],
      createdAt: now - day * 200n,
      updatedAt: now - day * 1n,
      notes: 'Workspace admin bot token. Used for security alert notifications to #sec-alerts channel.',
      encryptedData: '',
    },
    {
      id: 'demo-vault-jira',
      name: 'Jira',
      title: 'Jira — Project Management',
      username: 'pm@acmecorp.com',
      password: 'demo-jira-api-token-not-real',
      url: 'https://acmecorp.atlassian.net',
      category: 'Productivity',
      tags: ['project-management', 'tickets', 'api-token'],
      createdAt: now - day * 60n,
      updatedAt: now - day * 5n,
      notes: 'API token for Jira Cloud. Linked to the automation service account.',
      encryptedData: '',
    },
  ];

  vaultStorage.save(vaultEntries, DEMO_PRINCIPAL);

  // ── 2. Team Members (2 additional users in the registry) ───────────────

  const teamMembers: SessionData[] = [
    {
      principalId: 'nexus-demo-team-sarah',
      name: 'Sarah Nguyen',
      email: 'sarah.nguyen@acmecorp.com',
      role: 'team',
      tier: 'enterprise',
      loginAt: Date.now() - 2 * 86_400_000,
    },
    {
      principalId: 'nexus-demo-team-marcus',
      name: 'Marcus Chen',
      email: 'marcus.chen@acmecorp.com',
      role: 'team',
      tier: 'enterprise',
      loginAt: Date.now() - 5 * 86_400_000,
    },
  ];

  for (const member of teamMembers) {
    userRegistry.upsert(member);
    roleRegistry.save({
      email: member.email,
      name: member.name,
      role: member.role,
      tier: member.tier,
      principalId: member.principalId,
    });
  }

  // ── 3. Security Policies (3 demo-specific policies) ────────────────────

  const demoPolicies: SecurityPolicy[] = [
    {
      id: 'demo-pol-1',
      name: 'Passkey-Only Authentication',
      description: 'All team members must use FIDO2 passkeys. Password fallback disabled after 7-day grace period.',
      type: 'access',
      severity: 'critical',
      enabled: true,
      enforcement: 'block',
      config: { graceperiodDays: 7, allowPasswordFallback: false },
      createdAt: Date.now() - 30 * 86_400_000,
      createdBy: DEMO_EMAIL,
      lastModified: Date.now() - 2 * 86_400_000,
    },
    {
      id: 'demo-pol-2',
      name: 'Credential Rotation (90 days)',
      description: 'All vault entries with API keys or passwords must be rotated within 90 days. Auto-alerts at 75 days.',
      type: 'vault',
      severity: 'high',
      enabled: true,
      enforcement: 'warn',
      config: { rotationDays: 90, alertAtDays: 75, autoRemind: true },
      createdAt: Date.now() - 45 * 86_400_000,
      createdBy: DEMO_EMAIL,
      lastModified: Date.now() - 10 * 86_400_000,
    },
    {
      id: 'demo-pol-3',
      name: 'Geo-Fenced Access Control',
      description: 'Block login attempts from outside approved regions (US, EU, AU). Alert on VPN/Tor usage.',
      type: 'access',
      severity: 'high',
      enabled: true,
      enforcement: 'warn',
      config: { allowedRegions: 'US,EU,AU', blockTor: true, blockVPN: false },
      createdAt: Date.now() - 20 * 86_400_000,
      createdBy: DEMO_EMAIL,
      lastModified: Date.now() - 3 * 86_400_000,
    },
  ];

  // Merge with any existing default policies (don't overwrite)
  const existingPolicies = policyStorage.getAll();
  const newPolicies = demoPolicies.filter(dp => !existingPolicies.some(ep => ep.id === dp.id));
  if (newPolicies.length > 0) {
    policyStorage.save([...existingPolicies, ...newPolicies]);
  }

  // ── 4. Audit Log Entries (realistic recent activity) ───────────────────

  const auditEntries = [
    {
      action: 'auth.login.success',
      details: 'Demo admin logged in via passkey (Touch ID)',
      resource: DEMO_PRINCIPAL,
      resourceType: 'session',
      result: 'success' as const,
    },
    {
      action: 'vault.entry.created',
      details: 'Added GitHub PAT to vault (Engineering Org)',
      resource: 'demo-vault-github',
      resourceType: 'vault_entry',
      result: 'success' as const,
    },
    {
      action: 'vault.entry.created',
      details: 'Added AWS IAM credentials to vault (Production Account)',
      resource: 'demo-vault-aws',
      resourceType: 'vault_entry',
      result: 'success' as const,
    },
    {
      action: 'team.member.invited',
      details: 'Invited sarah.nguyen@acmecorp.com as Team member',
      resource: 'nexus-demo-team-sarah',
      resourceType: 'team',
      result: 'success' as const,
    },
    {
      action: 'policy.created',
      details: 'Created policy: Passkey-Only Authentication (enforcement: block)',
      resource: 'demo-pol-1',
      resourceType: 'policy',
      result: 'success' as const,
    },
    {
      action: 'auth.login.success',
      details: 'Sarah Nguyen logged in via FIDO2 passkey',
      resource: 'nexus-demo-team-sarah',
      resourceType: 'session',
      result: 'success' as const,
      actorEmail: 'sarah.nguyen@acmecorp.com',
      actorRole: 'team',
      actor: 'nexus-demo-team-sarah',
    },
    {
      action: 'threat.scan.completed',
      details: 'Scheduled threat scan completed — 0 critical, 2 warnings (credential age)',
      resource: 'threat-scan-weekly',
      resourceType: 'scan',
      result: 'success' as const,
    },
    {
      action: 'vault.entry.accessed',
      details: 'Marcus Chen accessed Slack workspace admin credentials',
      resource: 'demo-vault-slack',
      resourceType: 'vault_entry',
      result: 'success' as const,
      actorEmail: 'marcus.chen@acmecorp.com',
      actorRole: 'team',
      actor: 'nexus-demo-team-marcus',
    },
    {
      action: 'auth.login.blocked',
      details: 'Login attempt from unrecognized IP 185.220.101.34 (Tor exit node) — blocked by geo-fence policy',
      resource: 'unknown',
      resourceType: 'session',
      result: 'denied' as const,
      actorEmail: 'unknown@external',
      actorRole: 'unknown',
      actor: 'unknown',
      ipAddress: '185.220.101.34',
    },
    {
      action: 'policy.updated',
      details: 'Updated Credential Rotation policy — alert threshold changed from 80 to 75 days',
      resource: 'demo-pol-2',
      resourceType: 'policy',
      result: 'success' as const,
    },
  ];

  for (const entry of auditEntries) {
    logAuditEvent(entry);
  }
}
