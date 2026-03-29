import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

export type TenantTier = 'individual' | 'smb' | 'enterprise';

export interface TenantConfig {
  tier: TenantTier;
  label: string;
  accentColor: string; // CSS color for aurora accents
  accentHue: number;
  features: {
    teamManagement: boolean;
    roleBasedAccess: boolean;
    auditLogging: boolean;
    policyEnforcement: boolean;
    ssoIntegrations: boolean;
    ipWhitelisting: boolean;
    sessionTimeouts: boolean;
    sharedVaults: boolean;
    developerPortal: boolean;
    complianceMonitoring: boolean;
  };
  maxTeamMembers: number;
  roles: string[];
}

const TIER_CONFIGS: Record<TenantTier, TenantConfig> = {
  individual: {
    tier: 'individual',
    label: 'Individual',
    accentColor: 'cyan',
    accentHue: 185,
    features: {
      teamManagement: false,
      roleBasedAccess: false,
      auditLogging: false,
      policyEnforcement: false,
      ssoIntegrations: false,
      ipWhitelisting: false,
      sessionTimeouts: false,
      sharedVaults: false,
      developerPortal: false,
      complianceMonitoring: false,
    },
    maxTeamMembers: 1,
    roles: ['owner'],
  },
  smb: {
    tier: 'smb',
    label: 'SMB',
    accentColor: 'amber',
    accentHue: 38,
    features: {
      teamManagement: true,
      roleBasedAccess: true,
      auditLogging: true,
      policyEnforcement: false,
      ssoIntegrations: false,
      ipWhitelisting: false,
      sessionTimeouts: true,
      sharedVaults: true,
      developerPortal: false,
      complianceMonitoring: false,
    },
    maxTeamMembers: 25,
    roles: ['admin', 'editor', 'viewer'],
  },
  enterprise: {
    tier: 'enterprise',
    label: 'Enterprise',
    accentColor: 'violet',
    accentHue: 270,
    features: {
      teamManagement: true,
      roleBasedAccess: true,
      auditLogging: true,
      policyEnforcement: true,
      ssoIntegrations: true,
      ipWhitelisting: true,
      sessionTimeouts: true,
      sharedVaults: true,
      developerPortal: true,
      complianceMonitoring: true,
    },
    maxTeamMembers: -1, // unlimited
    roles: ['admin', 'editor', 'viewer', 'auditor', 'security-admin'],
  },
};

interface TenantContextValue {
  tier: TenantTier;
  config: TenantConfig;
  setTier: (tier: TenantTier) => void;
  hasFeature: (feature: keyof TenantConfig['features']) => boolean;
}

const TenantContext = createContext<TenantContextValue | null>(null);

export function TenantProvider({ children }: { children: ReactNode }) {
  const [tier, setTierState] = useState<TenantTier>(() => {
    try {
      // Prefer tier from session (set during role selection)
      const session = localStorage.getItem('nexus-session');
      if (session) {
        const parsed = JSON.parse(session);
        if (parsed?.tier && (parsed.tier === 'individual' || parsed.tier === 'smb' || parsed.tier === 'enterprise')) {
          return parsed.tier as TenantTier;
        }
      }
      const stored = localStorage.getItem('nexus-tenant-tier');
      if (stored && (stored === 'individual' || stored === 'smb' || stored === 'enterprise')) {
        return stored as TenantTier;
      }
    } catch {}
    return 'individual';
  });

  const setTier = useCallback((newTier: TenantTier) => {
    setTierState(newTier);
    try {
      localStorage.setItem('nexus-tenant-tier', newTier);
    } catch {}
  }, []);

  const config = TIER_CONFIGS[tier];

  const hasFeature = useCallback(
    (feature: keyof TenantConfig['features']) => config.features[feature],
    [config]
  );

  return (
    <TenantContext.Provider value={{ tier, config, setTier, hasFeature }}>
      {children}
    </TenantContext.Provider>
  );
}

export function useTenant() {
  const ctx = useContext(TenantContext);
  if (!ctx) throw new Error('useTenant must be used within TenantProvider');
  return ctx;
}

export { TIER_CONFIGS };
