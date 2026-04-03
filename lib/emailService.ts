/**
 * lib/emailService.ts — Email service for invites and notifications.
 *
 * Uses Resend API when configured, falls back to console logging.
 * The API key is stored in localStorage (Settings → Integrations).
 * In production, move to server-side (Cloudflare Worker / Edge Function).
 */

const EMAIL_CONFIG_KEY = 'nexus-email-config';

interface EmailConfig {
  provider: 'resend' | 'none';
  apiKey: string;
  fromEmail: string;
  fromName: string;
}

function getConfig(): EmailConfig {
  try {
    return JSON.parse(localStorage.getItem(EMAIL_CONFIG_KEY) ?? 'null') ?? {
      provider: 'none', apiKey: '', fromEmail: 'noreply@nexus-identity.io', fromName: 'Nexus Identity',
    };
  } catch {
    return { provider: 'none', apiKey: '', fromEmail: 'noreply@nexus-identity.io', fromName: 'Nexus Identity' };
  }
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
 * Returns true if sent, false if not configured or failed.
 */
export async function sendEmail(to: string, subject: string, body: string): Promise<boolean> {
  const cfg = getConfig();

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
        console.log('[Email] Sent to', to, '—', subject);
        return true;
      } else {
        const err = await res.json().catch(() => ({}));
        console.error('[Email] Failed:', err);
        return false;
      }
    } catch (e) {
      console.error('[Email] Send error:', e);
      return false;
    }
  }

  // Not configured — log to console
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
• Register a passkey for phishing-proof authentication
• Store credentials in an encrypted vault
• Manage your security posture with real-time threat scanning

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
