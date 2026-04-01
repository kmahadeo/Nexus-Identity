/**
 * lib/totp.ts — Browser-native TOTP (RFC 6238) implementation.
 *
 * Uses only Web Crypto API — no third-party dependencies.
 * Compatible with Google Authenticator, Microsoft Authenticator,
 * Duo Mobile, Okta Verify, and any standard TOTP app.
 */

/* ── Base32 ─────────────────────────────────────────────────────────────── */

const BASE32_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** Encode raw bytes to Base32 (RFC 4648). */
export function base32Encode(bytes: Uint8Array): string {
  let bits = 0, value = 0, output = '';
  for (let i = 0; i < bytes.length; i++) {
    value = (value << 8) | bytes[i];
    bits += 8;
    while (bits >= 5) {
      output += BASE32_CHARS[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_CHARS[(value << (5 - bits)) & 31];
  return output;
}

/** Decode Base32 string to bytes. Silently ignores padding '='. */
export function base32Decode(input: string): Uint8Array {
  const clean = input.toUpperCase().replace(/=+$/, '').replace(/\s/g, '');
  const bytes = new Uint8Array(Math.floor(clean.length * 5 / 8));
  let bits = 0, value = 0, idx = 0;
  for (const ch of clean) {
    const v = BASE32_CHARS.indexOf(ch);
    if (v < 0) continue;
    value = (value << 5) | v;
    bits += 5;
    if (bits >= 8) {
      bytes[idx++] = (value >>> (bits - 8)) & 0xff;
      bits -= 8;
    }
  }
  return bytes.slice(0, idx);
}

/* ── HMAC-SHA1 helper ───────────────────────────────────────────────────── */

async function hmacSha1(keyBytes: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw', keyBytes.buffer as ArrayBuffer,
    { name: 'HMAC', hash: 'SHA-1' },
    false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, data.buffer as ArrayBuffer);
  return new Uint8Array(sig);
}

/* ── TOTP core ──────────────────────────────────────────────────────────── */

/**
 * Generate a 6-digit TOTP code for the given secret and time step.
 * @param secretBase32 - Base32-encoded TOTP secret
 * @param timestepSeconds - Time step size (default 30)
 * @param counter - Time counter (defaults to current time / step)
 */
export async function generateTOTP(
  secretBase32: string,
  timestepSeconds = 30,
  counter?: number,
): Promise<string> {
  const keyBytes = base32Decode(secretBase32);
  const t = counter ?? Math.floor(Date.now() / 1000 / timestepSeconds);

  // 8-byte big-endian counter
  const msg = new Uint8Array(8);
  let tmp = t;
  for (let i = 7; i >= 0; i--) { msg[i] = tmp & 0xff; tmp >>>= 8; }

  const hmac = await hmacSha1(keyBytes, msg);

  // Dynamic truncation (RFC 4226 §5.3)
  const offset = hmac[19] & 0x0f;
  const code = (
    ((hmac[offset]     & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) <<  8) |
    ((hmac[offset + 3] & 0xff))
  ) % 1_000_000;

  return String(code).padStart(6, '0');
}

/**
 * Verify a TOTP code with ±1 window tolerance (accounts for clock skew).
 */
export async function verifyTOTP(
  secretBase32: string,
  code: string,
  timestepSeconds = 30,
): Promise<boolean> {
  const t = Math.floor(Date.now() / 1000 / timestepSeconds);
  for (const delta of [-1, 0, 1]) {
    const valid = await generateTOTP(secretBase32, timestepSeconds, t + delta);
    if (valid === code.replace(/\s/g, '')) return true;
  }
  return false;
}

/* ── Secret generation ──────────────────────────────────────────────────── */

/** Generate a new cryptographically random TOTP secret (160-bit = 32 base32 chars). */
export function generateTOTPSecret(): string {
  const bytes = new Uint8Array(20); // 160 bits — standard TOTP secret length
  crypto.getRandomValues(bytes);
  return base32Encode(bytes);
}

/* ── OTPAuth URI ────────────────────────────────────────────────────────── */

export interface TOTPUriOptions {
  issuer: string;       // e.g. "Nexus Identity"
  accountName: string;  // e.g. "user@example.com"
  secret: string;       // base32
  algorithm?: 'SHA1';   // only SHA1 is universally supported
  digits?: 6;
  period?: 30;
}

/**
 * Generate a standard otpauth:// URI for QR code generation.
 * Compatible with Google Authenticator, Authy, Duo, Okta, etc.
 */
export function buildOTPAuthUri(opts: TOTPUriOptions): string {
  const { issuer, accountName, secret, algorithm = 'SHA1', digits = 6, period = 30 } = opts;
  const label = encodeURIComponent(`${issuer}:${accountName}`);
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm,
    digits: String(digits),
    period: String(period),
  });
  return `otpauth://totp/${label}?${params}`;
}

/* ── Countdown helpers ──────────────────────────────────────────────────── */

/** Seconds remaining in the current 30-second TOTP window. */
export function totpSecondsRemaining(timestepSeconds = 30): number {
  return timestepSeconds - (Math.floor(Date.now() / 1000) % timestepSeconds);
}

/* ── Storage ─────────────────────────────────────────────────────────────── */

export interface TOTPCredential {
  id: string;
  label: string;        // e.g. "Google Authenticator"
  app: string;          // 'google' | 'microsoft' | 'duo' | 'okta' | 'authy'
  secret: string;       // base32, encrypted-at-rest in prod (stored plain for demo)
  createdAt: number;
  verified: boolean;
}

const TOTP_KEY = 'nexus-totp-credentials';

function getTotpKey(principalId: string) {
  return `${TOTP_KEY}-${principalId}`;
}

/* ── Supabase sync helper (lazy import to avoid circular deps) ── */
async function syncTotpToSupabase(principalId: string, action: string, cred: TOTPCredential) {
  try {
    const { getSupabase, isSupabaseConfigured } = await import('./supabase');
    if (!isSupabaseConfigured()) return;
    const client = getSupabase();
    if (!client) return;

    if (action === 'add') {
      // Ensure owner profile exists (FK constraint)
      const { data: profileExists } = await client.from('profiles')
        .select('principal_id').eq('principal_id', principalId).maybeSingle();
      if (!profileExists) {
        const session = (() => {
          try { return JSON.parse(localStorage.getItem('nexus-session') ?? 'null'); } catch { return null; }
        })();
        await client.from('profiles').insert({
          principal_id: principalId,
          email: session?.email || 'unknown',
          name: session?.name || 'User',
          role: session?.role || 'individual',
          tier: session?.tier || 'individual',
          is_active: true, mfa_enabled: false, passkeys_count: 0, vault_count: 0,
        });
      }
      const { error } = await client.from('totp_credentials').insert({
        owner_id: principalId,
        label: cred.label,
        app: cred.app,
        secret: cred.secret,
        verified: cred.verified,
      });
      if (error) console.error('[SB] totp add:', error.code, error.message);
    } else if (action === 'verify') {
      // Find by owner + app label and mark verified
      await client.from('totp_credentials')
        .update({ verified: true })
        .eq('owner_id', principalId)
        .eq('secret', cred.secret);
    } else if (action === 'remove') {
      await client.from('totp_credentials')
        .delete()
        .eq('owner_id', principalId)
        .eq('secret', cred.secret);
    }
  } catch { /* non-critical */ }
}

export const totpStorage = {
  getAll(principalId: string): TOTPCredential[] {
    try {
      return JSON.parse(localStorage.getItem(getTotpKey(principalId)) ?? '[]');
    } catch { return []; }
  },
  save(principalId: string, creds: TOTPCredential[]): void {
    try { localStorage.setItem(getTotpKey(principalId), JSON.stringify(creds)); } catch {}
  },
  add(principalId: string, cred: TOTPCredential): void {
    totpStorage.save(principalId, [...totpStorage.getAll(principalId), cred]);
    syncTotpToSupabase(principalId, 'add', cred);
  },
  remove(principalId: string, id: string): void {
    const cred = totpStorage.getAll(principalId).find(c => c.id === id);
    totpStorage.save(principalId, totpStorage.getAll(principalId).filter(c => c.id !== id));
    if (cred) syncTotpToSupabase(principalId, 'remove', cred);
  },
  markVerified(principalId: string, id: string): void {
    const cred = totpStorage.getAll(principalId).find(c => c.id === id);
    totpStorage.save(principalId, totpStorage.getAll(principalId).map(c =>
      c.id === id ? { ...c, verified: true } : c,
    ));
    if (cred) syncTotpToSupabase(principalId, 'verify', { ...cred, verified: true });
  },
};
