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

/**
 * Extract the AAGUID from an AuthenticatorAttestationResponse.
 * The authenticator data contains the AAGUID at bytes 37-52.
 * Returns a formatted UUID string, or undefined if extraction fails.
 */
export function extractAAGUID(response: AuthenticatorAttestationResponse): string | undefined {
  try {
    const authData = new Uint8Array(response.getAuthenticatorData());
    if (authData.length < 53) return undefined;

    // AAGUID is at bytes 37-52 (16 bytes)
    const aaguidBytes = authData.slice(37, 53);

    // Check if all zeros (no AAGUID provided)
    if (aaguidBytes.every(b => b === 0)) return undefined;

    // Format as UUID: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
    const hex = Array.from(aaguidBytes).map(b => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
  } catch {
    return undefined;
  }
}

/**
 * Auto-register a cross-platform authenticator (hardware key) in the hardware key inventory.
 */
function autoRegisterHardwareKey(
  credentialId: string,
  aaguid: string | undefined,
  userId: string,
  displayName: string,
  email: string,
): void {
  try {
    const HW_KEY = 'nexus-hardware-keys';
    const keys = JSON.parse(localStorage.getItem(HW_KEY) ?? '[]');

    // Don't duplicate if credentialId already exists
    if (keys.some((k: { credentialId?: string }) => k.credentialId === credentialId)) return;

    // Comprehensive AAGUID database for hardware key identification
    const KNOWN_AAGUIDS: Record<string, { model: string; manufacturer: string }> = {
      // Yubico YubiKey 5 Series
      'cb69481e-8ff7-4039-93ec-0a2729a154a8': { model: 'YubiKey 5 NFC', manufacturer: 'yubico' },
      'c5ef55ff-ad9a-4b9f-b580-adebafe026d0': { model: 'YubiKey 5C Lightning', manufacturer: 'yubico' },
      'ee882879-721c-4913-9775-3dfcce97072a': { model: 'YubiKey 5 USB-A', manufacturer: 'yubico' },
      '73bb0cd4-e502-49b8-9c6f-b59445bf720b': { model: 'YubiKey 5C', manufacturer: 'yubico' },
      'c1f9a0bc-1dd2-404a-b27f-8e29047a43fd': { model: 'YubiKey 5C NFC', manufacturer: 'yubico' },
      'd8522d9f-575b-4866-88a9-ba99fa02f35b': { model: 'YubiKey Bio', manufacturer: 'yubico' },
      '20ac7a17-c814-4833-93fe-539f0d5e3389': { model: 'YubiKey 5 Enterprise', manufacturer: 'yubico' },
      '0bb43545-fd2c-4185-87dd-feb0b2916ace': { model: 'Security Key by Yubico', manufacturer: 'yubico' },
      // Google Titan
      'b7d3f68e-88a6-471e-9ecf-2df26d041ede': { model: 'Titan Security Key (USB)', manufacturer: 'google' },
      '6d44ba9b-f6ec-2e49-b930-0c8fe920cb73': { model: 'Titan Security Key (NFC)', manufacturer: 'google' },
      '42b4fb4a-2866-43b2-9bf7-6c6669c2e5d3': { model: 'Titan Security Key (BLE)', manufacturer: 'google' },
      '17290f1e-c212-34d0-1423-365d729f09d9': { model: 'Google Passkey', manufacturer: 'google' },
      // Feitian
      '12ded745-4bed-47d4-abaa-e713f51d6393': { model: 'Feitian A4B', manufacturer: 'feitian' },
      '77010bd7-212a-4fc9-b236-d2ca5e9d4084': { model: 'Feitian BioPass', manufacturer: 'feitian' },
      // SoloKeys
      '8876631b-d4a0-427f-5773-0ec71c9e0279': { model: 'Solo 2', manufacturer: 'solokeys' },
      // Apple
      'fbfc3007-154e-4ecc-8c0b-6e020557d7bd': { model: 'iCloud Keychain', manufacturer: 'other' },
      // Windows
      '6028b017-b1d4-4c02-b4b3-afcdafc96bb2': { model: 'Windows Hello', manufacturer: 'other' },
      '9ddd1817-af5a-4672-a2b9-3e3dd95000a9': { model: 'Windows Hello', manufacturer: 'other' },
    };
    const known = aaguid ? KNOWN_AAGUIDS[aaguid] : undefined;

    const hwKey = {
      id: crypto.randomUUID(),
      model: known?.model ?? 'Hardware Security Key',
      manufacturer: known?.manufacturer ?? 'other',
      serialNumber: `AUTO-${Date.now().toString(36).toUpperCase()}`,
      aaguid: aaguid ?? undefined,
      credentialId,
      assignedTo: userId,
      assignedToName: displayName,
      assignedToEmail: email,
      enrolledAt: Date.now(),
      lastUsedAt: null,
      status: 'active',
      protocols: ['fido2', 'u2f'],
    };

    keys.push(hwKey);
    localStorage.setItem(HW_KEY, JSON.stringify(keys));
    syncHardwareKeyToSupabase('add', hwKey);
  } catch(e) { console.error("[SB]", e); }
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

/** Sync passkey operations to Supabase */
async function syncPasskeyToSupabase(action: 'add' | 'delete', passkey: StoredPasskey) {
  try {
    const { getSupabase, isSupabaseConfigured } = await import('./supabase');
    if (!isSupabaseConfigured()) return;
    const client = getSupabase();
    if (!client) return;

    // Ensure owner profile exists (FK constraint)
    if (action === 'add') {
      const { data: profileExists } = await client.from('profiles')
        .select('principal_id').eq('principal_id', passkey.ownerId).maybeSingle();
      if (!profileExists) {
        const session = (() => {
          try { return JSON.parse(localStorage.getItem('nexus-session') ?? 'null'); } catch { return null; }
        })();
        await client.from('profiles').insert({
          principal_id: passkey.ownerId,
          email: session?.email || 'unknown',
          name: session?.name || 'User',
          role: session?.role || 'individual',
          tier: session?.tier || 'individual',
          is_active: true, mfa_enabled: false, passkeys_count: 0, vault_count: 0,
        });
      }

      const { error } = await client.from('passkeys').upsert({
        id: passkey.id,
        owner_id: passkey.ownerId,
        raw_id: passkey.rawId,
        type: passkey.type,
        name: passkey.name,
        user_handle: passkey.userHandle,
        aaguid: passkey.aaguid || null,
        sign_count: passkey.signCount,
        transports: passkey.transports,
        algorithm: passkey.algorithm,
        rp_id: passkey.rpId,
      }, { onConflict: 'id' });
      if (error) console.error('[SB] passkey add:', error.code, error.message, error.details);
    } else if (action === 'delete') {
      await client.from('passkeys').delete().eq('id', passkey.id);
    }
  } catch(e) { console.error("[SB]", e); }
}

/** Sync hardware key operations to Supabase */
async function syncHardwareKeyToSupabase(action: 'add' | 'update', key: Record<string, unknown>) {
  try {
    const { getSupabase, isSupabaseConfigured } = await import('./supabase');
    if (!isSupabaseConfigured()) return;
    const client = getSupabase();
    if (!client) return;

    if (action === 'add') {
      // assigned_to is nullable — hardware keys can exist without a user assignment
      const { error } = await client.from('hardware_keys').insert({
        model: key.model, manufacturer: key.manufacturer,
        serial_number: key.serialNumber, aaguid: key.aaguid || null,
        credential_id: key.credentialId || null,
        assigned_to: key.assignedTo || null,
        assigned_to_name: key.assignedToName || '',
        assigned_to_email: key.assignedToEmail || '',
        status: key.status,
        protocols: key.protocols || ['fido2', 'u2f'],
      });
      if (error) console.error('[SB] hw key add:', error.code, error.message, error.details);
    }
  } catch(e) { console.error("[SB]", e); }
}

/** Rename a passkey — only renames passkeys the current user owns. */
export function renamePasskey(id: string, newName: string, userId?: string): void {
  // Input validation: trim whitespace, strip HTML tags, enforce max length
  let sanitized = newName.trim().replace(/<[^>]*>/g, '');
  if (sanitized.length > 100) sanitized = sanitized.slice(0, 100);
  if (!sanitized) return; // reject empty names

  const sessionId = (() => {
    try { return JSON.parse(localStorage.getItem('nexus-session') ?? 'null')?.principalId; } catch { return null; }
  })();
  const effectiveUserId = userId ?? sessionId;
  if (!effectiveUserId) return;
  const keys = loadPasskeys(effectiveUserId);
  const key = keys.find(k => k.id === id);
  if (!key) return;
  if (key.ownerId && key.ownerId !== effectiveUserId) return;
  savePasskeys(keys.map(k => k.id === id ? { ...k, name: sanitized } : k), effectiveUserId);
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
  syncPasskeyToSupabase('delete', key);
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

  // Build excludeCredentials from all existing passkeys for this user
  // This tells the browser to reject creation if a credential already exists on this authenticator
  const existingPasskeys = loadPasskeys(userId);
  const excludeCredentials: PublicKeyCredentialDescriptor[] = existingPasskeys.map(pk => {
    const base64 = pk.id.replace(/-/g, '+').replace(/_/g, '/');
    const padding = '='.repeat((4 - (base64.length % 4)) % 4);
    const bytes = Uint8Array.from(atob(base64 + padding), c => c.charCodeAt(0));
    return {
      id: bytes,
      type: 'public-key' as const,
      transports: (pk.transports.length > 0 ? pk.transports : ['internal']) as AuthenticatorTransport[],
    };
  });

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
    excludeCredentials,
    authenticatorSelection: {
      authenticatorAttachment: attachment,
      residentKey: 'preferred',
      userVerification: 'required',
    },
    timeout: 60_000,
    attestation: 'direct', // Request attestation to get AAGUID from hardware keys
    extensions: { credProps: true },
  };

  let credential: PublicKeyCredential | null;
  try {
    credential = await navigator.credentials.create({ publicKey }) as PublicKeyCredential | null;
  } catch (err: any) {
    if (err?.name === 'InvalidStateError') {
      throw new Error('A passkey already exists on this device');
    }
    throw err;
  }
  if (!credential) throw new Error('Passkey creation was cancelled or failed.');

  const response = credential.response as AuthenticatorAttestationResponse;
  const transports: string[] = (response as unknown as { getTransports?: () => string[] }).getTransports?.() ?? [];

  // Extract AAGUID from attestation response
  const aaguid = extractAAGUID(response);

  // Detect platform for display label
  const ua = navigator.userAgent;
  let deviceLabel = 'This Device';
  if (/Mac|iPhone|iPad/.test(ua)) deviceLabel = 'Touch ID / Face ID';
  else if (/Win/.test(ua)) deviceLabel = 'Windows Hello';
  else if (/Android/.test(ua)) deviceLabel = 'Android Biometric';
  else if (/Linux/.test(ua)) deviceLabel = 'Security Key';

  const credId = toB64url(credential.rawId);

  const stored: StoredPasskey = {
    id:          credId,
    rawId:       toB64url(credential.rawId),
    type:        attachment === 'platform' ? 'platform' : 'cross-platform',
    name:        `${deviceLabel} — ${new Date().toLocaleDateString()}`,
    userHandle:  toB64url(userIdBytes),
    aaguid,
    createdAt:   Date.now(),
    lastUsedAt:  Date.now(),
    signCount:   0,
    transports,
    algorithm:   -7,
    rpId:        window.location.hostname,
    ownerId:     userId,
  };

  savePasskeys([...loadPasskeys(userId), stored], userId);
  syncPasskeyToSupabase('add', stored);

  // Auto-register cross-platform authenticators (hardware keys) in the inventory
  // Also register platform keys that have a recognized AAGUID (e.g. Windows Hello, iCloud Keychain)
  if (attachment === 'cross-platform' || (aaguid && aaguid !== undefined)) {
    autoRegisterHardwareKey(credId, aaguid, userId, displayName, username);
  }

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
