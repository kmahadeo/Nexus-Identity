/**
 * lib/verifiableCredentials.ts — Browser-native W3C Verifiable Credentials
 * Uses Web Crypto HMAC-SHA256 for signing and verification.
 */

/* ── Types ──────────────────────────────────────────────────────────────── */

export interface VerifiableCredential {
  '@context': string[];
  id: string;
  type: string[];
  issuer: { id: string; name: string };
  issuanceDate: string;
  expirationDate: string;
  credentialSubject: {
    id: string;
    name: string;
    email: string;
    [key: string]: any;
  };
  proof: {
    type: string;
    created: string;
    proofPurpose: string;
    verificationMethod: string;
    signature: string;
  };
}

export type CredentialStatus = 'active' | 'revoked' | 'expired';

export interface CredentialType {
  id: string;
  label: string;
  description: string;
  defaultClaims: string[];
}

/* ── Constants ──────────────────────────────────────────────────────────── */

const STORAGE_KEY = 'nexus-verifiable-credentials';
const REVOKED_KEY = 'nexus-revoked-credentials';
const HMAC_SECRET = 'nexus-vc-hmac-secret-2026';

/* ── Credential Types ───────────────────────────────────────────────────── */

const CREDENTIAL_TYPES: CredentialType[] = [
  {
    id: 'IdentityVerification',
    label: 'Identity Verification',
    description: 'Verifies the holder\'s real-world identity',
    defaultClaims: ['verificationLevel', 'verifiedAt', 'jurisdiction'],
  },
  {
    id: 'EmailVerification',
    label: 'Email Verification',
    description: 'Confirms ownership of an email address',
    defaultClaims: ['emailVerified', 'verifiedAt'],
  },
  {
    id: 'OrganizationMembership',
    label: 'Organization Membership',
    description: 'Attests membership in an organization',
    defaultClaims: ['organization', 'role', 'department', 'memberSince'],
  },
  {
    id: 'SecurityClearance',
    label: 'Security Clearance',
    description: 'Certifies a level of security clearance',
    defaultClaims: ['clearanceLevel', 'issuingAuthority', 'validUntil'],
  },
  {
    id: 'DeveloperAccess',
    label: 'Developer Access',
    description: 'Grants developer-level API and system access',
    defaultClaims: ['accessLevel', 'scopes', 'environment'],
  },
];

export function getCredentialTypes(): CredentialType[] {
  return CREDENTIAL_TYPES;
}

/* ── Crypto helpers (Web Crypto HMAC-SHA256) ────────────────────────────── */

async function getHmacKey(): Promise<CryptoKey> {
  const enc = new TextEncoder();
  return crypto.subtle.importKey(
    'raw',
    enc.encode(HMAC_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

async function sign(payload: string): Promise<string> {
  const key = await getHmacKey();
  const enc = new TextEncoder();
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(payload));
  return Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

async function verify(payload: string, signature: string): Promise<boolean> {
  const key = await getHmacKey();
  const enc = new TextEncoder();
  const sigBytes = new Uint8Array(
    signature.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)),
  );
  return crypto.subtle.verify('HMAC', key, sigBytes, enc.encode(payload));
}

function canonicalPayload(vc: VerifiableCredential): string {
  // Deterministic serialisation of everything except the proof
  const { proof, ...rest } = vc;
  return JSON.stringify(rest, Object.keys(rest).sort());
}

/* ── Storage helpers ────────────────────────────────────────────────────── */

function loadCredentials(): VerifiableCredential[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
  } catch {
    return [];
  }
}

function saveCredentials(vcs: VerifiableCredential[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(vcs));
}

function loadRevoked(): string[] {
  try {
    return JSON.parse(localStorage.getItem(REVOKED_KEY) ?? '[]');
  } catch {
    return [];
  }
}

function saveRevoked(ids: string[]): void {
  localStorage.setItem(REVOKED_KEY, JSON.stringify(ids));
}

/* ── Public API ─────────────────────────────────────────────────────────── */

export async function issueCredential(
  subject: { id: string; name: string; email: string },
  type: string,
  claims: Record<string, any>,
): Promise<VerifiableCredential> {
  const id = `urn:uuid:${crypto.randomUUID()}`;
  const now = new Date();
  const expiration = new Date(now);
  expiration.setFullYear(expiration.getFullYear() + 1);

  const vc: VerifiableCredential = {
    '@context': [
      'https://www.w3.org/2018/credentials/v1',
      'https://www.w3.org/2018/credentials/examples/v1',
    ],
    id,
    type: ['VerifiableCredential', type],
    issuer: {
      id: subject.id.startsWith('did:') ? subject.id : `did:nexus:${subject.id}`,
      name: 'Nexus Identity Platform',
    },
    issuanceDate: now.toISOString(),
    expirationDate: expiration.toISOString(),
    credentialSubject: {
      id: subject.id.startsWith('did:') ? subject.id : `did:nexus:${subject.id}`,
      name: subject.name,
      email: subject.email,
      ...claims,
    },
    proof: {
      type: 'HmacSha256Signature2024',
      created: now.toISOString(),
      proofPurpose: 'assertionMethod',
      verificationMethod: `did:nexus:${subject.id}#keys-1`,
      signature: '', // placeholder
    },
  };

  // Sign
  const payload = canonicalPayload(vc);
  vc.proof.signature = await sign(payload);

  // Persist
  const all = loadCredentials();
  all.push(vc);
  saveCredentials(all);

  return vc;
}

export async function verifyCredential(
  vc: VerifiableCredential,
): Promise<{ valid: boolean; reason?: string }> {
  // Check revocation
  const revoked = loadRevoked();
  if (revoked.includes(vc.id)) {
    return { valid: false, reason: 'Credential has been revoked' };
  }

  // Check expiration
  if (new Date(vc.expirationDate) < new Date()) {
    return { valid: false, reason: 'Credential has expired' };
  }

  // Verify signature
  const payload = canonicalPayload(vc);
  const isValid = await verify(payload, vc.proof.signature);
  if (!isValid) {
    return { valid: false, reason: 'Invalid signature' };
  }

  return { valid: true };
}

export function revokeCredential(id: string): void {
  const revoked = loadRevoked();
  if (!revoked.includes(id)) {
    revoked.push(id);
    saveRevoked(revoked);
  }
}

export function getIssuedCredentials(): VerifiableCredential[] {
  return loadCredentials();
}

export function getCredentialStatus(vc: VerifiableCredential): CredentialStatus {
  const revoked = loadRevoked();
  if (revoked.includes(vc.id)) return 'revoked';
  if (new Date(vc.expirationDate) < new Date()) return 'expired';
  return 'active';
}

export function deleteCredential(id: string): void {
  const all = loadCredentials().filter(vc => vc.id !== id);
  saveCredentials(all);
}
