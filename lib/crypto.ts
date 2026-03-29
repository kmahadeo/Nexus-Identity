/**
 * lib/crypto.ts — Real AES-256-GCM encryption using the Web Crypto API.
 * Key derivation: PBKDF2 (SHA-256, 310 000 iterations) from a master password.
 * All output is base64url-encoded so it is safe to store in localStorage.
 */

const enc = new TextEncoder();
const dec = new TextDecoder();

function toB64(buf: Uint8Array | ArrayBuffer): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function fromB64(b64: string): Uint8Array {
  const s = b64.replace(/-/g, '+').replace(/_/g, '/');
  const padded = s + '='.repeat((4 - (s.length % 4)) % 4);
  return Uint8Array.from(atob(padded), c => c.charCodeAt(0));
}

/** Derive an AES-256-GCM CryptoKey from a password + salt using PBKDF2. */
async function deriveKey(password: string, saltInput: Uint8Array): Promise<CryptoKey> {
  // Copy into a concrete ArrayBuffer to satisfy strict BufferSource typing
  const salt = new Uint8Array(saltInput).buffer as ArrayBuffer;
  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(password), 'PBKDF2', false, ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 310_000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/**
 * Encrypt `plaintext` with the given master password.
 * Returns a `"<salt>.<iv>.<ciphertext>"` string, all base64url.
 */
export async function encrypt(plaintext: string, password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv   = crypto.getRandomValues(new Uint8Array(12));
  const key  = await deriveKey(password, salt);
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc.encode(plaintext),
  );
  return `${toB64(salt)}.${toB64(iv)}.${toB64(cipher)}`;
}

/**
 * Decrypt a payload produced by `encrypt()`.
 * Throws DOMException if the password is wrong (authentication tag mismatch).
 */
export async function decrypt(payload: string, password: string): Promise<string> {
  const [s, i, c] = payload.split('.');
  const salt   = fromB64(s);
  const iv     = fromB64(i);
  const cipher = fromB64(c);
  const key    = await deriveKey(password, salt);
  const plain  = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv.buffer.slice(0) as ArrayBuffer }, key, cipher.buffer.slice(0) as ArrayBuffer);
  return dec.decode(plain);
}

/** Generate a cryptographically random password of given length. */
export function generateSecurePassword(
  length = 24,
  opts = { upper: true, lower: true, digits: true, symbols: true },
): string {
  const upper   = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lower   = 'abcdefghijklmnopqrstuvwxyz';
  const digits  = '0123456789';
  const symbols = '!@#$%^&*()-_=+[]{}|;:,.<>?';

  let chars = '';
  const required: string[] = [];
  if (opts.upper)   { chars += upper;   required.push(upper[Math.floor(Math.random() * upper.length)]); }
  if (opts.lower)   { chars += lower;   required.push(lower[Math.floor(Math.random() * lower.length)]); }
  if (opts.digits)  { chars += digits;  required.push(digits[Math.floor(Math.random() * digits.length)]); }
  if (opts.symbols) { chars += symbols; required.push(symbols[Math.floor(Math.random() * symbols.length)]); }

  const arr = new Uint32Array(length);
  crypto.getRandomValues(arr);
  const rest = Array.from(arr).map(n => chars[n % chars.length]);
  const all  = [...required, ...rest.slice(required.length)];

  // Fisher-Yates shuffle
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [all[i], all[j]] = [all[j], all[i]];
  }
  return all.join('');
}

/** SHA-256 hash of a string — returned as hex. */
export async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Analyse password strength — returns 0-100 score + label. */
export function analyzePassword(password: string): { score: number; label: 'weak' | 'fair' | 'good' | 'strong' | 'excellent' } {
  let score = 0;
  const len = password.length;
  if (len >= 8)  score += 10;
  if (len >= 12) score += 15;
  if (len >= 16) score += 15;
  if (len >= 20) score += 10;
  if (/[A-Z]/.test(password)) score += 10;
  if (/[a-z]/.test(password)) score += 10;
  if (/[0-9]/.test(password)) score += 10;
  if (/[^A-Za-z0-9]/.test(password)) score += 20;
  // penalise common patterns
  if (/(.)\1{2,}/.test(password)) score -= 10;
  if (/^[a-zA-Z]+$/.test(password)) score -= 5;
  score = Math.max(0, Math.min(100, score));
  const label =
    score >= 90 ? 'excellent' :
    score >= 70 ? 'strong' :
    score >= 50 ? 'good' :
    score >= 30 ? 'fair' : 'weak';
  return { score, label };
}
