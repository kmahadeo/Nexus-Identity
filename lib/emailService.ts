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
 * Supports both plain text and HTML content.
 */
export async function sendEmail(to: string, subject: string, body: string, html?: string): Promise<boolean> {
  const cfg = getConfig();

  // ── Brevo (Sendinblue) — 300 emails/day free ──
  if (cfg.provider === 'brevo' && cfg.apiKey) {
    try {
      const payload: Record<string, unknown> = {
        sender: { name: cfg.fromName, email: cfg.fromEmail },
        to: [{ email: to }],
        subject,
      };
      if (html) payload.htmlContent = html;
      else payload.textContent = body;

      const res = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'api-key': cfg.apiKey,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(payload),
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
          ...(html ? { html } : { text: body }),
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
 * Send a platform invite email with professional HTML template.
 */
export async function sendInviteEmail(
  toEmail: string,
  inviterName: string,
  role: string = 'individual',
): Promise<boolean> {
  const appUrl = window.location.origin;
  const subject = `${inviterName} invited you to Nexus Identity`;
  const roleLabel = role.charAt(0).toUpperCase() + role.slice(1);

  const plainText = `Hi there,

${inviterName} has invited you to join Nexus Identity — a passwordless identity and access management platform.

Your role: ${roleLabel}

Get started here: ${appUrl}

— Nexus Identity Platform`;

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>
<body style="margin:0;padding:0;background-color:#0a0a14;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0a0a14;padding:40px 20px;"><tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,#0f0f1c 0%,#080812 100%);border:1px solid rgba(255,255,255,0.08);border-radius:16px;overflow:hidden;">
<tr><td style="padding:32px 40px 24px;text-align:center;border-bottom:1px solid rgba(255,255,255,0.06);">
<div style="width:48px;height:48px;background:linear-gradient(135deg,rgba(139,92,246,0.3),rgba(59,130,246,0.2));border-radius:12px;display:inline-block;line-height:48px;margin-bottom:16px;"><span style="font-size:24px;">&#x1F6E1;</span></div>
<h1 style="color:#e2e8f0;font-size:22px;font-weight:700;margin:0 0 4px;">Nexus Identity</h1>
<p style="color:rgba(255,255,255,0.35);font-size:12px;letter-spacing:0.1em;text-transform:uppercase;margin:0;font-family:monospace;">Passwordless Identity Platform</p>
</td></tr>
<tr><td style="padding:32px 40px;">
<p style="color:#e2e8f0;font-size:16px;margin:0 0 8px;">Hi there,</p>
<p style="color:rgba(255,255,255,0.6);font-size:15px;line-height:1.6;margin:0 0 24px;">
<strong style="color:#a78bfa;">${inviterName}</strong> has invited you to join Nexus Identity — a passwordless identity and access management platform built for modern security teams.</p>
<div style="background:rgba(139,92,246,0.08);border:1px solid rgba(139,92,246,0.2);border-radius:8px;padding:12px 16px;margin-bottom:24px;">
<p style="color:rgba(255,255,255,0.4);font-size:12px;margin:0 0 4px;">Your assigned role</p>
<p style="color:#a78bfa;font-size:16px;font-weight:600;margin:0;">${roleLabel}</p></div>
<a href="${appUrl}" style="display:block;text-align:center;padding:14px 32px;background:linear-gradient(135deg,rgba(139,92,246,0.9),rgba(167,139,250,0.8));color:#fff;font-size:15px;font-weight:600;text-decoration:none;border-radius:12px;margin-bottom:24px;">Get Started — Sign In</a>
<div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:20px;">
<p style="color:rgba(255,255,255,0.5);font-size:13px;font-weight:600;margin:0 0 12px;">What you can do:</p>
<p style="padding:6px 0;color:rgba(255,255,255,0.5);font-size:13px;margin:0;"><span style="color:#22d3ee;margin-right:8px;">&#x2713;</span> Register a passkey for phishing-proof authentication</p>
<p style="padding:6px 0;color:rgba(255,255,255,0.5);font-size:13px;margin:0;"><span style="color:#22d3ee;margin-right:8px;">&#x2713;</span> Store credentials in an AES-256 encrypted vault</p>
<p style="padding:6px 0;color:rgba(255,255,255,0.5);font-size:13px;margin:0;"><span style="color:#22d3ee;margin-right:8px;">&#x2713;</span> Manage security posture with real-time threat scanning</p>
<p style="padding:6px 0;color:rgba(255,255,255,0.5);font-size:13px;margin:0;"><span style="color:#22d3ee;margin-right:8px;">&#x2713;</span> Set up TOTP MFA with your authenticator app</p>
</div></td></tr>
<tr><td style="padding:20px 40px 28px;border-top:1px solid rgba(255,255,255,0.06);text-align:center;">
<p style="color:rgba(255,255,255,0.25);font-size:11px;margin:0 0 4px;">This invitation doesn't expire. Your permissions are pre-configured.</p>
<p style="color:rgba(255,255,255,0.15);font-size:10px;font-family:monospace;letter-spacing:0.05em;margin:0;">NEXUS IDENTITY &middot; END-TO-END ENCRYPTED &middot; ZERO TRUST</p>
</td></tr></table></td></tr></table></body></html>`;

  return sendEmail(toEmail, subject, plainText, html);
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
