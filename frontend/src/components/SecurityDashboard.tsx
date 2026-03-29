import { useGetDashboardData, useGetVaultEntries, useGetPasskeyCount, useAddPasskeyCredential } from '../hooks/useQueries';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import AISecurityCoach from './AISecurityCoach';
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
  Zap
} from 'lucide-react';
import { toast } from 'sonner';
import { createPasskey, isWebAuthnSupported } from '../lib/webauthn';
import { useInternetIdentity } from '../hooks/useInternetIdentity';

interface SecurityDashboardProps {
  onNavigate: (view: string) => void;
}

export default function SecurityDashboard({ onNavigate }: SecurityDashboardProps) {
  const { data: dashboardData, isLoading } = useGetDashboardData();
  const { data: vaultEntries } = useGetVaultEntries();
  const { identity } = useInternetIdentity();
  const { mutateAsync: addPasskey } = useAddPasskeyCredential();

  const securityScore = Number(dashboardData?.securityScore || 0);
  const secureAccounts = vaultEntries?.filter(e => e.encryptedData.length >= 12).length || 0;
  const totalAccounts = vaultEntries?.length || 0;
  const { data: passkeyCount = 0 } = useGetPasskeyCount();
  const passkeysActive = passkeyCount;
  const recommendationsCount = dashboardData?.recommendations?.length || 0;

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

  const handleSetupPasskey = async () => {
    if (passkeyCount > 0) {
      toast.success('Passkey already active', { description: `${passkeyCount} passkey(s) registered.` });
      return;
    }
    if (!isWebAuthnSupported()) {
      toast.error('WebAuthn not supported in this browser');
      return;
    }
    try {
      const userId = identity?.getPrincipal().toText() || 'anonymous';
      const result = await createPasskey(userId, userId);
      await addPasskey({
        credentialId: result.credentialId,
        publicKeyHint: result.publicKeyHint,
        deviceName: result.deviceName,
        createdAt: BigInt(Date.now() * 1000000),
        lastUsed: BigInt(Date.now() * 1000000),
        transports: result.transports,
      });
      toast.success('Passkey created successfully');
    } catch (error: any) {
      if (error?.name === 'NotAllowedError') {
        toast.error('Passkey creation was cancelled');
      } else {
        toast.error(error?.message || 'Failed to create passkey');
      }
    }
  };

  const handleAIScan = () => {
    onNavigate('threat');
  };

  const handleGeneratePassword = () => {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()-_=+';
    let password = '';
    for (let i = 0; i < 32; i++) {
      password += chars[array[i] % chars.length];
    }
    navigator.clipboard.writeText(password);
    toast.success('32-character password generated & copied', {
      description: 'Open Password Manager to save it to your vault.',
      action: { label: 'Go to Vault', onClick: () => onNavigate('vault') },
    });
  };

  const handleFamilySharing = () => {
    onNavigate('team');
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Welcome Section */}
      <div>
        <h1 className="text-3xl font-bold mb-2">Welcome back!</h1>
        <p className="text-muted-foreground">Your digital identity is {securityScore}% secure</p>
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
          label="AI Protection"
          value="Active"
          color="accent"
        />
      </div>

      {/* Main Security Score Card */}
      <Card className={`border-border/40 glass-strong shadow-depth-lg card-tactile ${getScoreGradient(securityScore)} overflow-hidden relative`}>
        <div className="absolute inset-0 bg-grid-subtle opacity-40" />
        <CardHeader className="relative">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-2xl mb-2">Overall Security Score</CardTitle>
              <CardDescription>Based on {totalAccounts} accounts and security practices</CardDescription>
            </div>
            <div className="text-right">
              <div className={`text-5xl font-bold ${getScoreColor(securityScore)}`}>
                {securityScore}%
              </div>
              <div className="flex items-center gap-1 text-sm text-success mt-1">
                <TrendingUp className="h-4 w-4" />
                <span>Live score</span>
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
              <CardTitle>Identity Hub</CardTitle>
              <Button size="sm" className="rounded-full btn-press" onClick={() => onNavigate('vault')}>
                <Sparkles className="h-4 w-4 mr-2" />
                Add Identity
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[400px]">
              <div className="space-y-3">
                {vaultEntries && vaultEntries.length > 0 ? (
                  vaultEntries.slice(0, 5).map((entry) => {
                    const score = entry.encryptedData.length >= 12 ? 90 : 60;
                    const status = score >= 80 ? 'secure' : 'warning';
                    return (
                      <IdentityItem
                        key={entry.id}
                        name={entry.name}
                        lastUsed={new Date(Number(entry.updatedAt) / 1000000).toLocaleDateString()}
                        score={score}
                        status={status}
                        icon="🔐"
                        onClick={() => onNavigate('vault')}
                      />
                    );
                  })
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <p className="text-sm">No vault entries yet</p>
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
        {/* Device Status */}
        <Card className="border-border/40 glass-strong shadow-depth-md card-tactile">
          <CardHeader>
            <CardTitle>Device Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <DeviceItem
                name="Primary Device"
                type="Trusted"
                icon={Smartphone}
                status="secure"
              />
              <DeviceItem
                name="Work Device"
                type="Trusted"
                icon={Laptop}
                status="secure"
              />
            </div>
          </CardContent>
        </Card>

        {/* Network Security */}
        <Card className="border-border/40 glass-strong shadow-depth-md card-tactile">
          <CardHeader>
            <CardTitle>Network Security</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <NetworkItem label="VPN Active" status="Secure" color="success" />
              <NetworkItem label="Firewall" status="Active" color="success" />
              <NetworkItem label="Threat Monitor" status="Scanning" color="primary" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card className="border-border/40 glass-strong shadow-depth-md card-tactile">
        <CardHeader>
          <CardTitle>Quick Security Actions</CardTitle>
          <CardDescription>Improve your security score with these recommended actions</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-4 gap-4">
            <QuickAction
              label="Setup Passkey"
              description="Passwordless login"
              gradient="gradient-success"
              icon={Key}
              onClick={handleSetupPasskey}
            />
            <QuickAction
              label="AI Security Scan"
              description="Smart analysis"
              gradient="gradient-primary"
              icon={Sparkles}
              onClick={handleAIScan}
            />
            <QuickAction
              label="Generate Password"
              description="Ultra-secure"
              gradient="from-accent/15 to-accent/5"
              icon={ShieldCheck}
              onClick={handleGeneratePassword}
            />
            <QuickAction
              label="Family Sharing"
              description="Secure access"
              gradient="gradient-warning"
              icon={Activity}
              onClick={handleFamilySharing}
            />
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

function IdentityItem({ name, lastUsed, score, status, icon, onClick }: any) {
  return (
    <div className="flex items-center gap-4 p-4 rounded-xl glass-effect border border-border/40 shadow-depth-sm card-tactile animate-slide-in">
      <div className="text-3xl">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <h4 className="font-semibold">{name}</h4>
          <Badge variant="secondary" className="text-xs">
            {score}%
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">Last used {lastUsed}</p>
      </div>
      <div className="flex items-center gap-2">
        <Progress value={score} className="w-20 h-2" />
        <Badge variant={status === 'secure' ? 'default' : 'destructive'} className="text-xs">
          {status}
        </Badge>
      </div>
      <Button variant="ghost" size="icon" className="rounded-full btn-press hover-scale" onClick={onClick}>
        →
      </Button>
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

function QuickAction({ label, description, gradient, icon: Icon, onClick }: any) {
  return (
    <button onClick={onClick} className={`p-6 rounded-xl ${gradient} border border-border/40 shadow-depth-sm card-tactile text-left btn-press`}>
      <Icon className="h-8 w-8 mb-3" />
      <h4 className="font-semibold mb-1">{label}</h4>
      <p className="text-xs opacity-80">{description}</p>
    </button>
  );
}
