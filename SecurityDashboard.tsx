import { useMemo } from 'react';
import { useGetDashboardData, useGetVaultEntries, useGetTeams } from './hooks/useQueries';
import { generateSecurePassword } from './lib/crypto';
import { loadPasskeys } from './lib/webauthn';
import { useInternetIdentity } from './hooks/useInternetIdentity';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import AISecurityCoach from './AISecurityCoach';
import { PinButton } from './CustomDashboard';
import {
  Shield,
  AlertTriangle,
  Key,
  Sparkles,
  TrendingUp,
  CheckCircle2,
  Clock,
  Smartphone,
  Laptop,
  Wifi,
  ShieldCheck,
  Activity,
  Zap,
  Users,
  RotateCw,
  Target,
  Lock
} from 'lucide-react';

export default function SecurityDashboard({ onNavigate }: { onNavigate?: (view: string) => void } = {}) {
  const { data: dashboardData, isLoading } = useGetDashboardData();
  const { data: vaultEntries } = useGetVaultEntries();
  const { data: teams } = useGetTeams();
  const { session } = useInternetIdentity();

  const passkeys = loadPasskeys();
  const securityScore = Number(dashboardData?.securityScore || 0);
  const secureAccounts = vaultEntries?.filter(e => (e.password || e.encryptedData || '').length >= 8).length || 0;
  const totalAccounts = vaultEntries?.length || 0;
  const passkeysActive = passkeys.length;
  const recommendationsCount = dashboardData?.recommendations?.length || 0;
  const lastLoginTime = session ? new Date(session.loginAt).toLocaleTimeString() : '—';
  const lastLoginDate = session ? new Date(session.loginAt).toLocaleDateString() : '—';

  const weakPasswordCount = dashboardData?.weakPasswords || 0;
  const hasRotationIssues = (dashboardData?.recommendations ?? []).some(
    (r) => r.category === 'Credential Rotation'
  );
  const hasMFA = passkeysActive > 0; // passkeys serve as MFA in this app
  const hasTeams = (teams?.length ?? 0) > 0;

  // Dynamic quick actions — prioritised by urgency, max 4 shown
  interface QuickActionDef {
    label: string;
    description: string;
    icon: typeof Key;
    urgency: 'critical' | 'warning' | 'suggestion';
    gradient: string;
    borderClass: string;
    onClick: () => void;
  }

  const dynamicActions = useMemo<QuickActionDef[]>(() => {
    const actions: QuickActionDef[] = [];

    if (passkeysActive === 0) {
      actions.push({
        label: 'Setup Passkey',
        description: 'No passkeys registered — add one now',
        icon: Key,
        urgency: 'critical',
        gradient: 'from-red-500/15 to-red-500/5',
        borderClass: 'border-red-500/40',
        onClick: () => onNavigate ? onNavigate('passkeys') : toast.info('Go to Passkeys tab to create a passkey'),
      });
    }

    if (weakPasswordCount > 0) {
      actions.push({
        label: 'Fix Weak Passwords',
        description: `${weakPasswordCount} weak password${weakPasswordCount !== 1 ? 's' : ''} found`,
        icon: AlertTriangle,
        urgency: 'critical',
        gradient: 'from-red-500/15 to-red-500/5',
        borderClass: 'border-red-500/40',
        onClick: () => onNavigate ? onNavigate('vault') : toast.info('Go to Vault to fix weak passwords'),
      });
    }

    if (!hasMFA) {
      actions.push({
        label: 'Enable MFA',
        description: 'No multi-factor auth enrolled',
        icon: Lock,
        urgency: 'critical',
        gradient: 'from-red-500/15 to-red-500/5',
        borderClass: 'border-red-500/40',
        onClick: () => onNavigate ? onNavigate('settings') : toast.info('Go to Settings to enable MFA'),
      });
    }

    if (hasRotationIssues) {
      actions.push({
        label: 'Rotate Credentials',
        description: 'Some credentials are overdue for rotation',
        icon: RotateCw,
        urgency: 'warning',
        gradient: 'from-amber-500/15 to-amber-500/5',
        borderClass: 'border-amber-500/40',
        onClick: () => onNavigate ? onNavigate('threat') : toast.info('Go to Threats to review rotation issues'),
      });
    }

    if (!hasTeams) {
      actions.push({
        label: 'Create Team',
        description: 'Set up secure team sharing',
        icon: Users,
        urgency: 'suggestion',
        gradient: 'from-green-500/15 to-green-500/5',
        borderClass: 'border-green-500/40',
        onClick: () => onNavigate ? onNavigate('team') : toast.info('Go to Team tab to create a team'),
      });
    }

    if (securityScore < 70) {
      actions.push({
        label: 'Run Threat Scan',
        description: 'Score is below 70 — scan for issues',
        icon: Target,
        urgency: 'warning',
        gradient: 'from-amber-500/15 to-amber-500/5',
        borderClass: 'border-amber-500/40',
        onClick: () => onNavigate ? onNavigate('threat') : toast.info('Go to Threats to run a scan'),
      });
    }

    // Always include Generate Password as a utility action
    actions.push({
      label: 'Generate Password',
      description: 'Ultra-secure random password',
      icon: ShieldCheck,
      urgency: 'suggestion',
      gradient: 'from-green-500/15 to-green-500/5',
      borderClass: 'border-green-500/40',
      onClick: () => {
        const pw = generateSecurePassword(20, { upper: true, lower: true, digits: true, symbols: true });
        navigator.clipboard.writeText(pw)
          .then(() => toast.success('Copied secure password (20 chars)'))
          .catch(() => toast.info(`Generated: ${pw}`));
      },
    });

    // Sort by urgency priority then take top 4
    const urgencyOrder = { critical: 0, warning: 1, suggestion: 2 };
    actions.sort((a, b) => urgencyOrder[a.urgency] - urgencyOrder[b.urgency]);
    return actions.slice(0, 4);
  }, [passkeysActive, weakPasswordCount, hasMFA, hasRotationIssues, hasTeams, securityScore, onNavigate]);

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-success';
    if (score >= 60) return 'text-warning';
    return 'text-destructive';
  };

  const getScoreGradient = (score: number) => {
    if (score >= 80) return 'gradient-success';
    if (score >= 60) return 'gradient-warning';
    return 'from-destructive/15 to-destructive/5';
  };

  const getWelcomeGradient = (score: number) => {
    if (score >= 80) return 'linear-gradient(135deg, rgba(34,197,94,0.15), rgba(34,197,94,0.05))';
    if (score >= 60) return 'linear-gradient(135deg, rgba(245,158,11,0.18), rgba(245,158,11,0.06))';
    return 'linear-gradient(135deg, rgba(239,68,68,0.18), rgba(239,68,68,0.06))';
  };

  const getWelcomeTextColor = (score: number) => {
    if (score >= 80) return 'text-success';
    if (score >= 60) return 'text-amber-400';
    return 'text-destructive';
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Welcome Section */}
      <div className="rounded-2xl p-6 border border-border/40" style={{ background: getWelcomeGradient(securityScore) }}>
        <h1 className="text-3xl font-bold mb-2">Welcome back!</h1>
        <p className={`${getWelcomeTextColor(securityScore)} font-medium`}>
          Your digital identity is <span className="font-bold">{securityScore}%</span> secure
          {securityScore < 60 && ' — immediate action recommended'}
          {securityScore >= 60 && securityScore < 80 && ' — some improvements needed'}
          {securityScore >= 80 && ' — looking great!'}
        </p>
      </div>

      {/* Security Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <MetricCard
          icon={Shield}
          label="Secure Accounts"
          value={secureAccounts.toString()}
          total={totalAccounts}
          color="success"
        />
        <MetricCard
          icon={AlertTriangle}
          label="Need Attention"
          value={recommendationsCount.toString()}
          color="warning"
        />
        <MetricCard
          icon={Key}
          label="Passkeys Active"
          value={passkeysActive.toString()}
          color="primary"
        />
        <MetricCard
          icon={Sparkles}
          label="MFA Status"
          value={hasMFA ? 'Enabled' : 'Off'}
          color={hasMFA ? 'accent' : 'warning'}
        />
      </div>

      {/* Main Security Score Card */}
      <Card id="section-security-score" className={`border-border/40 glass-strong shadow-depth-lg card-tactile ${getScoreGradient(securityScore)} overflow-hidden relative`}>
        <div className="absolute inset-0 bg-grid-subtle opacity-40" />
        <CardHeader className="relative">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-2xl mb-2">
                {session ? `Welcome back, ${session.name.split(' ')[0]}!` : 'Overall Security Score'}
              </CardTitle>
              <CardDescription>
                {session ? `${session.role} · ${session.tier} · Last login: ${lastLoginDate} ${lastLoginTime}` : `Based on ${totalAccounts} accounts and security practices`}
              </CardDescription>
            </div>
            <div className="flex items-start gap-3">
              <PinButton sectionId="security-score" principalId={session?.principalId ?? 'default'} />
              <div className="text-right">
              <div className={`text-5xl font-bold ${getScoreColor(securityScore)}`}>
                {securityScore}%
              </div>
              <div className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
                <TrendingUp className="h-4 w-4" />
                <span>Security score</span>
              </div>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="relative">
          <Progress value={securityScore} className="h-3 mb-6" />
          <div className="grid grid-cols-4 gap-4">
            <StatItem label="Secure Accounts" value={secureAccounts.toString()} />
            <StatItem label="Total Accounts" value={totalAccounts.toString()} />
            <StatItem label="Passkeys" value={passkeysActive.toString()} />
            <StatItem label="Recommendations" value={recommendationsCount.toString()} />
          </div>
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-3 gap-6">
        {/* Identity Hub */}
        <Card className="md:col-span-2 border-border/40 glass-strong shadow-depth-md card-tactile">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Identity Hub</CardTitle>
                <CardDescription className="text-xs">
                  {session ? `${session.principalId}` : 'No active session'}
                </CardDescription>
              </div>
              <Button size="sm" className="rounded-full btn-press" onClick={() => onNavigate?.('vault')}>
                <Sparkles className="h-4 w-4 mr-2" />
                Manage Vault
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[400px]">
              <div className="space-y-3">
                {vaultEntries && vaultEntries.length > 0 ? (
                  vaultEntries.slice(0, 8).map((entry) => {
                    const secret = entry.password || entry.encryptedData || '';
                    const score = secret.length >= 16 ? 95 : secret.length >= 12 ? 80 : secret.length >= 8 ? 65 : 40;
                    const ageDays = (Date.now() - Number(entry.updatedAt) / 1_000_000) / 86400000;
                    const status: 'secure' | 'warning' = score >= 80 && ageDays < 90 ? 'secure' : 'warning';
                    const categoryIcons: Record<string, string> = { password: '🔐', 'api-key': '🔑', 'credit-card': '💳', note: '📝' };
                    return (
                      <IdentityItem
                        key={entry.id}
                        name={entry.name}
                        subtitle={entry.username || entry.category}
                        lastUsed={new Date(Number(entry.updatedAt) / 1_000_000).toLocaleDateString()}
                        score={score}
                        status={status}
                        icon={categoryIcons[entry.category] ?? '🔐'}
                      />
                    );
                  })
                ) : (
                  <div className="flex flex-col items-center justify-center py-8 text-muted-foreground gap-3">
                    <p className="text-sm">No vault entries yet</p>
                    <Button size="sm" variant="outline" className="rounded-full btn-press" onClick={() => onNavigate?.('vault')}>
                      Add first entry
                    </Button>
                  </div>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* AI Security Assistant */}
        <AISecurityCoach />
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Device & Session Status */}
        <Card className="border-border/40 glass-strong shadow-depth-md card-tactile">
          <CardHeader>
            <CardTitle>Session & Devices</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <DeviceItem
                name={session ? `${session.name} (current)` : 'Current Device'}
                type={`${navigator.platform || 'Browser'} · ${session?.role ?? 'guest'}`}
                icon={Laptop}
                status="secure"
              />
              {passkeys.map((pk, i) => (
                <DeviceItem
                  key={pk.id}
                  name={pk.name || `Passkey ${i + 1}`}
                  type={`FIDO2 · Used ${pk.signCount}×`}
                  icon={Smartphone}
                  status="secure"
                />
              ))}
              {passkeys.length === 0 && (
                <div className="text-xs text-muted-foreground p-3 rounded-lg glass-effect border border-border/40">
                  No passkeys registered. Add one in the Passkeys tab for stronger security.
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Vault & Auth Status */}
        <Card className="border-border/40 glass-strong shadow-depth-md card-tactile">
          <CardHeader>
            <CardTitle>Security Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <NetworkItem label={`Vault (${totalAccounts} entries)`} status={totalAccounts > 0 ? 'Active' : 'Empty'} color={totalAccounts > 0 ? 'success' : 'primary'} />
              <NetworkItem label={`Passkeys (${passkeysActive})`} status={passkeysActive > 0 ? 'Registered' : 'None'} color={passkeysActive > 0 ? 'success' : 'primary'} />
              <NetworkItem label={`Threats (${recommendationsCount})`} status={recommendationsCount === 0 ? 'Clear' : 'Action needed'} color={recommendationsCount === 0 ? 'success' : 'destructive'} />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity */}
      {dashboardData?.recentActivity && dashboardData.recentActivity.length > 0 && (
        <Card className="border-border/40 glass-strong shadow-depth-md card-tactile">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Recent Activity</CardTitle>
              <Badge variant="secondary" className="text-xs">
                <Activity className="h-3 w-3 mr-1 animate-pulse" />
                Live
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {dashboardData.recentActivity.map((event) => (
                <div key={event.id} className="flex items-start gap-3 p-3 rounded-xl glass-effect border border-border/40 shadow-depth-sm">
                  <div className="p-2 rounded-lg bg-primary/10 mt-0.5">
                    <CheckCircle2 className="h-4 w-4 text-success" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-medium text-sm">{event.action}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{event.details}</p>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      <span>{event.deviceName}</span>
                      <span>{event.ipAddress}</span>
                      <span>{new Date(Number(event.timestamp) / 1_000_000).toLocaleTimeString()}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quick Actions — dynamic based on security state */}
      <Card id="section-quick-actions" className="border-border/40 glass-strong shadow-depth-md card-tactile">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Quick Security Actions</CardTitle>
              <CardDescription>Personalised actions based on your current security posture</CardDescription>
            </div>
            <PinButton sectionId="quick-actions" principalId={session?.principalId ?? 'default'} />
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-4 gap-4">
            {dynamicActions.map((action) => (
              <QuickAction
                key={action.label}
                label={action.label}
                description={action.description}
                gradient={action.gradient}
                borderClass={action.borderClass}
                icon={action.icon}
                urgency={action.urgency}
                onClick={action.onClick}
              />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function MetricCard({ icon: Icon, label, value, total, color }: any) {
  const colorClasses = {
    success: 'gradient-success text-success',
    warning: 'gradient-warning text-warning',
    primary: 'gradient-primary text-primary',
    accent: 'from-accent/15 to-accent/5 text-accent',
  };

  return (
    <Card className={`border-border/40 glass-strong shadow-depth-md card-tactile ${colorClasses[color]}`}>
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-3">
          <Icon className="h-6 w-6" />
          {total && (
            <Badge variant="secondary" className="text-xs">
              {value}/{total}
            </Badge>
          )}
        </div>
        <div className="text-3xl font-bold mb-1">{value}</div>
        <div className="text-sm opacity-90">{label}</div>
      </CardContent>
    </Card>
  );
}

function StatItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center">
      <div className="text-2xl font-bold mb-1">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function IdentityItem({ name, subtitle, lastUsed, score, status, icon }: any) {
  return (
    <div className="flex items-center gap-4 p-4 rounded-xl glass-effect border border-border/40 shadow-depth-sm card-tactile animate-slide-in">
      <div className="text-2xl">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <h4 className="font-semibold text-sm truncate">{name}</h4>
          <Badge variant="secondary" className={`text-xs shrink-0 ${score >= 80 ? 'text-success' : score >= 60 ? 'text-warning' : 'text-destructive'}`}>
            {score}%
          </Badge>
        </div>
        {subtitle && <p className="text-xs text-muted-foreground truncate">{subtitle}</p>}
        <p className="text-xs text-muted-foreground">Updated {lastUsed}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Progress value={score} className="w-16 h-1.5" />
        <Badge variant={status === 'secure' ? 'default' : 'destructive'} className="text-xs">
          {status}
        </Badge>
      </div>
    </div>
  );
}

function DeviceItem({ name, type, icon: Icon, status }: any) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-xl glass-effect border border-border/40 shadow-depth-sm">
      <div className="p-2.5 rounded-xl bg-primary/10 shadow-depth-sm">
        <Icon className="h-5 w-5 text-primary" />
      </div>
      <div className="flex-1">
        <h4 className="font-medium text-sm">{name}</h4>
        <p className="text-xs text-muted-foreground">{type}</p>
      </div>
      <CheckCircle2 className="h-5 w-5 text-success" />
    </div>
  );
}

function NetworkItem({ label, status, color }: any) {
  const colorClasses = {
    success: 'text-success',
    primary: 'text-primary',
    destructive: 'text-destructive',
  };

  return (
    <div className="flex items-center justify-between p-3 rounded-xl glass-effect border border-border/40 shadow-depth-sm">
      <div className="flex items-center gap-3">
        <Wifi className={`h-5 w-5 ${colorClasses[color]}`} />
        <span className="font-medium text-sm">{label}</span>
      </div>
      <Badge variant="secondary" className="text-xs">
        {status}
      </Badge>
    </div>
  );
}

function QuickAction({ label, description, gradient, borderClass, icon: Icon, onClick, urgency }: any) {
  const urgencyDot = urgency === 'critical' ? 'bg-red-400' : urgency === 'warning' ? 'bg-amber-400' : 'bg-emerald-400';
  const urgencyLabel = urgency === 'critical' ? 'Urgent' : urgency === 'warning' ? 'Recommended' : 'Suggested';
  const iconColor = urgency === 'critical' ? 'text-red-400' : urgency === 'warning' ? 'text-amber-400' : 'text-primary';

  return (
    <button
      onClick={onClick}
      className={`relative p-5 rounded-xl glass-strong border ${borderClass || 'border-border/40'} shadow-depth-sm card-tactile text-left btn-press group transition-all hover:shadow-depth-md`}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="p-2.5 rounded-xl glass-effect shadow-depth-sm">
          <Icon className={`h-5 w-5 ${iconColor}`} />
        </div>
        <div className="flex items-center gap-1.5">
          <div className={`h-1.5 w-1.5 rounded-full ${urgencyDot} ${urgency === 'critical' ? 'animate-pulse' : ''}`} />
          <span className="text-[10px] text-white/30 uppercase tracking-wider font-medium">{urgencyLabel}</span>
        </div>
      </div>
      <h4 className="font-semibold text-sm text-white/85 mb-0.5 group-hover:text-white/95 transition-colors">{label}</h4>
      <p className="text-xs text-white/35">{description}</p>
    </button>
  );
}
