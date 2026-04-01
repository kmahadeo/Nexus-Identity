/**
 * lib/helpRequests.ts — In-app help request / support ticket system.
 *
 * Option C implementation:
 *   1. Tickets stored in localStorage (visible to admins)
 *   2. Email stub — TODO: replace with Resend / SendGrid call
 */

import { logInfo } from './logger';

/* ── Types ────────────────────────────────────────────────────────────────── */

export type HelpRequestStatus = 'open' | 'in_progress' | 'resolved' | 'closed';
export type HelpRequestPriority = 'low' | 'medium' | 'high' | 'urgent';
export type HelpRequestCategory =
  | 'onboarding'
  | 'sso_integration'
  | 'vault'
  | 'mfa'
  | 'billing'
  | 'security'
  | 'other';

export interface HelpRequest {
  id: string;
  subject: string;
  message: string;
  category: HelpRequestCategory;
  priority: HelpRequestPriority;
  status: HelpRequestStatus;
  requesterPrincipalId: string;
  requesterEmail: string;
  requesterName: string;
  createdAt: number;
  updatedAt: number;
  adminNotes?: string;
  resolvedAt?: number;
}

/* ── Storage ─────────────────────────────────────────────────────────────── */

const HELP_KEY = 'nexus-help-requests';

/* ── Supabase sync helper ── */
async function syncHelpToSupabase(action: string, req: HelpRequest) {
  try {
    const { getSupabase, isSupabaseConfigured } = await import('./supabase');
    if (!isSupabaseConfigured()) return;
    const client = getSupabase();
    if (!client) return;

    if (action === 'add') {
      await client.from('help_requests').insert({
        subject: req.subject,
        message: req.message,
        category: req.category,
        priority: req.priority,
        status: req.status,
        requester_id: req.requesterPrincipalId,
        requester_email: req.requesterEmail,
        requester_name: req.requesterName,
      });
    } else if (action === 'update') {
      // Match by subject + requester since we don't store Supabase UUID locally
      const update: Record<string, unknown> = { status: req.status };
      if (req.adminNotes) update.admin_notes = req.adminNotes;
      if (req.resolvedAt) update.resolved_at = new Date(req.resolvedAt).toISOString();
      await client.from('help_requests')
        .update(update)
        .eq('requester_id', req.requesterPrincipalId)
        .eq('subject', req.subject);
    }
  } catch { /* non-critical */ }
}

export const helpRequestStorage = {
  getAll(): HelpRequest[] {
    try { return JSON.parse(localStorage.getItem(HELP_KEY) ?? '[]'); } catch { return []; }
  },

  getByUser(principalId: string): HelpRequest[] {
    return helpRequestStorage.getAll().filter(r => r.requesterPrincipalId === principalId);
  },

  save(requests: HelpRequest[]): void {
    try { localStorage.setItem(HELP_KEY, JSON.stringify(requests)); } catch {}
  },

  add(req: Omit<HelpRequest, 'id' | 'createdAt' | 'updatedAt' | 'status'>): HelpRequest {
    const full: HelpRequest = {
      ...req,
      id: crypto.randomUUID(),
      status: 'open',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    helpRequestStorage.save([...helpRequestStorage.getAll(), full]);
    syncHelpToSupabase('add', full);
    return full;
  },

  updateStatus(id: string, status: HelpRequestStatus, adminNotes?: string): void {
    const updated = helpRequestStorage.getAll().map(r =>
      r.id === id
        ? { ...r, status, adminNotes: adminNotes ?? r.adminNotes, updatedAt: Date.now(), resolvedAt: status === 'resolved' ? Date.now() : r.resolvedAt }
        : r,
    );
    helpRequestStorage.save(updated);
    const req = updated.find(r => r.id === id);
    if (req) syncHelpToSupabase('update', req);
  },

  delete(id: string): void {
    helpRequestStorage.save(helpRequestStorage.getAll().filter(r => r.id !== id));
  },
};

/* ── Email stub ──────────────────────────────────────────────────────────── */

const ADMIN_EMAIL = 'admin@nexus.io'; // TODO: configure via environment variable

/**
 * Send a help request notification email to the admin.
 *
 * TODO: Replace this stub with a real email service call.
 * Recommended options:
 *   - Resend:    POST https://api.resend.com/emails
 *   - SendGrid:  POST https://api.sendgrid.com/v3/mail/send
 *   - MailerSend, Postmark, AWS SES, etc.
 *
 * For security, the API key should be stored server-side (ICP canister,
 * Cloudflare Worker, or any backend) — never in frontend localStorage.
 */
export async function sendHelpRequestEmail(req: HelpRequest): Promise<void> {
  // ── STUB: log to console in dev, no real email sent ──
  logInfo('[HelpRequest] New ticket submitted:', {
    to: ADMIN_EMAIL,
    subject: `[Nexus Support] ${req.subject}`,
    from: req.requesterEmail,
    body: `
New support ticket from ${req.requesterName} (${req.requesterEmail})

Category: ${req.category}
Priority: ${req.priority}
Status: ${req.status}
Ticket ID: ${req.id}
Created: ${new Date(req.createdAt).toISOString()}

Message:
${req.message}

---
Manage tickets in the Nexus Admin → Support Tickets view.
    `.trim(),
  });

  // TODO: Uncomment and configure one of the following:
  //
  // === Resend ===
  // const res = await fetch('https://api.resend.com/emails', {
  //   method: 'POST',
  //   headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
  //   body: JSON.stringify({
  //     from: 'Nexus Identity <noreply@nexus.io>',
  //     to: [ADMIN_EMAIL],
  //     reply_to: req.requesterEmail,
  //     subject: `[Nexus Support] ${req.subject}`,
  //     text: body,
  //   }),
  // });
  //
  // === SendGrid ===
  // const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
  //   method: 'POST',
  //   headers: { 'Authorization': `Bearer ${SENDGRID_API_KEY}`, 'Content-Type': 'application/json' },
  //   body: JSON.stringify({
  //     personalizations: [{ to: [{ email: ADMIN_EMAIL }] }],
  //     from: { email: 'noreply@nexus.io', name: 'Nexus Identity' },
  //     subject: `[Nexus Support] ${req.subject}`,
  //     content: [{ type: 'text/plain', value: body }],
  //   }),
  // });
}

/* ── Category labels ─────────────────────────────────────────────────────── */

export const HELP_CATEGORIES: Record<HelpRequestCategory, string> = {
  onboarding:      'Onboarding & Setup',
  sso_integration: 'SSO / Identity Provider',
  vault:           'Vault & Credentials',
  mfa:             'MFA & Authentication',
  billing:         'Billing & Plans',
  security:        'Security & Compliance',
  other:           'Other',
};

export const HELP_PRIORITIES: Record<HelpRequestPriority, { label: string; color: string }> = {
  low:    { label: 'Low',    color: 'text-slate-400' },
  medium: { label: 'Medium', color: 'text-amber-400' },
  high:   { label: 'High',   color: 'text-orange-400' },
  urgent: { label: 'Urgent', color: 'text-red-400'    },
};
