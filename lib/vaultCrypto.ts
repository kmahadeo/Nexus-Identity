/**
 * lib/vaultCrypto.ts — Vault-specific encryption layer (passwordless).
 *
 * Encryption is transparent to the user — no master password to remember.
 * The encryption key is derived from the user's principalId + a random
 * session key stored in sessionStorage. Re-authentication is handled by
 * passkeys or TOTP at the gate level, not by a master password.
 */

import { encrypt, decrypt } from './crypto';
import { pqcEncrypt, pqcDecrypt, isLegacyPayload, isPQCPayload } from './pqcCrypto';

const SESSION_VAULT_KEY = '__nexus_vault_session';
const VAULT_VERIFIED_KEY = '__nexus_vault_verified';

/* ── Session-based vault unlock ─────────────────────────────────────── */

/**
 * Mark the vault as verified for this session (after passkey/TOTP check).
 * The verification expires after `ttlMs` (default 30 minutes).
 */
export function markVaultVerified(ttlMs = 30 * 60 * 1000): void {
  const expiresAt = Date.now() + ttlMs;
  sessionStorage.setItem(VAULT_VERIFIED_KEY, String(expiresAt));
}

/** Check if the vault has been verified in the current session window. */
export function isVaultUnlocked(): boolean {
  const raw = sessionStorage.getItem(VAULT_VERIFIED_KEY);
  if (!raw) return false;
  const expiresAt = Number(raw);
  if (Date.now() > expiresAt) {
    // Expired — clear it
    sessionStorage.removeItem(VAULT_VERIFIED_KEY);
    return false;
  }
  return true;
}

/** Lock the vault (clear verification). */
export function lockVault(): void {
  sessionStorage.removeItem(VAULT_VERIFIED_KEY);
  sessionStorage.removeItem(SESSION_VAULT_KEY);
}

/* ── Transparent encryption key ─────────────────────────────────────── */

/**
 * Get or create a session-scoped encryption passphrase.
 * Derived from principalId + a random session key so that:
 *   - Each session gets a unique key
 *   - The key never leaves sessionStorage
 *   - The user never has to remember or type anything
 */
function getSessionPassphrase(principalId: string): string {
  let sessionKey = sessionStorage.getItem(SESSION_VAULT_KEY);
  if (!sessionKey) {
    // Generate a random 256-bit session key
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    sessionKey = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
    sessionStorage.setItem(SESSION_VAULT_KEY, sessionKey);
  }
  return `${principalId}:${sessionKey}`;
}

/** Get the current user's principalId from localStorage session. */
function getCurrentPrincipalId(): string {
  try {
    const s = JSON.parse(localStorage.getItem('nexus-session') ?? 'null');
    return s?.principalId ?? 'anonymous';
  } catch {
    return 'anonymous';
  }
}

/* ── Vault entry encryption ─────────────────────────────────────────── */

/** Encrypt a vault entry's secret fields using the transparent session key. */
export async function encryptVaultSecret(plaintext: string): Promise<string> {
  if (!isVaultUnlocked()) throw new Error('Vault is locked — verify with passkey or TOTP first');
  const passphrase = getSessionPassphrase(getCurrentPrincipalId());
  return encrypt(plaintext, passphrase);
}

/** Decrypt a vault entry's encrypted field. */
export async function decryptVaultSecret(ciphertext: string): Promise<string> {
  if (!isVaultUnlocked()) throw new Error('Vault is locked — verify with passkey or TOTP first');
  const passphrase = getSessionPassphrase(getCurrentPrincipalId());
  return decrypt(ciphertext, passphrase);
}

/**
 * Check if a string looks like an encrypted payload (salt.iv.ciphertext format).
 * Used to distinguish legacy plaintext entries from encrypted ones.
 */
export function isEncryptedPayload(value: string): boolean {
  const parts = value.split('.');
  return parts.length === 3 && parts.every(p => p.length >= 8);
}
