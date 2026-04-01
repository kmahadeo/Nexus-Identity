/**
 * lib/pqcCrypto.ts — Post-Quantum Cryptography Readiness Layer
 *
 * Provides crypto-agile architecture so that when PQC algorithms become
 * available in the Web Crypto API (or via libraries like @noble/post-quantum),
 * they can be plugged in without changing any call-sites.
 *
 * Today this layer wraps AES-256-GCM (which is quantum-safe for symmetric
 * encryption) and tags every encrypted payload with algorithm metadata.
 * The architecture is ready for hybrid KEM + symmetric encryption once
 * FIPS 203 (ML-KEM) support arrives in browsers.
 */

import { encrypt as legacyEncrypt, decrypt as legacyDecrypt } from './crypto';

/* ── Base64url helpers (same as crypto.ts, kept local to avoid coupling) ── */

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

/* ── Algorithm Registry ─────────────────────────────────────────────── */

/** Metadata for a registered crypto algorithm. */
export interface CryptoAlgorithmMeta {
  id: string;
  name: string;
  type: 'symmetric' | 'kem' | 'signature' | 'hash' | 'kdf';
  quantumSafe: boolean;
  standard: string;
  keySize: number;
  description: string;
}

/** Encrypted payload with algorithm metadata for crypto agility. */
export interface PQCEncryptedPayload {
  algorithmId: string;
  version: number;
  salt: string;           // base64url
  iv: string;             // base64url
  ciphertext: string;     // base64url
  kemCiphertext?: string; // present when hybrid PQC KEM is used
  createdAt: number;
}

/** PQC readiness report returned by getPQCReadinessReport(). */
export interface PQCReadinessReport {
  algorithms: CryptoAlgorithmMeta[];
  currentAlgorithm: CryptoAlgorithmMeta;
  quantumSafeCount: number;
  totalCount: number;
  readinessPercent: number;
  dataAtRest: { algorithm: string; quantumSafe: boolean };
  recommendations: string[];
}

/** Current payload format version. Increment when the serialisation changes. */
const PAYLOAD_VERSION = 1;

/** Default algorithm used for new encryptions. */
const CURRENT_ALGORITHM_ID = 'AES-256-GCM';

/**
 * Full algorithm registry. Algorithms that are not yet implemented in the
 * browser are listed with their metadata so the readiness report can
 * reference them and the architecture is ready to plug them in.
 */
const ALGORITHM_REGISTRY: CryptoAlgorithmMeta[] = [
  {
    id: 'AES-256-GCM',
    name: 'AES-256-GCM',
    type: 'symmetric',
    quantumSafe: true,
    standard: 'FIPS 197 / SP 800-38D',
    keySize: 256,
    description: 'Symmetric authenticated encryption. 256-bit keys are considered quantum-safe against Grover\'s algorithm (effectively 128-bit post-quantum security).',
  },
  {
    id: 'PBKDF2-SHA256',
    name: 'PBKDF2 with SHA-256',
    type: 'kdf',
    quantumSafe: true,
    standard: 'SP 800-132',
    keySize: 256,
    description: 'Password-based key derivation. 310,000 iterations with SHA-256.',
  },
  {
    id: 'SHA-256',
    name: 'SHA-256',
    type: 'hash',
    quantumSafe: true,
    standard: 'FIPS 180-4',
    keySize: 256,
    description: 'Cryptographic hash. 256-bit output provides 128-bit post-quantum collision resistance.',
  },
  {
    id: 'ECDSA-P256',
    name: 'ECDSA P-256',
    type: 'signature',
    quantumSafe: false,
    standard: 'FIPS 186-5',
    keySize: 256,
    description: 'Elliptic curve signatures used by WebAuthn passkeys. Vulnerable to quantum attack via Shor\'s algorithm. FIDO Alliance PQC migration is in development.',
  },
  {
    id: 'ML-KEM-768',
    name: 'ML-KEM-768 (Kyber)',
    type: 'kem',
    quantumSafe: true,
    standard: 'FIPS 203',
    keySize: 768,
    description: 'Post-quantum key encapsulation mechanism. Not yet available in Web Crypto API — reserved for future hybrid encryption.',
  },
  {
    id: 'ML-DSA-65',
    name: 'ML-DSA-65 (Dilithium)',
    type: 'signature',
    quantumSafe: true,
    standard: 'FIPS 204',
    keySize: 1952,
    description: 'Post-quantum digital signature. Not yet available in Web Crypto API — reserved for future passkey migration.',
  },
  {
    id: 'SLH-DSA-SHA2-128s',
    name: 'SLH-DSA (SPHINCS+)',
    type: 'signature',
    quantumSafe: true,
    standard: 'FIPS 205',
    keySize: 128,
    description: 'Stateless hash-based post-quantum signature. Not yet available in Web Crypto API.',
  },
];

/* ── Public API ──────────────────────────────────────────────────────── */

/** Returns the full algorithm registry with quantum-safety status. */
export function getAlgorithmRegistry(): CryptoAlgorithmMeta[] {
  return [...ALGORITHM_REGISTRY];
}

/** Returns the currently active encryption algorithm metadata. */
export function getCurrentAlgorithm(): CryptoAlgorithmMeta {
  const algo = ALGORITHM_REGISTRY.find(a => a.id === CURRENT_ALGORITHM_ID);
  if (!algo) throw new Error(`Current algorithm ${CURRENT_ALGORITHM_ID} not found in registry`);
  return algo;
}

/**
 * Encrypt plaintext with algorithm-tagged payload (crypto-agile format).
 *
 * Currently uses AES-256-GCM via PBKDF2 key derivation — the same
 * underlying crypto as the legacy encrypt(), but wraps the output in a
 * structured JSON payload with algorithm metadata. When hybrid PQC
 * becomes available, this function will produce a payload that also
 * includes a KEM ciphertext.
 */
export async function pqcEncrypt(plaintext: string, password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);

  const cipherBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc.encode(plaintext),
  );

  const payload: PQCEncryptedPayload = {
    algorithmId: CURRENT_ALGORITHM_ID,
    version: PAYLOAD_VERSION,
    salt: toB64(salt),
    iv: toB64(iv),
    ciphertext: toB64(cipherBuf),
    createdAt: Date.now(),
  };

  return JSON.stringify(payload);
}

/**
 * Decrypt a PQC-format payload by reading the algorithm ID and dispatching
 * to the correct implementation. Also handles legacy "salt.iv.ciphertext"
 * format by delegating to the original decrypt().
 */
export async function pqcDecrypt(payload: string, password: string): Promise<string> {
  // Legacy format detection: old payloads are "salt.iv.ciphertext" (3 dot-separated base64url strings)
  if (isLegacyPayload(payload)) {
    return legacyDecrypt(payload, password);
  }

  let parsed: PQCEncryptedPayload;
  try {
    parsed = JSON.parse(payload);
  } catch {
    throw new Error('Invalid encrypted payload: not JSON and not legacy format');
  }

  if (!parsed.algorithmId) {
    throw new Error('Invalid PQC payload: missing algorithmId');
  }

  if (!canDecrypt(payload)) {
    throw new Error(`Unsupported algorithm: ${parsed.algorithmId}`);
  }

  // Dispatch based on algorithm ID
  switch (parsed.algorithmId) {
    case 'AES-256-GCM': {
      const salt = fromB64(parsed.salt);
      const iv = fromB64(parsed.iv);
      const cipher = fromB64(parsed.ciphertext);
      const key = await deriveKey(password, salt);
      const plainBuf = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: iv.buffer.slice(0) as ArrayBuffer },
        key,
        cipher.buffer.slice(0) as ArrayBuffer,
      );
      return dec.decode(plainBuf);
    }

    // Future: case 'HYBRID-ML-KEM-768-AES-256-GCM': ...

    default:
      throw new Error(`Algorithm ${parsed.algorithmId} is registered but decryption is not yet implemented`);
  }
}

/**
 * Check if the current system can decrypt a given payload.
 * Returns true for legacy format and for any algorithm with a working implementation.
 */
export function canDecrypt(payload: string): boolean {
  if (isLegacyPayload(payload)) return true;

  try {
    const parsed: PQCEncryptedPayload = JSON.parse(payload);
    // Algorithms we can actually decrypt today
    const supportedAlgorithms = ['AES-256-GCM'];
    return supportedAlgorithms.includes(parsed.algorithmId);
  } catch {
    return false;
  }
}

/**
 * Returns a comprehensive PQC readiness report for the application.
 */
export function getPQCReadinessReport(): PQCReadinessReport {
  const algorithms = getAlgorithmRegistry();
  const currentAlgo = getCurrentAlgorithm();

  // Algorithms actually in use today (symmetric + KDF + hash for vault, ECDSA for passkeys)
  const inUseIds = ['AES-256-GCM', 'PBKDF2-SHA256', 'SHA-256', 'ECDSA-P256'];
  const inUse = algorithms.filter(a => inUseIds.includes(a.id));
  const quantumSafeInUse = inUse.filter(a => a.quantumSafe);

  const readinessPercent = inUse.length > 0
    ? Math.round((quantumSafeInUse.length / inUse.length) * 100)
    : 0;

  const recommendations: string[] = [];

  // Check for non-quantum-safe algorithms in use
  const vulnerable = inUse.filter(a => !a.quantumSafe);
  if (vulnerable.length > 0) {
    for (const algo of vulnerable) {
      if (algo.id === 'ECDSA-P256') {
        recommendations.push(
          `${algo.name}: Used by WebAuthn passkeys. Migration to ML-DSA (FIPS 204) pending FIDO Alliance PQC specification. No user action required — migration will be automatic.`
        );
      } else {
        recommendations.push(
          `${algo.name}: Consider migrating to a quantum-safe alternative when available.`
        );
      }
    }
  }

  if (readinessPercent === 100) {
    recommendations.push('All cryptographic operations use quantum-safe algorithms. No action needed.');
  } else {
    recommendations.push(
      'Nexus Identity uses crypto-agile architecture. When PQC standards are finalized in Web Crypto API, your data will be automatically migrated.'
    );
  }

  return {
    algorithms: inUse,
    currentAlgorithm: currentAlgo,
    quantumSafeCount: quantumSafeInUse.length,
    totalCount: inUse.length,
    readinessPercent,
    dataAtRest: {
      algorithm: currentAlgo.name,
      quantumSafe: currentAlgo.quantumSafe,
    },
    recommendations,
  };
}

/* ── Internal helpers ────────────────────────────────────────────────── */

/**
 * Detect legacy "salt.iv.ciphertext" format from the old encrypt().
 * Legacy payloads are 3 dot-separated base64url strings, NOT JSON.
 */
export function isLegacyPayload(payload: string): boolean {
  if (payload.startsWith('{')) return false;
  const parts = payload.split('.');
  return parts.length === 3 && parts.every(p => p.length >= 8);
}

/**
 * Check if a payload uses the new PQC-tagged format (JSON with algorithmId).
 */
export function isPQCPayload(payload: string): boolean {
  if (!payload.startsWith('{')) return false;
  try {
    const parsed = JSON.parse(payload);
    return typeof parsed.algorithmId === 'string';
  } catch {
    return false;
  }
}

/** Derive an AES-256-GCM CryptoKey from a password + salt using PBKDF2. */
async function deriveKey(password: string, saltInput: Uint8Array): Promise<CryptoKey> {
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
