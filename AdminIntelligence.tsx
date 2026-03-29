import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
  Brain, Shield, AlertTriangle, Users, Activity, Zap, CheckCircle2, Target,
  FileText, ExternalLink, UserX, RefreshCw, Download, Plus, Eye,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  useGetAllUsers, useDeactivateUser, useGetPolicies, useTogglePolicy, useAddPolicy,
  useGetVaultEntries,
} from './hooks/useQueries';
import { policyStorage, type SecurityPolicy } from './lib/storage';
import { sessionStorage_ } from './lib/storage';

export default function AdminIntelligence() {
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

  const activeUsers  = allUsers.filter(u => u.isActive).length;
  const mfaEnabled   = allUsers.filter(u => u.mfaEnabled).length;
  const mfaPct       = allUsers.length > 0 ? Math.round((mfaEnabled / allUsers.length) * 100) : 0;
  const activePolicies = policies.filter(p => p.enabled).length;
  const weakVault    = vaultEntries.filter(e => (e.password || '').length < 12).length;
  const complianceScore = Math.max(60, 100 - weakVault * 3 - (mfaPct < 80 ? 10 : 0));

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

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold mb-2">Admin Intelligence Dashboard</h1>
          <p className="text-muted-foreground">Organisation-wide security management, policy enforcement, and user governance</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleExportReport} className="rounded-full btn-press text-xs">
            <Download className="h-3.5 w-3.5 mr-1.5" />Export Report
          </Button>
          <Badge variant="secondary"><Brain className="h-4 w-4 mr-1" />Admin</Badge>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid md:grid-cols-4 gap-4">
        {[
          { icon: Users, label: 'Registered Users', value: allUsers.length, sub: `${activeUsers} active`, gradient: 'gradient-primary' },
          { icon: Shield, label: 'MFA Adoption', value: `${mfaPct}%`, sub: `${mfaEnabled}/${allUsers.length} users`, gradient: 'gradient-success' },
          { icon: Target, label: 'Active Policies', value: activePolicies, sub: `${policies.length} total`, gradient: 'gradient-warning' },
          { icon: CheckCircle2, label: 'Compliance Score', value: `${complianceScore}%`, sub: 'SOC2 / ISO27001', gradient: 'from-accent/15 to-accent/5' },
        ].map(({ icon: Icon, label, value, sub, gradient }) => (
          <Card key={label} className={`border-border/40 glass-strong shadow-depth-md card-tactile ${gradient}`}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-3"><Icon className="h-7 w-7" /><Badge variant="secondary" className="text-xs">{sub}</Badge></div>
              <div className="text-3xl font-bold mb-1">{value}</div>
              <div className="text-sm text-muted-foreground">{label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Registered Users */}
      <Card className="border-border/40 glass-strong shadow-depth-md">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Registered Users</CardTitle>
              <CardDescription>All accounts who have authenticated with Nexus Identity</CardDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={() => refetchUsers()} className="rounded-full text-xs">
              <RefreshCw className="h-3.5 w-3.5 mr-1" />Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {allUsers.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No users registered yet. Users appear here when they log in.</p>
            </div>
          ) : (
            <ScrollArea className="h-[300px]">
              <div className="space-y-2">
                {allUsers.map(u => (
                  <div key={u.principalId} className="flex items-center gap-3 p-3 rounded-xl glass-effect border border-border/40 shadow-depth-sm">
                    <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary flex-shrink-0">
                      {u.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-sm font-medium truncate">{u.name}</span>
                        <Badge variant="secondary" className="text-[10px] capitalize shrink-0">{u.role}</Badge>
                        {!u.isActive && <Badge variant="destructive" className="text-[10px] shrink-0">Deactivated</Badge>}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span>{u.email}</span>
                        <span>Vault: {u.vaultCount}</span>
                        <span>Passkeys: {u.passkeysCount}</span>
                        {u.mfaEnabled && <span className="text-success">✓ MFA</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <span className="text-xs text-muted-foreground">{u.tier}</span>
                      {u.isActive && (
                        <Button
                          variant="ghost" size="icon"
                          onClick={() => { deactivateUser(u.principalId); toast.success(`${u.name} deactivated`); }}
                          className="h-7 w-7 rounded-full hover:text-destructive btn-press"
                          title="Deactivate user"
                        >
                          <UserX className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* Policies + Compliance side by side */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Policy Management */}
        <Card className="border-border/40 glass-strong shadow-depth-md">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div><CardTitle>Security Policies</CardTitle><CardDescription>Enforce organisation-wide security rules</CardDescription></div>
              <div className="flex gap-2">
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
              { fw: 'SOC2 Type II', score: complianceScore, req: 'Audit logging, access controls, encryption' },
              { fw: 'ISO 27001', score: Math.min(complianceScore - 3, 99), req: 'ISMS, risk management, business continuity' },
              { fw: 'GDPR', score: Math.min(complianceScore + 2, 99), req: 'Data protection, consent, breach notification' },
              { fw: 'NIST CSF', score: Math.min(complianceScore - 5, 99), req: 'Identify, protect, detect, respond, recover' },
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
              const storedConnectors = (() => { try { return JSON.parse(localStorage.getItem('nexus-connectors') ?? '[]'); } catch { return []; }})();
              const conn = storedConnectors.find((c: {id: string}) => c.id === key);
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
    </div>
  );
}
