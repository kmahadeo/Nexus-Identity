// THE IDENTITY MODEL
// We map Users -> Permissions -> Resources (Like Veza)

export type UserRole = 'admin' | 'developer' | 'viewer';

export interface IdentityProfile {
  id: string; // DID (Decentralized ID) or UUID
  email: string;
  riskScore: number; // Dynamic score updated by Security Advisor
  mfaMethods: Authenticator[];
  
  // The "Graph" Links
  accessPolicies: PolicyReference[];
  teams: TeamReference[];
}

export interface Authenticator {
  credentialID: string;
  transports: ('usb' | 'nfc' | 'ble' | 'internal')[]; // How did they connect?
  aaguid: string; // The hardware identifier
  lastUsed: Date;
  status: 'active' | 'revoked' | 'compromised';
}

export interface VaultEntry {
  id: string;
  resourceName: string; // e.g., "AWS Prod"
  
  // The "Authorization" Layer (Veza Style)
  // We don't just store the password; we store WHO can see it.
  accessControl: {
    allowedTeams: string[];
    requireMFA: boolean;
    autoRotate: boolean;
  };

  encryptedBlob: string; // AES-256-GCM
}
