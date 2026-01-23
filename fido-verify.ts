import { verifyRegistrationResponse } from '@simplewebauthn/server';
import { isoBase64URL } from '@simplewebauthn/server/helpers';

// FEITIAN SPECIFIC AAGUIDs (The "Secret Sauce")
const HARDWARE_AAGUIDS = [
  '804245fa-d68a-4c22-b541-e77759a1b15e', // Feitian ePass K9
  '85646d6d-f753-48a8-9c42-32a537f10134', // YubiKey 5 NFC
];

export async function verifyWebAuthn(response: any, expectedChallenge: string) {
  // 1. Standard FIDO2 Verification
  const verification = await verifyRegistrationResponse({
    response,
    expectedChallenge,
    expectedOrigin: process.env.NEXT_PUBLIC_ORIGIN || 'https://nexus-identity.xyz',
    expectedRPID: process.env.NEXT_PUBLIC_RP_ID || 'nexus-identity.xyz',
  });

  if (!verification.verified || !verification.registrationInfo) {
    throw new Error('FIDO2 Verification Failed');
  }

  // 2. The "Nexus Logic" - AAGUID Inspection
  // This is where we determine if it's a Hardware Key or TouchID
  const { aaguid } = verification.registrationInfo;
  
  const isHardwareKey = HARDWARE_AAGUIDS.includes(aaguid);
  const riskScore = isHardwareKey ? 0 : 20; // TouchID is good, Key is better.

  // 3. Enforce Policy (The "Veza" angle)
  if (process.env.REQUIRE_HARDWARE_KEY === 'true' && !isHardwareKey) {
    throw new Error('Policy Violation: Hardware Security Key Required for Admin Access');
  }

  return {
    verified: true,
    deviceType: isHardwareKey ? 'hardware_token' : 'platform_authenticator',
    riskScore
  };
}
