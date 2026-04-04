import { Component, useState, useCallback, useEffect, type ReactNode, type ErrorInfo } from 'react';
import { useInternetIdentity } from './hooks/useInternetIdentity';
import { useGetCallerUserProfile, useIsCurrentUserAdmin } from './hooks/useQueries';
import { useQueryClient } from '@tanstack/react-query';
import { useTenant } from './TenantContext';
import { hasPermission } from './lib/permissions';
import { loadPasskeys } from './lib/webauthn';
import { logError } from './lib/logger';
import { isDemoMode as isDemoModeActive, getDemoConfig, disableDemoMode } from './lib/demoMode';
import NexusLogo from './NexusLogo';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  Shield, Key, Lock, Eye, Target, Users, Plug, LogOut, Bell,
  Settings, Code, Brain, Network, ChevronLeft, ChevronRight,
  Sparkles, Crown, Building2, HelpCircle, BookOpen, CreditCard,
  AlertTriangle, LayoutGrid, ChevronDown, Menu, X,
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
import OnboardingFlow, { isOnboardingDone } from './OnboardingFlow';
import HelpRequestDialog from './HelpRequestDialog';
import BillingPage from './BillingPage';
import CustomDashboard from './CustomDashboard';

type NavItem =
  | 'dashboard' | 'myview' | 'passkeys' | 'vault' | 'biometric' | 'threat'
  | 'team' | 'integrations' | 'settings' | 'developer' | 'admin' | 'federated' | 'billing';

/* ── Admin submenu definitions ─────────────────────────────────────────── */
interface AdminSubItem {
  id: string;
  label: string;
  sectionId: string;
}

const ADMIN_SUB_ITEMS: AdminSubItem[] = [
  { id: 'admin-sessions',  label: 'Sessions',         sectionId: 'section-sessions' },
  { id: 'admin-users',     label: 'Users',            sectionId: 'section-users' },
  { id: 'admin-service',   label: 'Service Accounts', sectionId: 'section-service-accounts' },
  { id: 'admin-agents',    label: 'AI Agents',        sectionId: 'section-ai-agents' },
  { id: 'admin-policies',  label: 'Policies',         sectionId: 'section-policies' },
  { id: 'admin-directory', label: 'Directory Sync',   sectionId: 'section-directory-sync' },
  { id: 'admin-hardware',  label: 'Hardware Keys',    sectionId: 'section-hardware-keys' },
  { id: 'admin-reports',   label: 'Reports',          sectionId: 'section-reports' },
  { id: 'admin-support',   label: 'Support Tickets',  sectionId: 'section-support' },
];

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

/* ── Global page-level error boundary ─────────────────────────────────── */
class PageErrorBoundary extends Component<
  { children: ReactNode; pageName: string; onReset?: () => void },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: ReactNode; pageName: string; onReset?: () => void }) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    logError(`[Nexus] Crash in "${this.props.pageName}":`, error, info.componentStack);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center py-20 text-center animate-fade-in">
          <div className="p-5 rounded-2xl bg-destructive/10 mb-5">
            <Shield className="h-12 w-12 text-destructive/60" />
          </div>
          <h2 className="text-lg font-semibold mb-2 text-white/80">Something went wrong</h2>
          <p className="text-sm text-white/40 max-w-md mb-1">{this.props.pageName} encountered an error.</p>
          <p className="text-xs text-white/25 font-mono mb-5 max-w-md break-all">{this.state.error?.message}</p>
          <button
            onClick={() => { this.setState({ hasError: false, error: null }); this.props.onReset?.(); }}
            className="px-5 py-2 rounded-full text-sm font-medium text-white/70 border border-white/10 hover:bg-white/5 transition-colors btn-press"
          >
            Try Again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function MainApp() {
  const { clear, session } = useInternetIdentity();
  const queryClient = useQueryClient();
  const { data: userProfile } = useGetCallerUserProfile();
  const { data: isAdmin } = useIsCurrentUserAdmin();
  const { tier, config, hasFeature, setTier } = useTenant();

  const role = session?.role ?? 'individual';
  const roleConfig = ROLE_CONFIG[role] ?? ROLE_CONFIG.individual;
  const isGuest = role === 'guest';
  const isContractor = role === 'contractor';

  // Sync tenant tier with session on mount (fixes missing menu items on first login)
  useEffect(() => {
    if (session?.tier && session.tier !== tier) {
      setTier(session.tier);
    }
  }, [session?.tier, tier, setTier]);

  // Role-aware default landing page
  const getDefaultView = (): NavItem => {
    if (isAdmin) return 'admin';
    if (isContractor) return 'vault';
    return 'dashboard';
  };

  // Sidebar avatar — read from localStorage, re-read when Settings view is left
  const AVATAR_KEY = 'nexus-avatar';
  const [sidebarAvatar, setSidebarAvatar] = useState<string | null>(() => {
    if (!session?.principalId) return null;
    return localStorage.getItem(`${AVATAR_KEY}-${session.principalId}`);
  });

  const [activeView, setActiveView]         = useState<NavItem>(getDefaultView);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [aiCoachOpen, setAiCoachOpen]       = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [helpOpen, setHelpOpen]             = useState(false);
  const [expandedNav, setExpandedNav]       = useState<Record<string, boolean>>({});
  const [pendingScrollTarget, setPendingScrollTarget] = useState<string | null>(null);

  // Drag-and-drop nav reordering
  const NAV_ORDER_KEY = `nexus-nav-order-${session?.principalId ?? 'default'}`;
  const [draggedItem, setDraggedItem] = useState<string | null>(null);
  const [navOrder, setNavOrder] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(NAV_ORDER_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });

  const saveNavOrder = (order: string[]) => {
    setNavOrder(order);
    try { localStorage.setItem(NAV_ORDER_KEY, JSON.stringify(order)); } catch {}
  };

  const handleDragStart = (id: string) => setDraggedItem(id);
  const handleDragOver = (e: React.DragEvent) => e.preventDefault();
  const handleDrop = (targetId: string) => {
    if (!draggedItem || draggedItem === targetId) { setDraggedItem(null); return; }
    const currentOrder = navOrder.length > 0 ? navOrder : allNavItems.map(n => n.id);
    const fromIdx = currentOrder.indexOf(draggedItem);
    const toIdx = currentOrder.indexOf(targetId);
    if (fromIdx < 0 || toIdx < 0) { setDraggedItem(null); return; }
    const newOrder = [...currentOrder];
    newOrder.splice(fromIdx, 1);
    newOrder.splice(toIdx, 0, draggedItem);
    saveNavOrder(newOrder);
    setDraggedItem(null);
  };

  const resetNavOrder = () => {
    setNavOrder([]);
    try { localStorage.removeItem(NAV_ORDER_KEY); } catch {}
  };

  // Re-read avatar from localStorage — poll every 2s to catch Settings edits immediately
  useEffect(() => {
    if (!session?.principalId) return;
    const key = `${AVATAR_KEY}-${session.principalId}`;
    const check = () => {
      const current = localStorage.getItem(key);
      setSidebarAvatar(prev => prev !== current ? current : prev);
    };
    check();
    const interval = setInterval(check, 2000);
    return () => clearInterval(interval);
  }, [session?.principalId]);

  // Scroll to a section after navigation settles
  useEffect(() => {
    if (!pendingScrollTarget) return;
    const timer = setTimeout(() => {
      const el = document.getElementById(pendingScrollTarget);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setPendingScrollTarget(null);
    }, 300);
    return () => clearTimeout(timer);
  }, [pendingScrollTarget, activeView]);

  const navigateToSection = useCallback((view: NavItem, sectionId?: string) => {
    setActiveView(view);
    if (sectionId) setPendingScrollTarget(sectionId);
  }, []);

  const toggleNavExpand = (id: string) => {
    setExpandedNav(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // Show onboarding automatically for new users (not guests)
  useEffect(() => {
    if (role !== 'guest' && !isOnboardingDone()) {
      // Slight delay to let the UI settle first
      const t = setTimeout(() => setShowOnboarding(true), 800);
      return () => clearTimeout(t);
    }
  }, [role]);

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
    { id: 'myview'       as NavItem, label: 'My View',    icon: LayoutGrid, section: 'core' },
    ...(!isGuest ? [{ id: 'passkeys'     as NavItem, label: 'Passkeys',  icon: Key,      section: 'core'   }] : []),
    ...(!isGuest ? [{ id: 'vault'        as NavItem, label: 'Vault',     icon: Lock,     section: 'core'   }] : []),
    ...(!isGuest ? [{ id: 'biometric'    as NavItem, label: 'Biometric', icon: Eye,      section: 'core'   }] : []),
    { id: 'threat'       as NavItem, label: 'Threats',    icon: Target,   section: 'intel'  },
    ...(!isGuest && !isContractor && hasFeature('teamManagement')  ? [{ id: 'team'         as NavItem, label: 'Team',   icon: Users,    section: 'collab' }] : []),
    ...(!isGuest && hasFeature('ssoIntegrations') ? [{ id: 'integrations' as NavItem, label: 'SSO',    icon: Plug,     section: 'collab' }] : []),
    ...(!isGuest && hasFeature('ssoIntegrations') ? [{ id: 'federated'    as NavItem, label: 'Fabric', icon: Network,  section: 'collab' }] : []),
    ...(hasPermission(role, 'developer:read') && hasFeature('developerPortal') ? [{ id: 'developer'    as NavItem, label: 'SDK',    icon: Code,     section: 'dev'    }] : []),
    ...(isAdmin                                                     ? [{ id: 'admin'        as NavItem, label: 'Admin',  icon: Brain,    section: 'admin'  }] : []),
    ...(!isGuest && !isContractor ? [{ id: 'billing'      as NavItem, label: 'Billing', icon: CreditCard, section: 'system' }] : []),
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

      {/* ── Mobile sidebar backdrop ── */}
      {mobileSidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/60 md:hidden"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}

      {/* ── Sidebar ── */}
      <aside
        className={`fixed inset-y-0 left-0 z-30 flex flex-col aurora-panel-strong transition-all duration-300 transform ${
          mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full'
        } md:translate-x-0 md:relative md:flex ${
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

        {/* Nav — draggable for reordering */}
        <nav className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5 scrollbar-hide">
          {(navOrder.length > 0
            ? navOrder.map(id => allNavItems.find(n => n.id === id)).filter(Boolean) as typeof allNavItems
            : allNavItems
          ).map(item => {
            const Icon = item.icon;
            const isActive = activeView === item.id;
            const hasSubmenu = item.id === 'admin';
            const isExpanded = expandedNav[item.id] ?? false;
            return (
              <div
                key={item.id}
                draggable
                onDragStart={() => handleDragStart(item.id)}
                onDragOver={handleDragOver}
                onDrop={() => handleDrop(item.id)}
                className={`group relative ${draggedItem === item.id ? 'opacity-40' : ''}`}
              >
                <button
                  onClick={() => {
                    setActiveView(item.id);
                    if (hasSubmenu) toggleNavExpand(item.id);
                    if (!hasSubmenu) setMobileSidebarOpen(false);
                  }}
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
                  {!sidebarCollapsed && (
                    <span className="absolute left-1 opacity-0 group-hover:opacity-30 text-[8px] text-white/40 cursor-grab transition-opacity select-none">⠿</span>
                  )}
                  <Icon className="h-4 w-4 shrink-0" />
                  {!sidebarCollapsed && <span className="truncate flex-1 text-left">{item.label}</span>}
                  {!sidebarCollapsed && hasSubmenu && (
                    <ChevronDown className={`h-3 w-3 shrink-0 text-white/30 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                  )}
                </button>
                {/* Expandable submenu for admin */}
                {hasSubmenu && isExpanded && !sidebarCollapsed && (
                  <div className="ml-4 mt-0.5 mb-1 pl-3 space-y-0.5" style={{ borderLeft: '1px solid rgba(255,255,255,0.08)' }}>
                    {ADMIN_SUB_ITEMS.map(sub => (
                      <button
                        key={sub.id}
                        onClick={() => { navigateToSection('admin', sub.sectionId); setMobileSidebarOpen(false); }}
                        className="w-full text-left px-2.5 py-1.5 text-xs text-white/40 hover:text-white/70 hover:bg-white/[0.04] rounded-md transition-colors btn-press"
                      >
                        {sub.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {navOrder.length > 0 && !sidebarCollapsed && (
            <button
              onClick={resetNavOrder}
              className="w-full text-[10px] text-white/20 hover:text-white/40 py-1.5 transition-colors"
            >
              Reset order
            </button>
          )}
        </nav>

        {/* Security Advisor toggle */}
        <div className="px-2 pb-2">
          <button
            onClick={() => setAiCoachOpen(!aiCoachOpen)}
            className={`w-full flex items-center gap-2.5 rounded-pill text-sm font-medium transition-all btn-press ${
              sidebarCollapsed ? 'justify-center px-2 py-2.5' : 'px-3 py-2'
            } ${aiCoachOpen ? 'text-white bg-primary/20 border border-primary/25' : 'text-white/45 hover:text-white/75 hover:bg-white/[0.04]'}`}
          >
            <Shield className="h-4 w-4 shrink-0" />
            {!sidebarCollapsed && (
              <>
                <span className="truncate">Advisor</span>
                <div className="ml-auto h-2 w-2 rounded-full bg-green-400 animate-pulse" />
              </>
            )}
          </button>
        </div>

        {/* Collapse toggle — desktop only */}
        <div className="hidden md:block px-2 py-2" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
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
              {sidebarAvatar && <AvatarImage src={sidebarAvatar} alt="Profile" className="object-cover" />}
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
          className="flex items-center justify-between px-3 md:px-6 py-3 aurora-panel-subtle"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
        >
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-full text-white/50 hover:text-white/80 hover:bg-white/[0.06] md:hidden"
              onClick={() => setMobileSidebarOpen(!mobileSidebarOpen)}
            >
              {mobileSidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
            <div>
              <h1 className="text-sm font-semibold text-white/90 tracking-tight">
                {allNavItems.find(n => n.id === activeView)?.label || 'Dashboard'}
              </h1>
              <p className="text-[10px] text-white/30 font-mono uppercase tracking-[0.12em] hidden md:block">
                {config.label} TIER · {roleConfig.label}{hasFeature('auditLogging') && ' · AUDIT ACTIVE'}
                {isGuest && ' · READ-ONLY'}
                {isContractor && ' · LIMITED ACCESS'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {isDemoModeActive() && (
              <Badge
                className="text-[10px] px-2.5 py-0.5 font-mono tracking-wider animate-pulse"
                style={{
                  background: 'rgba(167,139,250,0.15)',
                  color: '#a78bfa',
                  border: '1px solid rgba(167,139,250,0.35)',
                }}
              >
                DEMO
              </Badge>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-full text-white/35 hover:text-white/65 hover:bg-white/[0.04]"
              onClick={() => setShowOnboarding(true)}
              title="Setup walkthrough"
            >
              <BookOpen className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-full text-white/35 hover:text-white/65 hover:bg-white/[0.04]"
              onClick={() => setHelpOpen(true)}
              title="Get help"
            >
              <HelpCircle className="h-4 w-4" />
            </Button>
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

        {/* Demo mode banner */}
        {isDemoModeActive() && (
          <div
            className="flex items-center justify-between gap-3 px-3 md:px-6 py-2"
            style={{ background: 'rgba(167,139,250,0.08)', borderBottom: '1px solid rgba(167,139,250,0.18)' }}
          >
            <p className="text-xs text-violet-300">
              You're in demo mode. All features are available for evaluation.
            </p>
            <button
              onClick={() => { disableDemoMode(); handleLogout(); }}
              className="text-[10px] text-violet-400 hover:text-violet-300 font-mono tracking-wider transition-colors shrink-0"
            >
              EXIT DEMO
            </button>
          </div>
        )}

        {/* Passkey security banner for non-guest users with 0 passkeys */}
        {!isGuest && loadPasskeys(session?.principalId).length === 0 && (
          <div
            className="flex items-center gap-3 px-3 md:px-6 py-2.5"
            style={{ background: 'rgba(245,158,11,0.10)', borderBottom: '1px solid rgba(245,158,11,0.20)' }}
          >
            <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
            <p className="text-xs text-amber-300 flex-1">
              Your account is not protected by a passkey. Register one now for phishing-proof authentication.
            </p>
            <Button
              size="sm"
              className="rounded-full text-xs h-7 px-3 btn-press bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30"
              onClick={() => setActiveView('passkeys')}
            >
              Register Passkey
            </Button>
          </div>
        )}

        {/* Content + AI side-rail */}
        <div className="flex-1 flex overflow-hidden">
          <main className="flex-1 overflow-y-auto p-3 md:p-6">
            <div className="animate-fade-in">
              <PageErrorBoundary pageName={allNavItems.find(n => n.id === activeView)?.label ?? activeView} key={activeView}>
                {activeView === 'dashboard'    && <SecurityDashboard onNavigate={(view) => setActiveView(view as NavItem)} />}
                {activeView === 'myview'       && <CustomDashboard principalId={session?.principalId ?? 'default'} onNavigate={(view, sectionId) => navigateToSection(view as NavItem, sectionId)} />}
                {activeView === 'passkeys'     && <PasskeysView />}
                {activeView === 'vault'        && <VaultView />}
                {activeView === 'biometric'    && <BiometricAuth />}
                {activeView === 'threat'       && <ThreatAnalysis />}
                {activeView === 'team'         && hasFeature('teamManagement')  && <TeamSharing />}
                {activeView === 'integrations' && hasFeature('ssoIntegrations') && <Integrations />}
                {activeView === 'federated'    && hasFeature('ssoIntegrations') && <FederatedIdentity />}
                {activeView === 'developer'    && hasFeature('developerPortal') && <DeveloperPortal />}
                {activeView === 'admin'        && isAdmin && <AdminIntelligence />}
                {activeView === 'billing'      && <BillingPage />}
                {activeView === 'settings'     && <SettingsPanel />}
              </PageErrorBoundary>
            </div>
          </main>

          {aiCoachOpen && (
            <aside
              className="fixed inset-0 z-40 md:relative md:inset-auto md:z-auto md:w-[380px] overflow-hidden flex flex-col animate-slide-in aurora-panel-strong"
              style={{ borderLeft: '1px solid rgba(255,255,255,0.06)' }}
            >
              <FloatingAICoach currentPage={activeView} embedded onClose={() => setAiCoachOpen(false)} />
            </aside>
          )}
        </div>
      </div>

      <NotificationCenter isOpen={notificationOpen} onClose={() => setNotificationOpen(false)} />

      {showOnboarding && (
        <OnboardingFlow
          onClose={() => setShowOnboarding(false)}
          onNavigate={(view) => { setActiveView(view as NavItem); setShowOnboarding(false); }}
        />
      )}

      {helpOpen && <HelpRequestDialog onClose={() => setHelpOpen(false)} />}
    </div>
  );
}
