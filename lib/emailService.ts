/**
 * lib/emailService.ts — Email service for invites and notifications.
 *
 * Supports: Brevo (300/day free), Resend (100/day free).
 * The API key is stored in localStorage (Settings → Integrations).
 */

const EMAIL_CONFIG_KEY = 'nexus-email-config';

interface EmailConfig {
  provider: 'brevo' | 'resend' | 'none';
  apiKey: string;
  fromEmail: string;
  fromName: string;
}

function getConfig(): EmailConfig {
  try {
    const stored = JSON.parse(localStorage.getItem(EMAIL_CONFIG_KEY) ?? 'null');
    if (stored?.apiKey) return stored;
  } catch {}

  // Fall back to env var
  const envBrevoKey = import.meta.env.VITE_BREVO_API_KEY;
  if (envBrevoKey) {
    return { provider: 'brevo', apiKey: envBrevoKey, fromEmail: 'kaushik.mahadeokar@gmail.com', fromName: 'Nexus Identity' };
  }

  return { provider: 'none', apiKey: '', fromEmail: 'noreply@nexus-identity.io', fromName: 'Nexus Identity' };
}

export function saveEmailConfig(config: EmailConfig): void {
  localStorage.setItem(EMAIL_CONFIG_KEY, JSON.stringify(config));
}

export function getEmailConfig(): EmailConfig {
  return getConfig();
}

export function isEmailConfigured(): boolean {
  const cfg = getConfig();
  return cfg.provider !== 'none' && !!cfg.apiKey;
}

/**
 * Send an email via the configured provider.
 */
export async function sendEmail(to: string, subject: string, body: string): Promise<boolean> {
  const cfg = getConfig();

  // ── Brevo (Sendinblue) — 300 emails/day free ──
  if (cfg.provider === 'brevo' && cfg.apiKey) {
    try {
      const res = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'api-key': cfg.apiKey,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          sender: { name: cfg.fromName, email: cfg.fromEmail },
          to: [{ email: to }],
          subject,
          textContent: body,
        }),
      });

      if (res.ok) {
        console.log('[Email/Brevo] Sent to', to);
        return true;
      } else {
        const err = await res.json().catch(() => ({}));
        console.error('[Email/Brevo] Failed:', err);
        return false;
      }
    } catch (e) {
      console.error('[Email/Brevo] Send error:', e);
      return false;
    }
  }

  // ── Resend — 100 emails/day free ──
  if (cfg.provider === 'resend' && cfg.apiKey) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${cfg.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: `${cfg.fromName} <${cfg.fromEmail}>`,
          to: [to],
          subject,
          text: body,
        }),
      });

      if (res.ok) {
        console.log('[Email/Resend] Sent to', to);
        return true;
      } else {
        const err = await res.json().catch(() => ({}));
        console.error('[Email/Resend] Failed:', err);
        return false;
      }
    } catch (e) {
      console.error('[Email/Resend] Send error:', e);
      return false;
    }
  }

  console.log('[Email] Not configured. Would send to:', to, '| Subject:', subject);
  return false;
}

/**
 * Send a platform invite email.
 */
export async function sendInviteEmail(
  toEmail: string,
  inviterName: string,
  role: string = 'individual',
): Promise<boolean> {
  const appUrl = window.location.origin;
  const subject = `${inviterName} invited you to Nexus Identity`;
  const body = `Hi there,

${inviterName} has invited you to join Nexus Identity — a passwordless identity and access management platform.

Your role: ${role}

Get started here: ${appUrl}

What you can do:
- Register a passkey for phishing-proof authentication
- Store credentials in an encrypted vault
- Manage your security posture with real-time threat scanning

This invitation doesn't expire. When you sign up, your role and permissions will be automatically assigned.

— Nexus Identity Platform`;

  return sendEmail(toEmail, subject, body);
}

/**
 * Send a security alert email.
 */
export async function sendSecurityAlert(
  toEmail: string,
  alertType: string,
  details: string,
): Promise<boolean> {
  const subject = `[Nexus Security Alert] ${alertType}`;
  const body = `Security Alert from Nexus Identity

Type: ${alertType}
Details: ${details}
Time: ${new Date().toISOString()}

Log in to review: ${window.location.origin}

— Nexus Identity Platform`;

  return sendEmail(toEmail, subject, body);
}
