const RP_NAME = 'Nexus Identity';
const RP_ID = window.location.hostname;

function bufferToBase64url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let str = '';
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlToBuffer(base64url: string): ArrayBuffer {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

export function isWebAuthnSupported(): boolean {
  return typeof window !== 'undefined' && !!window.PublicKeyCredential;
}

export async function isPlatformAuthenticatorAvailable(): Promise<boolean> {
  if (!isWebAuthnSupported()) return false;
  return PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
}

export interface PasskeyResult {
  credentialId: string;
  publicKeyHint: string;
  deviceName: string;
  transports: string[];
}

export async function createPasskey(
  userId: string,
  userName: string,
  existingCredentialIds?: string[],
): Promise<PasskeyResult> {
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const userIdBuffer = new TextEncoder().encode(userId);

  // Build excludeCredentials to prevent duplicate registrations on the same authenticator
  const excludeCredentials: PublicKeyCredentialDescriptor[] = (existingCredentialIds ?? []).map(id => ({
    id: base64urlToBuffer(id),
    type: 'public-key' as const,
    transports: ['internal'] as AuthenticatorTransport[],
  }));

  let credential: PublicKeyCredential | null;
  try {
    credential = (await navigator.credentials.create({
      publicKey: {
        rp: { name: RP_NAME, id: RP_ID },
        user: {
          id: userIdBuffer,
          name: userName,
          displayName: userName,
        },
        challenge,
        pubKeyCredParams: [
          { alg: -7, type: 'public-key' },   // ES256
          { alg: -257, type: 'public-key' },  // RS256
        ],
        excludeCredentials,
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          residentKey: 'preferred',
          userVerification: 'preferred',
        },
        timeout: 60000,
        attestation: 'none',
      },
    })) as PublicKeyCredential | null;
  } catch (err: any) {
    if (err?.name === 'InvalidStateError') {
      throw new Error('A passkey already exists on this device');
    }
    throw err;
  }

  if (!credential) throw new Error('Passkey creation cancelled');

  const response = credential.response as AuthenticatorAttestationResponse;
  const transports = response.getTransports?.() || [];

  return {
    credentialId: bufferToBase64url(credential.rawId),
    publicKeyHint: bufferToBase64url(response.getPublicKey?.() || new ArrayBuffer(0)),
    deviceName: detectDeviceName(),
    transports,
  };
}

export async function authenticateWithPasskey(
  allowCredentialIds?: string[],
): Promise<{ credentialId: string; success: boolean }> {
  const challenge = crypto.getRandomValues(new Uint8Array(32));

  const allowCredentials = allowCredentialIds?.map((id) => ({
    id: base64urlToBuffer(id),
    type: 'public-key' as const,
  }));

  const assertion = (await navigator.credentials.get({
    publicKey: {
      challenge,
      rpId: RP_ID,
      allowCredentials,
      userVerification: 'preferred',
      timeout: 60000,
    },
  })) as PublicKeyCredential | null;

  if (!assertion) throw new Error('Authentication cancelled');

  return {
    credentialId: bufferToBase64url(assertion.rawId),
    success: true,
  };
}

function detectDeviceName(): string {
  const ua = navigator.userAgent;
  if (/Macintosh/.test(ua)) return 'macOS';
  if (/Windows/.test(ua)) return 'Windows';
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua)) return 'iPad';
  if (/Android/.test(ua)) return 'Android';
  if (/Linux/.test(ua)) return 'Linux';
  return 'Unknown Device';
}
