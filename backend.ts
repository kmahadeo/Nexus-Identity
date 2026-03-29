// Type stubs matching what the feature components actually use

export interface UserProfile {
  name: string;
  email: string;
  createdAt: bigint;
  lastLogin: bigint;
}

export interface VaultEntry {
  id: string;
  name: string;       // display name (alias for title in some views)
  title: string;
  username: string;
  password: string;
  url: string;
  category: string;
  tags: string[];
  createdAt: bigint;
  updatedAt: bigint;
  notes: string;
  encryptedData?: string;
}

export interface ActivityEvent {
  id: string;
  action: string;
  details: string;
  timestamp: bigint;
  ipAddress: string;
  deviceName: string;
}

export interface UserDashboardData {
  totalCredentials: number;
  weakPasswords: number;
  reusedPasswords: number;
  breachedAccounts: number;
  securityScore: number;
  lastScanTime: bigint;
  activeDevices: number;
  passkeysCount: number;
  recentActivity: ActivityEvent[];
  recommendations?: SecurityRecommendation[];
}

export interface SecurityRecommendation {
  id: string;
  title: string;
  description: string;
  message?: string;      // alias used in some components
  severity: 'low' | 'medium' | 'high' | 'critical';
  priority?: 'low' | 'medium' | 'high' | 'critical'; // alias for severity
  category: string;
  actionable: boolean;
  createdAt: bigint;
}

export interface Team {
  id: string;
  name: string;
  members: TeamMember[];
  createdAt: bigint;
}

export interface TeamMember {
  principalId: string;
  principal?: string;  // legacy alias
  name: string;
  email: string;
  role: string;
  joinedAt: bigint;
}

export interface SharedVaultEntry {
  id: string;
  name: string;
  title: string;
  username: string;
  password: string;
  url: string;
  category: string;
  tags: string[];
  createdAt: bigint;
  updatedAt: bigint;
  notes: string;
  encryptedData?: string;
  entry?: VaultEntry;   // nested entry reference used in some components
  sharedWith: string[];
  permissions: string[];
  sharedAt: bigint;
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
