import type { Principal } from '@dfinity/principal';

export interface UserProfile {
  name: string;
  email: string;
  tier: string; // "individual" | "smb" | "enterprise"
  createdAt: bigint;
  lastLogin: bigint;
}

export interface VaultEntry {
  id: string;
  name: string;
  category: string;
  encryptedData: string;
  createdAt: bigint;
  updatedAt: bigint;
}

export interface ActivityLogEntry {
  timestamp: bigint;
  action: string;
  details: string;
}

export interface SecurityRecommendation {
  id: string;
  message: string;
  priority: bigint;
}

export interface UserDashboardData {
  securityScore: bigint;
  recentActivity: ActivityLogEntry[];
  recommendations: SecurityRecommendation[];
}

export interface TeamMember {
  principal: Principal;
  role: string;
  addedAt: bigint;
}

export interface Team {
  id: string;
  name: string;
  owner: Principal;
  members: TeamMember[];
  createdAt: bigint;
}

export interface SharedVaultEntry {
  entry: VaultEntry;
  sharedWith: Principal[];
  permissions: string[];
  sharedAt: bigint;
}

export interface PasskeyCredential {
  credentialId: string;
  publicKeyHint: string;
  deviceName: string;
  createdAt: bigint;
  lastUsed: bigint;
  transports: string[];
}

export interface AIContext {
  vaultHealth: string;
  authEvents: string;
  deviceData: string;
}

export interface AIResponse {
  advice: string;
  riskScore: bigint;
  confidence: bigint;
}

export interface NexusIdentityActor {
  initializeAccessControl: () => Promise<void>;
  getCallerUserRole: () => Promise<string>;
  isCallerAdmin: () => Promise<boolean>;
  getCallerUserProfile: () => Promise<UserProfile | null>;
  getUserProfile: (user: Principal) => Promise<UserProfile | null>;
  saveCallerUserProfile: (profile: UserProfile) => Promise<void>;
  addVaultEntry: (entry: VaultEntry) => Promise<void>;
  getVaultEntries: () => Promise<VaultEntry[]>;
  deleteVaultEntry: (entryId: string) => Promise<void>;
  logActivity: (action: string, details: string) => Promise<void>;
  getRecentActivity: () => Promise<ActivityLogEntry[]>;
  addRecommendation: (rec: SecurityRecommendation) => Promise<void>;
  getRecommendations: () => Promise<SecurityRecommendation[]>;
  getDashboardData: () => Promise<UserDashboardData>;
  createTeam: (name: string) => Promise<string>;
  getTeams: () => Promise<Team[]>;
  addTeamMember: (teamId: string, member: TeamMember) => Promise<void>;
  shareVaultEntry: (entry: VaultEntry, sharedWith: Principal[], permissions: string[]) => Promise<void>;
  getSharedVaultEntries: () => Promise<SharedVaultEntry[]>;
  addPasskeyCredential: (credential: PasskeyCredential) => Promise<void>;
  getPasskeyCredentials: () => Promise<PasskeyCredential[]>;
  deletePasskeyCredential: (credentialId: string) => Promise<void>;
  getPasskeyCount: () => Promise<bigint>;
  generateInviteCode: () => Promise<string>;
  getAIRecommendations: (context: AIContext) => Promise<AIResponse>;
  makeGetOutcall: (url: string) => Promise<string>;
}
