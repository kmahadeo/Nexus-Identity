import { useState, useCallback } from 'react';
import { useInternetIdentity } from './hooks/useInternetIdentity';
import { useGetCallerUserProfile, useIsCurrentUserAdmin } from './hooks/useQueries';
import { useQueryClient } from '@tanstack/react-query';
import { useTenant } from './TenantContext';
import NexusLogo from './NexusLogo';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  Shield, Key, Lock, Eye, Target, Users, Plug, LogOut, Bell,
  Settings, Code, Brain, Network, ChevronLeft, ChevronRight,
  Sparkles, Crown, Building2,
} from 'lucide-react';
import { toast } from 'sonner';
import SecurityDashboard from './SecurityDashboard';
import PasskeysView from './PasskeysView';
import VaultView from './VaultView';
import BiometricAuth from './BiometricAuth';
import ThreatAnalysis from './ThreatAnalysis';
import TeamSharing from './TeamSharing';
import Integrations from './Integrations';
import SettingsPanel from './SettingsPanel';
import FloatingAICoach from './FloatingAICoach';
import NotificationCenter from './NotificationCenter';
import DeveloperPortal from './DeveloperPortal';
import AdminIntelligence from './AdminIntelligence';
import FederatedIdentity from './FederatedIdentity';

type NavItem =
  | 'dashboard' | 'passkeys' | 'vault' | 'biometric' | 'threat'
  | 'team' | 'integrations' | 'settings' | 'developer' | 'admin' | 'federated';

const TIER_ACCENT = {
  individual: { bg: 'rgba(34,211,238,0.08)',  border: 'rgba(34,211,238,0.2)',  text: 'text-cyan-400',   glow: 'glow-cyan' },
  smb:        { bg: 'rgba(245,158,11,0.08)',  border: 'rgba(245,158,11,0.2)',  text: 'text-amber-400',  glow: 'glow-amber' },
  enterprise: { bg: 'rgba(167,139,250,0.08)', border: 'rgba(167,139,250,0.2)', text: 'text-violet-400', glow: 'glow-violet' },
};
const TIER_ICON = { individual: Shield, smb: Building2, enterprise: Crown };

const ROLE_CONFIG: Record<string, { label: string; color: string }> = {
  admin:       { label: 'Admin',       color: '#a78bfa' },
  individual:  { label: 'Individual',  color: '#22d3ee' },
  team:        { label: 'Team',        color: '#f59e0b' },
  contractor:  { label: 'Contractor',  color: '#fb923c' },
  guest:       { label: 'Guest',       color: '#94a3b8' },
};

export default function MainApp() {
  const { clear, session } = useInternetIdentity();
  const queryClient = useQueryClient();
  const { data: userProfile } = useGetCallerUserProfile();
  const { data: isAdmin } = useIsCurrentUserAdmin();
  const { tier, config, hasFeature } = useTenant();

  const role = session?.role ?? 'individual';
  const roleConfig = ROLE_CONFIG[role] ?? ROLE_CONFIG.individual;
  const isGuest = role === 'guest';
  const isContractor = role === 'contractor';

  const [activeView, setActiveView]         = useState<NavItem>('dashboard');
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [aiCoachOpen, setAiCoachOpen]       = useState(false);

  const handleLogout = useCallback(async () => {
    try {
      localStorage.removeItem('nexus-tenant-tier');
      localStorage.removeItem('nexus-session');
      sessionStorage.clear();
      queryClient.clear();
      await clear();
      toast.success('Session terminated');
    } catch {
      queryClient.clear();
      localStorage.clear();
      sessionStorage.clear();
      window.location.reload();
    }
  }, [clear, queryClient]);

  const getInitials = (name: string) =>
    name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

  const accent   = TIER_ACCENT[tier];
  const TierIcon = TIER_ICON[tier];

  const allNavItems = [
    { id: 'dashboard'    as NavItem, label: 'Overview',   icon: Shield,   section: 'core'   },
    ...(!isGuest ? [{ id: 'passkeys'     as NavItem, label: 'Passkeys',  icon: Key,      section: 'core'   }] : []),
    ...(!isGuest ? [{ id: 'vault'        as NavItem, label: 'Vault',     icon: Lock,     section: 'core'   }] : []),
    ...(!isGuest ? [{ id: 'biometric'    as NavItem, label: 'Biometric', icon: Eye,      section: 'core'   }] : []),
    { id: 'threat'       as NavItem, label: 'Threats',    icon: Target,   section: 'intel'  },
    ...(!isGuest && !isContractor && hasFeature('teamManagement')  ? [{ id: 'team'         as NavItem, label: 'Team',   icon: Users,    section: 'collab' }] : []),
    ...(!isGuest && hasFeature('ssoIntegrations') ? [{ id: 'integrations' as NavItem, label: 'SSO',    icon: Plug,     section: 'collab' }] : []),
    ...(!isGuest && hasFeature('ssoIntegrations') ? [{ id: 'federated'    as NavItem, label: 'Fabric', icon: Network,  section: 'collab' }] : []),
    ...(!isGuest && !isContractor && hasFeature('developerPortal') ? [{ id: 'developer'    as NavItem, label: 'SDK',    icon: Code,     section: 'dev'    }] : []),
    ...(isAdmin                                                     ? [{ id: 'admin'        as NavItem, label: 'Admin',  icon: Brain,    section: 'admin'  }] : []),
    { id: 'settings'     as NavItem, label: 'Settings',   icon: Settings, section: 'system' },
  ];

  return (
    <div
      className="flex h-screen overflow-hidden"
      style={{ background: 'radial-gradient(ellipse at 50% 0%, rgba(8,8,18,1) 0%, rgba(3,4,7,1) 100%)' }}
    >
      {/* Aurora ambient orbs */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute -top-48 -left-48 w-96 h-96 rounded-full aurora-orb"
          style={{ background: `radial-gradient(circle, ${accent.bg} 0%, transparent 70%)` }} />
        <div className="absolute -bottom-32 -right-32 w-80 h-80 rounded-full aurora-orb-delayed"
          style={{ background: `radial-gradient(circle, ${accent.bg} 0%, transparent 70%)` }} />
      </div>

      {/* ── Sidebar ── */}
      <aside
        className={`relative z-20 flex flex-col aurora-panel-strong transition-all duration-300 ${
          sidebarCollapsed ? 'w-[68px]' : 'w-[220px]'
        }`}
        style={{ borderRight: '1px solid rgba(255,255,255,0.06)' }}
      >
        {/* Logo */}
        <div className="flex items-center gap-2.5 px-4 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <NexusLogo size={32} />
          {!sidebarCollapsed && (
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white/90 truncate leading-tight">Nexus</p>
              <p className="text-[10px] text-white/35 uppercase tracking-[0.15em] font-mono">{config.label}</p>
            </div>
          )}
        </div>

        {/* Tier + Role badge */}
        <div className="px-3 pt-3 pb-1 space-y-1.5">
          {!sidebarCollapsed ? (
            <>
              <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-pill"
                style={{ background: accent.bg, border: `1px solid ${accent.border}` }}>
                <TierIcon className={`h-3.5 w-3.5 ${accent.text}`} />
                <span className={`text-xs font-medium ${accent.text}`}>{config.label}</span>
              </div>
              <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-pill"
                style={{ background: `${roleConfig.color}12`, border: `1px solid ${roleConfig.color}30` }}>
                <div className="h-1.5 w-1.5 rounded-full" style={{ background: roleConfig.color }} />
                <span className="text-xs font-medium" style={{ color: roleConfig.color }}>{roleConfig.label}</span>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center gap-1">
              <TierIcon className={`h-4 w-4 ${accent.text}`} />
              <div className="h-1.5 w-1.5 rounded-full" style={{ background: roleConfig.color }} />
            </div>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5 scrollbar-hide">
          {allNavItems.map(item => {
            const Icon = item.icon;
            const isActive = activeView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveView(item.id)}
                className={`w-full flex items-center gap-2.5 rounded-pill text-sm font-medium transition-all btn-press ${
                  sidebarCollapsed ? 'justify-center px-2 py-2.5' : 'px-3 py-2'
                } ${
                  isActive
                    ? `text-white ${accent.glow}`
                    : 'text-white/45 hover:text-white/75 hover:bg-white/[0.04]'
                }`}
                style={isActive ? { background: accent.bg, border: `1px solid ${accent.border}` } : {}}
                title={sidebarCollapsed ? item.label : undefined}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
              </button>
            );
          })}
        </nav>

        {/* AI Coach toggle */}
        <div className="px-2 pb-2">
          <button
            onClick={() => setAiCoachOpen(!aiCoachOpen)}
            className={`w-full flex items-center gap-2.5 rounded-pill text-sm font-medium transition-all btn-press ${
              sidebarCollapsed ? 'justify-center px-2 py-2.5' : 'px-3 py-2'
            } ${aiCoachOpen ? 'text-white bg-primary/20 border border-primary/25' : 'text-white/45 hover:text-white/75 hover:bg-white/[0.04]'}`}
          >
            <Sparkles className="h-4 w-4 shrink-0" />
            {!sidebarCollapsed && (
              <>
                <span className="truncate">AI Coach</span>
                <div className="ml-auto h-2 w-2 rounded-full bg-green-400 animate-pulse" />
              </>
            )}
          </button>
        </div>

        {/* Collapse toggle */}
        <div className="px-2 py-2" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="w-full flex items-center justify-center py-1.5 rounded-md text-white/25 hover:text-white/55 transition-colors"
          >
            {sidebarCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        </div>

        {/* User + logout */}
        <div className="px-3 py-3" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <div className={`flex items-center ${sidebarCollapsed ? 'justify-center' : 'gap-2.5'}`}>
            <Avatar className="h-8 w-8 shrink-0" style={{ border: `2px solid ${accent.border}` }}>
              <AvatarFallback className="bg-white/5 text-white/70 text-xs font-semibold font-mono">
                {userProfile ? getInitials(userProfile.name) : 'U'}
              </AvatarFallback>
            </Avatar>
            {!sidebarCollapsed && (
              <>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-white/80 truncate">{userProfile?.name || 'User'}</p>
                  <p className="text-[10px] text-white/30 truncate font-mono">{userProfile?.email || ''}</p>
                </div>
                <Button
                  onClick={handleLogout}
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 rounded-md hover:bg-red-500/10 hover:text-red-400 text-white/25"
                >
                  <LogOut className="h-3.5 w-3.5" />
                </Button>
              </>
            )}
          </div>
          {sidebarCollapsed && (
            <button
              onClick={handleLogout}
              className="mt-2 w-full flex items-center justify-center py-1.5 rounded-md text-white/25 hover:text-red-400 hover:bg-red-500/10 transition-colors"
              title="Sign Out"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </aside>

      {/* ── Main Content ── */}
      <div className="flex-1 flex flex-col min-w-0 relative z-10">
        {/* Top bar */}
        <header
          className="flex items-center justify-between px-6 py-3 aurora-panel-subtle"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
        >
          <div>
            <h1 className="text-sm font-semibold text-white/90 tracking-tight">
              {allNavItems.find(n => n.id === activeView)?.label || 'Dashboard'}
            </h1>
            <p className="text-[10px] text-white/30 font-mono uppercase tracking-[0.12em]">
              {config.label} TIER · {roleConfig.label}{hasFeature('auditLogging') && ' · AUDIT ACTIVE'}
              {isGuest && ' · READ-ONLY'}
              {isContractor && ' · LIMITED ACCESS'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-full text-white/35 hover:text-white/65 hover:bg-white/[0.04] relative"
              onClick={() => setNotificationOpen(true)}
            >
              <Bell className="h-4 w-4" />
              <div className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-red-500" />
            </Button>
          </div>
        </header>

        {/* Content + AI side-rail */}
        <div className="flex-1 flex overflow-hidden">
          <main className="flex-1 overflow-y-auto p-6">
            <div className="animate-fade-in">
              {activeView === 'dashboard'    && <SecurityDashboard onNavigate={(view) => setActiveView(view as NavItem)} />}
              {activeView === 'passkeys'     && <PasskeysView />}
              {activeView === 'vault'        && <VaultView />}
              {activeView === 'biometric'    && <BiometricAuth />}
              {activeView === 'threat'       && <ThreatAnalysis />}
              {activeView === 'team'         && hasFeature('teamManagement')  && <TeamSharing />}
              {activeView === 'integrations' && hasFeature('ssoIntegrations') && <Integrations />}
              {activeView === 'federated'    && hasFeature('ssoIntegrations') && <FederatedIdentity />}
              {activeView === 'developer'    && hasFeature('developerPortal') && <DeveloperPortal />}
              {activeView === 'admin'        && isAdmin && <AdminIntelligence />}
              {activeView === 'settings'     && <SettingsPanel />}
            </div>
          </main>

          {aiCoachOpen && (
            <aside
              className="w-[380px] overflow-hidden flex flex-col animate-slide-in aurora-panel-strong"
              style={{ borderLeft: '1px solid rgba(255,255,255,0.06)' }}
            >
              <FloatingAICoach currentPage={activeView} embedded onClose={() => setAiCoachOpen(false)} />
            </aside>
          )}
        </div>
      </div>

      <NotificationCenter isOpen={notificationOpen} onClose={() => setNotificationOpen(false)} />
    </div>
  );
}
