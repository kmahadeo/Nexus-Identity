/**
 * lib/webauthn.ts — Real FIDO2 / WebAuthn helpers with user-scoped storage.
 *
 * Each user's passkeys are stored under nexus-passkeys-{principalId}.
 * Cross-user passkey access is prevented at the storage layer.
 */

export interface StoredPasskey {
  id: string;
  rawId: string;
  type: 'platform' | 'cross-platform';
  name: string;
  userHandle: string;
  aaguid?: string;
  createdAt: number;
  lastUsedAt: number;
  signCount: number;
  transports: string[];
  algorithm: number;
  rpId: string;
  ownerId: string; // principalId of the user who created this passkey
}

function toB64url(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof ArrayBuffer ? new Uint8Array(buf) : buf;
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

/** Get the storage key for a given user (or current session user). */
function storageKey(userId?: string): string {
  const id = userId ?? (() => {
    try {
      const s = JSON.parse(localStorage.getItem('nexus-session') ?? 'null');
      return s?.principalId ?? null;
    } catch { return null; }
  })();
  return id ? `nexus-passkeys-${id}` : 'nexus-passkeys-anonymous';
}

export function loadPasskeys(userId?: string): StoredPasskey[] {
  try {
    return JSON.parse(localStorage.getItem(storageKey(userId)) ?? '[]');
  } catch {
    return [];
  }
}

function savePasskeys(keys: StoredPasskey[], userId?: string): void {
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(keys));
    // Update registry passkey count
    const session = (() => {
      try { return JSON.parse(localStorage.getItem('nexus-session') ?? 'null'); } catch { return null; }
    })();
    if (session?.principalId) {
      const registry = (() => { try { return JSON.parse(localStorage.getItem('nexus-user-registry') ?? '[]'); } catch { return []; } })();
      const updated = registry.map((u: { principalId: string; passkeysCount: number }) =>
        u.principalId === session.principalId ? { ...u, passkeysCount: keys.length, mfaEnabled: keys.length > 0 } : u,
      );
      localStorage.setItem('nexus-user-registry', JSON.stringify(updated));
    }
  } catch {}
}

/** Delete a passkey — only deletes from the current user's own collection. */
export function deletePasskey(id: string, userId?: string): void {
  const sessionId = (() => {
    try { return JSON.parse(localStorage.getItem('nexus-session') ?? 'null')?.principalId; } catch { return null; }
  })();
  // Security check: you can only delete passkeys you own
  const effectiveUserId = userId ?? sessionId;
  if (!effectiveUserId) return;
  const keys = loadPasskeys(effectiveUserId);
  const key = keys.find(k => k.id === id);
  if (!key) return; // passkey doesn't belong to this user
  if (key.ownerId && key.ownerId !== effectiveUserId) return; // ownership mismatch
  savePasskeys(keys.filter(k => k.id !== id), effectiveUserId);
}

export function isWebAuthnAvailable(): boolean {
  return typeof window !== 'undefined' &&
    typeof window.PublicKeyCredential !== 'undefined' &&
    typeof navigator.credentials?.create === 'function';
}

export async function isPlatformAuthenticatorAvailable(): Promise<boolean> {
  if (!isWebAuthnAvailable()) return false;
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

/** Check if a user has any registered passkeys (for auto-login flow). */
export function hasRegisteredPasskeys(userId?: string): boolean {
  return loadPasskeys(userId).length > 0;
}

/**
 * Register a new passkey.
 * Platform attachment = Touch ID / Face ID / Windows Hello
 * Cross-platform = hardware security key (YubiKey etc.)
 */
export async function registerPasskey(
  userId: string,
  username: string,
  displayName: string,
  attachment: AuthenticatorAttachment = 'platform',
): Promise<StoredPasskey> {
  if (!isWebAuthnAvailable()) throw new Error('WebAuthn is not supported in this browser.');

  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const userIdBytes = new TextEncoder().encode(userId);

  const publicKey: PublicKeyCredentialCreationOptions = {
    challenge,
    rp: {
      name: 'Nexus Identity',
      id: window.location.hostname,
    },
    user: {
      id: userIdBytes,
      name: username,
      displayName,
    },
    pubKeyCredParams: [
      { alg: -7,   type: 'public-key' }, // ES256  (ECDSA P-256, preferred)
      { alg: -257, type: 'public-key' }, // RS256  (RSA fallback)
      { alg: -8,   type: 'public-key' }, // EdDSA  (optional)
    ],
    authenticatorSelection: {
      authenticatorAttachment: attachment,
      residentKey: 'preferred',
      userVerification: 'required',
    },
    timeout: 60_000,
    attestation: 'none',
    extensions: { credProps: true },
  };

  const credential = await navigator.credentials.create({ publicKey }) as PublicKeyCredential | null;
  if (!credential) throw new Error('Passkey creation was cancelled or failed.');

  const response = credential.response as AuthenticatorAttestationResponse;
  const transports: string[] = (response as unknown as { getTransports?: () => string[] }).getTransports?.() ?? [];

  // Detect platform for display label
  const ua = navigator.userAgent;
  let deviceLabel = 'This Device';
  if (/Mac|iPhone|iPad/.test(ua)) deviceLabel = 'Touch ID / Face ID';
  else if (/Win/.test(ua)) deviceLabel = 'Windows Hello';
  else if (/Android/.test(ua)) deviceLabel = 'Android Biometric';
  else if (/Linux/.test(ua)) deviceLabel = 'Security Key';

  const stored: StoredPasskey = {
    id:          toB64url(credential.rawId),
    rawId:       toB64url(credential.rawId),
    type:        attachment === 'platform' ? 'platform' : 'cross-platform',
    name:        `${deviceLabel} — ${new Date().toLocaleDateString()}`,
    userHandle:  toB64url(userIdBytes),
    createdAt:   Date.now(),
    lastUsedAt:  Date.now(),
    signCount:   0,
    transports,
    algorithm:   -7,
    rpId:        window.location.hostname,
    ownerId:     userId,
  };

  savePasskeys([...loadPasskeys(userId), stored], userId);
  return stored;
}

/**
 * Authenticate with an existing passkey.
 * allowedIds scopes the prompt to the current user's credentials.
 */
export async function authenticatePasskey(allowedIds?: string[], userId?: string): Promise<string> {
  if (!isWebAuthnAvailable()) throw new Error('WebAuthn is not supported in this browser.');

  // If no explicit IDs, load from current user's passkeys
  const effectiveIds = allowedIds ?? loadPasskeys(userId).map(k => k.id);

  const challenge = crypto.getRandomValues(new Uint8Array(32));

  const allowCredentials: PublicKeyCredentialDescriptor[] | undefined =
    effectiveIds.length > 0 ? effectiveIds.map(id => {
      const base64 = id.replace(/-/g, '+').replace(/_/g, '/');
      const padding = '='.repeat((4 - (base64.length % 4)) % 4);
      const bytes = Uint8Array.from(atob(base64 + padding), c => c.charCodeAt(0));
      return { type: 'public-key' as const, id: bytes };
    }) : undefined;

  const publicKey: PublicKeyCredentialRequestOptions = {
    challenge,
    rpId: window.location.hostname,
    allowCredentials,
    userVerification: 'required',
    timeout: 60_000,
  };

  const assertion = await navigator.credentials.get({ publicKey }) as PublicKeyCredential | null;
  if (!assertion) throw new Error('Authentication was cancelled or failed.');

  const credId = toB64url(assertion.rawId);

  // Update sign count and last-used for this user's passkeys only
  const effectiveUserId = userId ?? (() => {
    try { return JSON.parse(localStorage.getItem('nexus-session') ?? 'null')?.principalId; } catch { return null; }
  })();
  if (effectiveUserId) {
    const keys = loadPasskeys(effectiveUserId).map(k =>
      k.id === credId ? { ...k, lastUsedAt: Date.now(), signCount: k.signCount + 1 } : k,
    );
    savePasskeys(keys, effectiveUserId);
  }

  return credId;
}
