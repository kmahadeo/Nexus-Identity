import { Component, useState, useEffect, useCallback, type ErrorInfo, type ReactNode } from 'react';
import { logError } from './lib/logger';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
// Tabs not currently used but available for future sub-sections
import {
  Brain, Shield, AlertTriangle, Users, Activity, Zap, CheckCircle2, Target,
  FileText, ExternalLink, UserX, RefreshCw, Download, Plus, Eye, HelpCircle,
  Clock, MessageSquare, CheckSquare, Key, BarChart3, FolderSync,
  Monitor, LogOut, ShieldAlert, Timer, Flame, Lock, Unlock, Pin, PinOff, Bot,
} from 'lucide-react';
import { PinButton } from './CustomDashboard';
import HardwareKeyManagement from './HardwareKeyManagement';
import DirectorySync from './DirectorySync';
import ProtectedReports from './ProtectedReports';
import UserManagement from './UserManagement';
import ServiceAccounts from './ServiceAccounts';
import AgentIdentity from './AgentIdentity';
import { toast } from 'sonner';
import {
  useGetAllUsers, useDeactivateUser, useGetPolicies, useTogglePolicy, useAddPolicy,
  useGetVaultEntries,
} from './hooks/useQueries';
import { policyStorage, notificationStorage, type SecurityPolicy } from './lib/storage';
import { sessionStorage_ } from './lib/storage';
import {
  helpRequestStorage, HELP_CATEGORIES, HELP_PRIORITIES,
  type HelpRequestStatus,
} from './lib/helpRequests';
import {
  activeSessionStorage,
  conditionalAccessStorage,
  breakGlassStorage,
  evaluateConditionalAccess,
  type ActiveSession,
  type ConditionalAccessRule,
  type BreakGlassState,
} from './lib/permissions';

/* ── Error Boundary ──────────────────────────────────────────────────── */

interface ErrorBoundaryProps {
  children: ReactNode;
  sectionName?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class SectionErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    logError(
      `[AdminIntelligence] Error in "${this.props.sectionName ?? 'unknown'}" section:`,
      error,
      info.componentStack,
    );
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 rounded-xl glass-effect border border-destructive/30 bg-destructive/5 text-center space-y-3">
          <AlertTriangle className="h-8 w-8 mx-auto text-destructive/70" />
          <p className="text-sm font-medium text-destructive/90">
            This section encountered an error
          </p>
          <p className="text-xs text-muted-foreground max-w-md mx-auto">
            {this.state.error?.message ?? 'An unexpected error occurred.'}
          </p>
          <Button
            variant="outline"
            size="sm"
            className="rounded-full btn-press text-xs border-destructive/30 hover:bg-destructive/10"
            onClick={() => this.setState({ hasError: false, error: null })}
          >
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            Retry
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function AdminIntelligence() {
  const pinPrincipalId = (() => { try { return sessionStorage_.get()?.principalId ?? 'default'; } catch { return 'default'; } })();
  const { data: allUsers = [], refetch: refetchUsers } = useGetAllUsers();
  const { data: policies = [], refetch: refetchPolicies } = useGetPolicies();
  const { data: vaultEntries = [] } = useGetVaultEntries();
  const { mutate: deactivateUser } = useDeactivateUser();
  const { mutate: togglePolicy } = useTogglePolicy();
  const { mutate: addPolicy } = useAddPolicy();

  const [showPolicyDialog, setShowPolicyDialog] = useState(false);
  const [newPolicy, setNewPolicy] = useState<Partial<SecurityPolicy>>({
    type: 'password', severity: 'medium', enforcement: 'warn', enabled: true,
  });
  const [helpRequests, setHelpRequests] = useState(() => helpRequestStorage.getAll());
  const [selectedTicket, setSelectedTicket] = useState<string | null>(null);
  const [adminNotesDraft, setAdminNotesDraft] = useState('');

  // ── Session Management state ───────────────────────────────────────
  const [activeSessions, setActiveSessions] = useState<ActiveSession[]>(() => activeSessionStorage.getAll());
  const refreshSessions = useCallback(() => setActiveSessions(activeSessionStorage.getAll()), []);

  const handleForceTerminate = useCallback((sessionId: string) => {
    activeSessionStorage.removeById(sessionId);
    refreshSessions();
    toast.success('Session terminated');
    notificationStorage.add({
      title: 'Session Terminated',
      body: 'An admin force-terminated a user session.',
      type: 'security',
    });
  }, [refreshSessions]);

  // Refresh sessions every 30s
  useEffect(() => {
    const interval = setInterval(refreshSessions, 30_000);
    return () => clearInterval(interval);
  }, [refreshSessions]);

  // ── Conditional Access state ───────────────────────────────────────
  const [caRules, setCaRules] = useState<ConditionalAccessRule[]>(() => conditionalAccessStorage.ensureDefaults());
  const refreshCaRules = useCallback(() => setCaRules(conditionalAccessStorage.getAll()), []);

  const handleToggleCaRule = useCallback((id: string) => {
    conditionalAccessStorage.toggle(id);
    refreshCaRules();
    toast.success('Conditional access rule updated');
  }, [refreshCaRules]);

  // ── Break-Glass state ──────────────────────────────────────────────
  const [breakGlass, setBreakGlass] = useState<BreakGlassState | null>(() => breakGlassStorage.get());
  const [showBreakGlassDialog, setShowBreakGlassDialog] = useState(false);
  const [breakGlassReason, setBreakGlassReason] = useState('');
  const [breakGlassCountdown, setBreakGlassCountdown] = useState('');

  const refreshBreakGlass = useCallback(() => setBreakGlass(breakGlassStorage.get()), []);

  const handleActivateBreakGlass = useCallback(() => {
    const session = sessionStorage_.get();
    if (!session) return;
    if (!breakGlassReason.trim()) {
      toast.error('A reason is required for break-glass access');
      return;
    }
    const result = breakGlassStorage.activate(session.principalId, session.name, breakGlassReason.trim());
    if (!result.success) {
      toast.error(result.error ?? 'Failed to activate break-glass access');
      return;
    }
    // Create HIGH PRIORITY audit log notification for all admins
    notificationStorage.add({
      title: 'BREAK-GLASS ACCESS ACTIVATED',
      body: `Emergency access activated by ${session.name} (${session.email}). Reason: ${breakGlassReason.trim()}. Expires in 1 hour.`,
      type: 'security',
    });
    refreshBreakGlass();
    setShowBreakGlassDialog(false);
    setBreakGlassReason('');
    toast.success('Break-glass emergency access activated for 1 hour');
  }, [breakGlassReason, refreshBreakGlass]);

  const handleDeactivateBreakGlass = useCallback(() => {
    breakGlassStorage.deactivate();
    refreshBreakGlass();
    notificationStorage.add({
      title: 'Break-Glass Access Deactivated',
      body: 'Emergency access was manually deactivated by an admin.',
      type: 'info',
    });
    toast.success('Break-glass access deactivated');
  }, [refreshBreakGlass]);

  // Break-glass countdown timer
  useEffect(() => {
    if (!breakGlass) { setBreakGlassCountdown(''); return; }
    const tick = () => {
      const remaining = breakGlass.expiresAt - Date.now();
      if (remaining <= 0) {
        refreshBreakGlass();
        setBreakGlassCountdown('Expired');
        return;
      }
      const mins = Math.floor(remaining / 60_000);
      const secs = Math.floor((remaining % 60_000) / 1000);
      setBreakGlassCountdown(`${mins}m ${secs.toString().padStart(2, '0')}s`);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [breakGlass, refreshBreakGlass]);

  const breakGlassUsage24h = breakGlassStorage.getUsageCount24h();

  const refreshTickets = () => setHelpRequests(helpRequestStorage.getAll());

  const updateTicketStatus = (id: string, status: HelpRequestStatus) => {
    helpRequestStorage.updateStatus(id, status, adminNotesDraft || undefined);
    refreshTickets();
    setSelectedTicket(null);
    setAdminNotesDraft('');
    toast.success(`Ticket ${status}`);
  };

  const openTickets   = helpRequests.filter(r => r.status === 'open').length;
  const urgentTickets = helpRequests.filter(r => r.priority === 'urgent' && r.status === 'open').length;

  const activeUsers  = allUsers.filter(u => u.isActive).length;
  const mfaEnabled   = allUsers.filter(u => u.mfaEnabled).length;
  const mfaPct       = allUsers.length > 0 ? Math.round((mfaEnabled / allUsers.length) * 100) : 0;
  const activePolicies = policies.filter(p => p.enabled).length;
  const weakVault    = vaultEntries.filter(e => (e.password || '').length < 12).length;
  // Compliance score derived from real data: policy coverage (40%), MFA adoption (30%), vault hygiene (30%)
  const policyCoverage = policies.length > 0 ? Math.round((activePolicies / policies.length) * 100) : 0;
  const vaultHygiene = vaultEntries.length > 0 ? Math.round(((vaultEntries.length - weakVault) / vaultEntries.length) * 100) : 0;
  const complianceScore = Math.round(policyCoverage * 0.4 + mfaPct * 0.3 + vaultHygiene * 0.3);

  const handleGeneratePolicy = () => {
    const session = sessionStorage_.get();
    if (!session) return;
    const suggestions: Omit<SecurityPolicy, 'id' | 'createdAt' | 'createdBy' | 'lastModified'>[] = [
      { name: 'Zero Trust Network Access', description: 'All access requests verified regardless of network location', type: 'access', severity: 'high', enforcement: 'warn', enabled: true, config: { verifyEveryRequest: true, defaultDeny: true } },
      { name: 'Privileged Access Management', description: 'Admin credentials require step-up authentication and are logged', type: 'access', severity: 'critical', enforcement: 'block', enabled: true, config: { adminMfaRequired: true, sessionRecording: true } },
      { name: 'Data Loss Prevention', description: 'Prevent sensitive credential export without audit trail', type: 'compliance', severity: 'high', enforcement: 'warn', enabled: true, config: { requireApprovalForExport: true, auditAll: true } },
    ];
    const existing = policies.map(p => p.name);
    const toAdd = suggestions.filter(s => !existing.includes(s.name));
    if (toAdd.length === 0) { toast.info('All suggested policies already exist'); return; }
    toAdd.forEach(s => {
      addPolicy({ ...s, id: crypto.randomUUID(), createdAt: Date.now(), createdBy: session.principalId, lastModified: Date.now() });
    });
    toast.success(`Generated ${toAdd.length} new security policies`);
    refetchPolicies();
  };

  const handleExportReport = () => {
    const report = {
      generatedAt: new Date().toISOString(),
      platform: 'Nexus Identity',
      summary: { totalUsers: allUsers.length, activeUsers, mfaAdoption: `${mfaPct}%`, activePolicies, complianceScore: `${complianceScore}%` },
      users: allUsers.map(u => ({ name: u.name, email: u.email, role: u.role, mfaEnabled: u.mfaEnabled, vaultCount: u.vaultCount, passkeysCount: u.passkeysCount })),
      policies: policies.map(p => ({ name: p.name, type: p.type, severity: p.severity, enabled: p.enabled, enforcement: p.enforcement })),
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `nexus-security-report-${Date.now()}.json`; a.click();
    URL.revokeObjectURL(url);
    toast.success('Security report exported');
  };

  // Conditional access check for admin operations
  const adminAccessResult = (() => {
    const session = sessionStorage_.get();
    if (!session) return { access: 'allow' as const, reason: '' };
    const passkeyCount = (() => {
      try { return JSON.parse(localStorage.getItem(`nexus-passkeys-${session.principalId}`) ?? '[]').length; } catch { return 0; }
    })();
    return evaluateConditionalAccess({
      hasPasskeys: passkeyCount > 0,
      passkeyCount,
      hasTOTP: false, // admin check doesn't need TOTP detail
      sessionLoginAt: session.loginAt,
      role: session.role,
      action: 'admin_access',
      breakGlassActive: breakGlassStorage.isActive(),
    });
  })();

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Conditional Access Banner for Admin */}
      {adminAccessResult.access !== 'allow' && (
        <Card className={`border-border/40 shadow-depth-md ${adminAccessResult.access === 'block' ? 'border-red-500/40 bg-red-500/10' : 'border-amber-500/40 bg-amber-500/10'}`}>
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <ShieldAlert className={`h-5 w-5 mt-0.5 shrink-0 ${adminAccessResult.access === 'block' ? 'text-red-400' : 'text-amber-400'}`} />
              <div>
                <p className={`text-sm font-semibold ${adminAccessResult.access === 'block' ? 'text-red-300' : 'text-amber-300'}`}>
                  {adminAccessResult.access === 'block' ? 'Admin Access Restricted' : 'Additional Authentication Required'}
                </p>
                <p className="text-xs text-white/50 mt-0.5">{adminAccessResult.reason}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quick Setup Banner — shows for new admins */}
      {(policies.length === 0 || allUsers.length <= 1) && (
        <Card className="border-violet-500/30 bg-gradient-to-r from-violet-500/10 to-indigo-500/10 shadow-depth-md">
          <CardContent className="p-5">
            <div className="flex items-start gap-4">
              <div className="p-3 rounded-xl bg-violet-500/15 shrink-0">
                <Zap className="h-6 w-6 text-violet-400" />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-white/90 mb-1">Quick Setup</h3>
                <p className="text-xs text-white/40 mb-3">Complete these steps to get your organisation secured</p>
                <div className="flex flex-wrap gap-2">
                  {allUsers.length <= 1 && (
                    <Button size="sm" variant="outline" className="rounded-full btn-press text-xs border-violet-500/30 hover:bg-violet-500/10"
                      onClick={() => document.getElementById('section-directory-sync')?.scrollIntoView({ behavior: 'smooth' })}>
                      <Users className="h-3.5 w-3.5 mr-1" /> Import Users
                    </Button>
                  )}
                  {policies.length === 0 && (
                    <Button size="sm" variant="outline" className="rounded-full btn-press text-xs border-violet-500/30 hover:bg-violet-500/10"
                      onClick={() => { handleGeneratePolicy(); }}>
                      <Shield className="h-3.5 w-3.5 mr-1" /> Generate Policies
                    </Button>
                  )}
                  <Button size="sm" variant="outline" className="rounded-full btn-press text-xs border-violet-500/30 hover:bg-violet-500/10"
                    onClick={() => document.getElementById('section-hardware-keys')?.scrollIntoView({ behavior: 'smooth' })}>
                    <Key className="h-3.5 w-3.5 mr-1" /> Assign Hardware Keys
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold mb-2">Admin Intelligence Dashboard</h1>
          <p className="text-muted-foreground">Organisation-wide security management, policy enforcement, and user governance</p>
        </div>
        <div className="flex items-center gap-2">
          {urgentTickets > 0 && (
            <Badge variant="destructive" className="text-xs">
              {urgentTickets} urgent ticket{urgentTickets !== 1 ? 's' : ''}
            </Badge>
          )}
          {openTickets > 0 && (
            <Badge variant="secondary" className="text-xs">
              <HelpCircle className="h-3 w-3 mr-1" />{openTickets} open
            </Badge>
          )}
          <Button variant="outline" onClick={handleExportReport} className="rounded-full btn-press text-xs">
            <Download className="h-3.5 w-3.5 mr-1.5" />Export Report
          </Button>
          <Badge variant="secondary"><Brain className="h-4 w-4 mr-1" />Admin</Badge>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 md:gap-4">
        {[
          { icon: Users, label: 'Registered Users', value: allUsers.length, sub: `${activeUsers} active`, gradient: 'gradient-primary' },
          { icon: Monitor, label: 'Active Sessions', value: activeSessions.length, sub: 'live now', gradient: 'from-blue-500/15 to-blue-500/5' },
          { icon: Shield, label: 'MFA Adoption', value: `${mfaPct}%`, sub: `${mfaEnabled}/${allUsers.length} users`, gradient: 'gradient-success' },
          { icon: Target, label: 'Active Policies', value: activePolicies, sub: `${policies.length} total`, gradient: 'gradient-warning' },
          { icon: CheckCircle2, label: 'Compliance Score', value: `${complianceScore}%`, sub: `${activePolicies}/${policies.length} policies`, gradient: 'from-accent/15 to-accent/5' },
        ].map(({ icon: Icon, label, value, sub, gradient }) => (
          <Card key={label} className={`border-border/40 glass-strong shadow-depth-md card-tactile ${gradient}`}>
            <CardContent className="p-3 md:p-6">
              <div className="flex items-center justify-between mb-2 md:mb-3"><Icon className="h-5 w-5 md:h-7 md:w-7" /><Badge variant="secondary" className="text-xs">{sub}</Badge></div>
              <div className="text-2xl md:text-3xl font-bold mb-1">{value}</div>
              <div className="text-xs md:text-sm text-muted-foreground truncate">{label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Break-Glass Emergency Access ─────────────────────────────────── */}
      <Card className={`border-border/40 shadow-depth-md ${breakGlass ? 'border-red-500/50 bg-gradient-to-r from-red-500/15 to-orange-500/10' : 'glass-strong border-red-500/20'}`}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`p-2.5 rounded-xl ${breakGlass ? 'bg-red-500/25 animate-pulse' : 'bg-red-500/10'}`}>
                <Flame className={`h-5 w-5 ${breakGlass ? 'text-red-400' : 'text-red-400/70'}`} />
              </div>
              <div>
                <CardTitle className="text-base text-red-400">Emergency Break-Glass Access</CardTitle>
                <CardDescription>
                  {breakGlass ? 'ACTIVE — Emergency access is currently in effect' : 'Use only during critical security incidents'}
                </CardDescription>
              </div>
            </div>
            {breakGlass && (
              <Badge variant="destructive" className="text-xs animate-pulse">
                <Timer className="h-3 w-3 mr-1" />{breakGlassCountdown}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {breakGlass ? (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-red-300">Break-Glass Active</span>
                  <Badge variant="destructive" className="text-xs">{breakGlassCountdown} remaining</Badge>
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-white/30">Activated by</span>
                    <p className="text-white/70 font-medium">{breakGlass.activatedByName}</p>
                  </div>
                  <div>
                    <span className="text-white/30">Activated at</span>
                    <p className="text-white/70 font-medium">{new Date(breakGlass.activatedAt).toLocaleTimeString()}</p>
                  </div>
                  <div className="col-span-2">
                    <span className="text-white/30">Reason</span>
                    <p className="text-white/70 font-medium">{breakGlass.reason}</p>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDeactivateBreakGlass}
                  className="rounded-full btn-press text-xs border-red-500/30 hover:bg-red-500/10 text-red-400"
                >
                  <Lock className="h-3.5 w-3.5 mr-1.5" />Deactivate Emergency Access
                </Button>
                <span className="text-xs text-white/25">All conditional access policies are bypassed while active</span>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <p className="text-sm text-white/50 mb-1">
                  Grants temporary full admin access for 1 hour. Bypasses all conditional access policies.
                  Creates audit trail and notifies all admins.
                </p>
                <p className="text-xs text-white/25">
                  {breakGlassUsage24h}/3 activations used in the last 24 hours
                </p>
              </div>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setShowBreakGlassDialog(true)}
                disabled={breakGlassUsage24h >= 3}
                className="rounded-full btn-press text-xs shrink-0 ml-4"
              >
                <Unlock className="h-3.5 w-3.5 mr-1.5" />Break Glass
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Break-Glass Confirmation Dialog */}
      <Dialog open={showBreakGlassDialog} onOpenChange={setShowBreakGlassDialog}>
        <DialogContent className="glass-strong border-border/40 border-red-500/30 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-red-400 flex items-center gap-2">
              <Flame className="h-5 w-5" />Emergency Break-Glass Access
            </DialogTitle>
            <DialogDescription className="text-white/50">
              This action will grant temporary full admin access for 1 hour, bypass all conditional access
              policies, and notify all other admins. This is logged and audited.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
                <p className="text-xs text-red-300">
                  Break-glass access should only be used during critical security incidents when normal
                  authentication flows are unavailable. {3 - breakGlassUsage24h} activation(s) remaining in the next 24 hours.
                </p>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Incident reason (required)</Label>
              <Input
                placeholder="Describe the incident requiring emergency access..."
                className="glass-effect"
                value={breakGlassReason}
                onChange={e => setBreakGlassReason(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowBreakGlassDialog(false); setBreakGlassReason(''); }} className="rounded-full">
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleActivateBreakGlass}
              disabled={!breakGlassReason.trim()}
              className="rounded-full btn-press"
            >
              <Flame className="h-4 w-4 mr-2" />Confirm Break-Glass
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Session Management Dashboard ──────────────────────────────────── */}
      <Card id="section-sessions" className="border-border/40 glass-strong shadow-depth-md">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-blue-400/10"><Monitor className="h-5 w-5 text-blue-400" /></div>
              <div>
                <CardTitle className="text-base">Session Management</CardTitle>
                <CardDescription>Active sessions across the organisation — monitor and terminate</CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <PinButton sectionId="admin-sessions" principalId={pinPrincipalId} />
              <Badge variant="secondary" className="text-xs">
                <Activity className="h-3 w-3 mr-1" />{activeSessions.length} active
              </Badge>
              <Button variant="ghost" size="sm" onClick={refreshSessions} className="rounded-full btn-press text-xs">
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" />Refresh
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {activeSessions.length === 0 ? (
            <div className="py-10 text-center">
              <Monitor className="h-10 w-10 text-white/10 mx-auto mb-3" />
              <p className="text-sm text-white/30">No active sessions</p>
              <p className="text-xs text-white/20 mt-1">Sessions will appear when users log in</p>
            </div>
          ) : (
            <ScrollArea className="h-[320px]">
              <div className="space-y-2 pr-2">
                {activeSessions.sort((a, b) => b.loginAt - a.loginAt).map(sess => {
                  const duration = Date.now() - sess.loginAt;
                  const hours = Math.floor(duration / 3_600_000);
                  const mins = Math.floor((duration % 3_600_000) / 60_000);
                  const durationStr = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
                  // Parse browser from user agent
                  const ua = sess.device;
                  let browser = 'Unknown';
                  if (ua.includes('Chrome') && !ua.includes('Edg')) browser = 'Chrome';
                  else if (ua.includes('Firefox')) browser = 'Firefox';
                  else if (ua.includes('Safari') && !ua.includes('Chrome')) browser = 'Safari';
                  else if (ua.includes('Edg')) browser = 'Edge';

                  return (
                    <div key={sess.id} className="flex items-center gap-3 p-3 rounded-xl glass-effect border border-border/40 shadow-depth-sm">
                      <div className="p-2 rounded-lg bg-blue-400/10 shrink-0">
                        <Monitor className="h-4 w-4 text-blue-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-sm font-medium truncate">{sess.name}</span>
                          <Badge variant="secondary" className="text-[10px] shrink-0">{browser}</Badge>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-white/35">
                          <span>{sess.email}</span>
                          <span>IP: {sess.ipAddress}</span>
                          <span>Login: {new Date(sess.loginAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          <span className="flex items-center gap-1"><Clock className="h-2.5 w-2.5" />{durationStr}</span>
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleForceTerminate(sess.id)}
                        className="rounded-full btn-press text-xs border-red-500/30 hover:bg-red-500/10 text-red-400 shrink-0"
                      >
                        <LogOut className="h-3 w-3 mr-1" />Terminate
                      </Button>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* ── Conditional Access Policies ────────────────────────────────────── */}
      <Card className="border-border/40 glass-strong shadow-depth-md">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-amber-400/10"><ShieldAlert className="h-5 w-5 text-amber-400" /></div>
              <div>
                <CardTitle className="text-base">Conditional Access Policies</CardTitle>
                <CardDescription>Context-aware access rules based on device trust, MFA status, and session age</CardDescription>
              </div>
            </div>
            <Badge variant="secondary" className="text-xs">
              {caRules.filter(r => r.enabled).length}/{caRules.length} active
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {breakGlass && (
            <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center gap-2">
              <Flame className="h-4 w-4 text-red-400 shrink-0" />
              <p className="text-xs text-red-300">
                Break-glass mode is active — all conditional access policies are currently bypassed.
              </p>
            </div>
          )}
          <div className="space-y-2">
            {caRules.map(rule => (
              <div key={rule.id} className={`flex items-start gap-3 p-3 rounded-xl glass-effect border shadow-depth-sm ${breakGlass ? 'border-red-500/20 opacity-60' : 'border-border/40'}`}>
                <Switch
                  checked={rule.enabled}
                  onCheckedChange={() => handleToggleCaRule(rule.id)}
                  className="mt-0.5 shrink-0"
                  disabled={!!breakGlass}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                    <span className="text-sm font-medium">{rule.name}</span>
                    <Badge variant={rule.enabled ? 'default' : 'secondary'} className="text-[10px]">
                      {rule.condition === 'vault_mfa_timeout' ? 'Vault' : rule.condition === 'admin_hardware_key' ? 'Admin' : 'Export'}
                    </Badge>
                    {rule.thresholdMinutes && (
                      <Badge variant="outline" className="text-[10px]">
                        <Clock className="h-2.5 w-2.5 mr-0.5" />{rule.thresholdMinutes}min
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2">{rule.description}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ── User Management ──────────────────────────────────────────────── */}
      <Card id="section-users" className="border-border/40 glass-strong shadow-depth-md">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-primary/10"><Users className="h-5 w-5 text-primary" /></div>
              <div>
                <CardTitle className="text-base">User Management</CardTitle>
                <CardDescription>Directory, roles, MFA status, compliance, and lifecycle management</CardDescription>
              </div>
            </div>
            <PinButton sectionId="admin-users" principalId={pinPrincipalId} />
          </div>
        </CardHeader>
        <CardContent>
          <SectionErrorBoundary sectionName="UserManagement">
            <UserManagement />
          </SectionErrorBoundary>
        </CardContent>
      </Card>

      {/* ── Service Accounts & Non-Human Identity ──────────────────────── */}
      <Card id="section-service-accounts" className="border-border/40 glass-strong shadow-depth-md">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-violet-500/10"><Bot className="h-5 w-5 text-violet-400" /></div>
              <div>
                <CardTitle className="text-base">Service Accounts & Non-Human Identity</CardTitle>
                <CardDescription>Manage machine identities, API keys, rotation policies, and NHI lifecycle</CardDescription>
              </div>
            </div>
            <PinButton sectionId="admin-service-accounts" principalId={pinPrincipalId} />
          </div>
        </CardHeader>
        <CardContent>
          <SectionErrorBoundary sectionName="ServiceAccounts">
            <ServiceAccounts />
          </SectionErrorBoundary>
        </CardContent>
      </Card>

      {/* ── AI Agent Identity ─────────────────────────────────────────────── */}
      <Card id="section-ai-agents" className="border-border/40 glass-strong shadow-depth-md">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-400/10"><Bot className="h-5 w-5 text-blue-400" /></div>
            <div>
              <CardTitle className="text-base">AI Agent Identity</CardTitle>
              <CardDescription>Manage autonomous AI agent access, capabilities, and approval workflows</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <SectionErrorBoundary sectionName="AgentIdentity">
            <AgentIdentity />
          </SectionErrorBoundary>
        </CardContent>
      </Card>

      {/* Policies + Compliance side by side */}
      <div id="section-policies" className="grid md:grid-cols-2 gap-6">
        {/* Policy Management */}
        <Card className="border-border/40 glass-strong shadow-depth-md">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div><CardTitle>Security Policies</CardTitle><CardDescription>Enforce organisation-wide security rules</CardDescription></div>
              <div className="flex gap-2 items-center">
                <PinButton sectionId="admin-policies" principalId={pinPrincipalId} />
                <Button size="sm" variant="outline" onClick={handleGeneratePolicy} className="rounded-full btn-press text-xs">
                  <Brain className="h-3.5 w-3.5 mr-1" />AI Generate
                </Button>
                <Button size="sm" onClick={() => setShowPolicyDialog(true)} className="rounded-full btn-press text-xs">
                  <Plus className="h-3.5 w-3.5 mr-1" />Add
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[320px]">
              <div className="space-y-2">
                {policies.map(p => (
                  <div key={p.id} className="flex items-start gap-3 p-3 rounded-xl glass-effect border border-border/40 shadow-depth-sm">
                    <Switch
                      checked={p.enabled}
                      onCheckedChange={() => { togglePolicy(p.id); toast.success(`Policy ${p.enabled ? 'disabled' : 'enabled'}`); }}
                      className="mt-0.5 shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                        <span className="text-sm font-medium">{p.name}</span>
                        <Badge variant={p.severity === 'critical' ? 'destructive' : 'secondary'} className="text-[10px]">{p.severity}</Badge>
                        <Badge variant="outline" className="text-[10px]">{p.enforcement}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2">{p.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Compliance */}
        <Card className="border-border/40 glass-strong shadow-depth-md">
          <CardHeader>
            <CardTitle>Compliance Status</CardTitle>
            <CardDescription>Based on current policy enforcement and user posture</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {[
              { fw: 'Policy Coverage', score: policyCoverage, req: `${activePolicies} of ${policies.length} policies enabled` },
              { fw: 'MFA Adoption', score: mfaPct, req: `${mfaEnabled} of ${allUsers.length} users with MFA` },
              { fw: 'Vault Hygiene', score: vaultHygiene, req: `${vaultEntries.length - weakVault} of ${vaultEntries.length} entries meet strength requirements` },
              { fw: 'Overall', score: complianceScore, req: 'Weighted: 40% policy + 30% MFA + 30% vault' },
            ].map(({ fw, score, req }) => (
              <div key={fw} className="p-3 rounded-xl glass-effect border border-border/40">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm font-semibold">{fw}</span>
                  <span className={`text-sm font-bold ${score >= 85 ? 'text-success' : score >= 70 ? 'text-warning' : 'text-destructive'}`}>{score}%</span>
                </div>
                <Progress value={score} className="h-1.5 mb-1.5" />
                <p className="text-[10px] text-muted-foreground">{req}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* SSO & SIEM Integration Status */}
      <Card className="border-border/40 glass-strong shadow-depth-md">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>SSO & SIEM Integration</CardTitle>
              <CardDescription>Configure connectors in the SSO tab — status shown here</CardDescription>
            </div>
            <Badge variant="secondary"><Activity className="h-3 w-3 mr-1 animate-pulse" />Live</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-3 gap-4">
            {[
              { name: 'Microsoft Entra ID', key: 'entra_id', icon: '🔷', docs: 'https://learn.microsoft.com/en-us/entra/identity/' },
              { name: 'Okta', key: 'okta', icon: '🔵', docs: 'https://developer.okta.com/docs/' },
              { name: 'Splunk SIEM', key: 'splunk', icon: '📊', docs: 'https://docs.splunk.com/' },
            ].map(({ name, key, icon, docs }) => {
              const storedConnectors = (() => { try { const raw = JSON.parse(localStorage.getItem('nexus-connectors') ?? '[]'); return Array.isArray(raw) ? raw : Object.values(raw); } catch { return []; }})();
              const conn = storedConnectors.find((c: any) => c?.id === key || c?.name?.toLowerCase().includes(key));
              const status = conn?.status ?? 'disconnected';
              return (
                <div key={key} className="p-4 rounded-xl glass-effect border border-border/40 shadow-depth-sm card-tactile">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-2xl">{icon}</span>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-semibold text-sm truncate">{name}</h4>
                      <Badge variant={status === 'connected' ? 'default' : 'secondary'} className="text-[10px]">
                        {status === 'connected' ? '● Connected' : '○ Not configured'}
                      </Badge>
                    </div>
                  </div>
                  <a href={docs} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline flex items-center gap-1">
                    <ExternalLink className="h-3 w-3" />Docs
                  </a>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground mt-3">Configure SSO connectors in the <strong>SSO</strong> tab. Admin view shows aggregated connection status.</p>
        </CardContent>
      </Card>

      {/* ── Directory & Identity Sync ──────────────────────────────────────── */}
      <Card id="section-directory-sync" className="border-border/40 glass-strong shadow-depth-md">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-indigo-400/10"><FolderSync className="h-5 w-5 text-indigo-400" /></div>
              <div>
                <CardTitle className="text-base">Directory & Identity Sync</CardTitle>
                <CardDescription>SCIM 2.0 directory connectors, bidirectional sync, JIT provisioning, and SIEM forwarding</CardDescription>
              </div>
            </div>
            <PinButton sectionId="admin-directory" principalId={pinPrincipalId} />
          </div>
        </CardHeader>
        <CardContent>
          <SectionErrorBoundary sectionName="DirectorySync">
            <DirectorySync />
          </SectionErrorBoundary>
        </CardContent>
      </Card>

      {/* ── Hardware Key Inventory ────────────────────────────────────────── */}
      <Card id="section-hardware-keys" className="border-border/40 glass-strong shadow-depth-md">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-emerald-400/10"><Key className="h-5 w-5 text-emerald-400" /></div>
              <div>
                <CardTitle className="text-base">Hardware Key Inventory</CardTitle>
                <CardDescription>FIDO2/U2F hardware security keys across the organisation</CardDescription>
              </div>
            </div>
            <PinButton sectionId="admin-hardware" principalId={pinPrincipalId} />
          </div>
        </CardHeader>
        <CardContent>
          <SectionErrorBoundary sectionName="HardwareKeyManagement">
            <HardwareKeyManagement />
          </SectionErrorBoundary>
        </CardContent>
      </Card>

      {/* ── Protected Reports ─────────────────────────────────────────────── */}
      <Card id="section-reports" className="border-border/40 glass-strong shadow-depth-md">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-cyan-400/10"><BarChart3 className="h-5 w-5 text-cyan-400" /></div>
              <div>
                <CardTitle className="text-base">Protected Reports</CardTitle>
                <CardDescription>MFA-gated security and compliance report exports</CardDescription>
              </div>
            </div>
            <PinButton sectionId="admin-reports" principalId={pinPrincipalId} />
          </div>
        </CardHeader>
        <CardContent>
          <SectionErrorBoundary sectionName="ProtectedReports">
            <ProtectedReports reportData={{
              totalUsers: allUsers.length,
              activeUsers,
              mfaAdoption: mfaPct,
              activePolicies,
              complianceScore,
              weakPasswords: weakVault,
              hardwareKeys: (() => { try { return JSON.parse(localStorage.getItem('nexus-hardware-keys') ?? '[]').length; } catch { return 0; } })(),
              users: allUsers.map(u => ({ name: u.name, email: u.email, role: u.role, mfaEnabled: u.mfaEnabled, vaultCount: u.vaultCount })),
              policies: policies.map(p => ({ name: p.name, type: p.type, severity: p.severity, enabled: p.enabled, enforcement: p.enforcement })),
            }} />
          </SectionErrorBoundary>
        </CardContent>
      </Card>

      {/* Add Policy Dialog */}
      <Dialog open={showPolicyDialog} onOpenChange={setShowPolicyDialog}>
        <DialogContent className="glass-strong border-border/40 sm:max-w-md">
          <DialogHeader><DialogTitle>Create Security Policy</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Policy Name</Label>
              <Input placeholder="e.g., Contractor Access Expiry" className="glass-effect"
                value={newPolicy.name ?? ''} onChange={e => setNewPolicy(p => ({ ...p, name: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Input placeholder="What this policy enforces" className="glass-effect"
                value={newPolicy.description ?? ''} onChange={e => setNewPolicy(p => ({ ...p, description: e.target.value }))} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Type</Label>
                <Select value={newPolicy.type} onValueChange={v => setNewPolicy(p => ({ ...p, type: v as SecurityPolicy['type'] }))}>
                  <SelectTrigger className="glass-effect"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['password','mfa','session','vault','access','compliance'].map(t => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Severity</Label>
                <Select value={newPolicy.severity} onValueChange={v => setNewPolicy(p => ({ ...p, severity: v as SecurityPolicy['severity'] }))}>
                  <SelectTrigger className="glass-effect"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['low','medium','high','critical'].map(s => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Enforcement</Label>
                <Select value={newPolicy.enforcement} onValueChange={v => setNewPolicy(p => ({ ...p, enforcement: v as SecurityPolicy['enforcement'] }))}>
                  <SelectTrigger className="glass-effect"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="advisory">Advisory</SelectItem>
                    <SelectItem value="warn">Warn</SelectItem>
                    <SelectItem value="block">Block</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPolicyDialog(false)} className="rounded-full">Cancel</Button>
            <Button onClick={() => {
              const session = sessionStorage_.get();
              if (!newPolicy.name?.trim()) { toast.error('Policy name is required'); return; }
              addPolicy({
                id: crypto.randomUUID(),
                name: newPolicy.name.trim(),
                description: newPolicy.description ?? '',
                type: newPolicy.type ?? 'access',
                severity: newPolicy.severity ?? 'medium',
                enforcement: newPolicy.enforcement ?? 'warn',
                enabled: true,
                config: {},
                createdAt: Date.now(),
                createdBy: session?.principalId ?? 'admin',
                lastModified: Date.now(),
              });
              toast.success('Policy created');
              setNewPolicy({ type: 'password', severity: 'medium', enforcement: 'warn', enabled: true });
              setShowPolicyDialog(false);
            }} className="rounded-full btn-press">
              <Eye className="h-4 w-4 mr-2" />Create Policy
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Support Tickets ─────────────────────────────────────────────── */}
      <Card id="section-support" className="border-border/40 glass-strong shadow-depth-md">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-violet-400/10"><HelpCircle className="h-5 w-5 text-violet-400" /></div>
              <div>
                <CardTitle className="text-base">Support Tickets</CardTitle>
                <CardDescription>Help requests submitted by users</CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <PinButton sectionId="admin-support" principalId={pinPrincipalId} />
              <Button variant="ghost" size="sm" onClick={refreshTickets} className="rounded-full btn-press text-xs">
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" />Refresh
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {helpRequests.length === 0 ? (
            <div className="py-10 text-center">
              <MessageSquare className="h-10 w-10 text-white/10 mx-auto mb-3" />
              <p className="text-sm text-white/30">No support tickets yet</p>
              <p className="text-xs text-white/20 mt-1">User-submitted help requests will appear here</p>
            </div>
          ) : (
            <ScrollArea className="h-[360px]">
              <div className="space-y-2 pr-2">
                {helpRequests.sort((a, b) => b.createdAt - a.createdAt).map(req => {
                  const isSelected = selectedTicket === req.id;
                  const priorityMeta = HELP_PRIORITIES[req.priority];
                  const statusColor: Record<string, string> = {
                    open:        'text-amber-400 bg-amber-400/10',
                    in_progress: 'text-blue-400 bg-blue-400/10',
                    resolved:    'text-emerald-400 bg-emerald-400/10',
                    closed:      'text-white/30 bg-white/5',
                  };
                  return (
                    <div
                      key={req.id}
                      className="rounded-xl border border-border/40 glass-effect overflow-hidden"
                    >
                      <button
                        className="w-full text-left p-4"
                        onClick={() => { setSelectedTicket(isSelected ? null : req.id); setAdminNotesDraft(req.adminNotes ?? ''); }}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor[req.status]}`}>
                                {req.status.replace('_', ' ')}
                              </span>
                              <span className={`text-xs font-medium ${priorityMeta.color}`}>{priorityMeta.label}</span>
                              <span className="text-xs text-white/25">{HELP_CATEGORIES[req.category]}</span>
                            </div>
                            <p className="text-sm font-medium text-white/80 truncate">{req.subject}</p>
                            <p className="text-xs text-white/35 mt-0.5">{req.requesterName} · {req.requesterEmail}</p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-xs text-white/25">{new Date(req.createdAt).toLocaleDateString()}</p>
                            <p className="text-xs text-white/20">{new Date(req.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                          </div>
                        </div>
                      </button>

                      {isSelected && (
                        <div className="px-4 pb-4 space-y-3" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                          <p className="text-sm text-white/55 leading-relaxed pt-3">{req.message}</p>

                          <div className="space-y-1.5">
                            <Label className="text-xs text-white/30">Admin notes (optional)</Label>
                            <textarea
                              value={adminNotesDraft}
                              onChange={e => setAdminNotesDraft(e.target.value)}
                              placeholder="Add internal notes for this ticket…"
                              rows={2}
                              className="w-full rounded-lg px-3 py-2 text-xs glass-effect border border-border/40 bg-transparent text-white/70 placeholder:text-white/20 resize-none focus:outline-none focus:ring-1 focus:ring-violet-400/40"
                            />
                          </div>

                          <div className="flex items-center gap-2 flex-wrap">
                            {req.status === 'open' && (
                              <Button size="sm" className="rounded-full btn-press text-xs h-7"
                                onClick={() => updateTicketStatus(req.id, 'in_progress')}>
                                <Clock className="h-3 w-3 mr-1.5" />In Progress
                              </Button>
                            )}
                            {req.status !== 'resolved' && req.status !== 'closed' && (
                              <Button size="sm" variant="outline" className="rounded-full btn-press text-xs h-7 text-emerald-400 border-emerald-400/30"
                                onClick={() => updateTicketStatus(req.id, 'resolved')}>
                                <CheckSquare className="h-3 w-3 mr-1.5" />Resolve
                              </Button>
                            )}
                            {req.status !== 'closed' && (
                              <Button size="sm" variant="ghost" className="rounded-full btn-press text-xs h-7 text-white/30"
                                onClick={() => updateTicketStatus(req.id, 'closed')}>
                                Close ticket
                              </Button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
