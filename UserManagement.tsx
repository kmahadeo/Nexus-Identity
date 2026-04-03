/**
 * UserManagement.tsx — Admin user directory and lifecycle management.
 *
 * Modeled after Microsoft Entra ID, Okta, and Cisco Duo admin consoles.
 * Provides: user directory, role assignment, MFA status, hardware key tracking,
 * policy compliance, and user lifecycle (activate/deactivate/delete).
 */

import { useState, useMemo } from 'react';
import { sendInviteEmail, isEmailConfigured } from './lib/emailService';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import {
  Users, Search, UserPlus, Shield, Key, Fingerprint, AlertTriangle,
  CheckCircle2, XCircle, MoreVertical, Mail, Clock, Activity,
  ChevronDown, ChevronUp, Eye, Lock, Usb, RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';
import { userRegistry, type RegisteredUser, sessionStorage_, roleRegistry } from './lib/storage';
import { totpStorage } from './lib/totp';
import { getAuditLog, type AuditEvent } from './lib/auditLog';

/* ── Types ──────────────────────────────────────────────────────────────── */

interface UserDetail extends RegisteredUser {
  firstName: string;
  lastName: string;
  alias: string;
  passkeys: number;
  totpEnrolled: boolean;
  hardwareKeys: number;
  lastActivity: AuditEvent | null;
  policyCompliant: boolean;
  complianceIssues: string[];
}

/* ── Helpers ────────────────────────────────────────────────────────────── */

function enrichUser(u: RegisteredUser): UserDetail {
  const nameParts = (u.name || '').split(' ');
  const firstName = nameParts[0] || '';
  const lastName = nameParts.slice(1).join(' ') || '';
  const alias = u.email.split('@')[0] || '';

  // Check TOTP enrollment
  const totpCreds = totpStorage.getAll(u.principalId);
  const totpEnrolled = totpCreds.some(c => c.verified);

  // Check hardware keys
  let hardwareKeys = 0;
  try {
    const keys = JSON.parse(localStorage.getItem('nexus-hardware-keys') ?? '[]');
    hardwareKeys = keys.filter((k: any) => k.assignedTo === u.principalId && k.status === 'active').length;
  } catch {}

  // Get last activity from audit log
  const auditEvents = getAuditLog({ actor: u.principalId });
  const lastActivity = auditEvents.length > 0 ? auditEvents[0] : null;

  // Check policy compliance
  const complianceIssues: string[] = [];
  if (!u.mfaEnabled && u.passkeysCount === 0 && !totpEnrolled) complianceIssues.push('No MFA enrolled');
  if (u.vaultCount === 0) complianceIssues.push('Empty vault');
  if (hardwareKeys === 0 && u.role === 'admin') complianceIssues.push('Admin without hardware key');
  const daysSinceLogin = (Date.now() - u.lastLoginAt) / 86400000;
  if (daysSinceLogin > 30) complianceIssues.push(`Inactive ${Math.floor(daysSinceLogin)} days`);

  return {
    ...u,
    firstName,
    lastName,
    alias,
    passkeys: u.passkeysCount,
    totpEnrolled,
    hardwareKeys,
    lastActivity,
    policyCompliant: complianceIssues.length === 0,
    complianceIssues,
  };
}

/* ── Status config ──────────────────────────────────────────────────────── */

const ROLE_LABELS: Record<string, { label: string; color: string }> = {
  admin:      { label: 'Admin',       color: '#a78bfa' },
  individual: { label: 'Individual',  color: '#22d3ee' },
  team:       { label: 'Team Member', color: '#f59e0b' },
  contractor: { label: 'Contractor',  color: '#fb923c' },
  guest:      { label: 'Guest',       color: '#94a3b8' },
};

/* ── Component ──────────────────────────────────────────────────────────── */

export default function UserManagement() {
  const [users, setUsers] = useState<UserDetail[]>(() =>
    userRegistry.getAll().map(enrichUser)
  );
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [showAddUser, setShowAddUser] = useState(false);
  const [newUser, setNewUser] = useState({ firstName: '', lastName: '', email: '', role: 'individual' });

  const refresh = () => setUsers(userRegistry.getAll().map(enrichUser));

  const filtered = useMemo(() => {
    return users.filter(u => {
      if (search) {
        const q = search.toLowerCase();
        if (!u.name.toLowerCase().includes(q) &&
            !u.email.toLowerCase().includes(q) &&
            !u.alias.toLowerCase().includes(q)) return false;
      }
      if (roleFilter !== 'all' && u.role !== roleFilter) return false;
      if (statusFilter === 'active' && !u.isActive) return false;
      if (statusFilter === 'inactive' && u.isActive) return false;
      if (statusFilter === 'non-compliant' && u.policyCompliant) return false;
      return true;
    });
  }, [users, search, roleFilter, statusFilter]);

  // Stats
  const totalUsers = users.length;
  const activeUsers = users.filter(u => u.isActive).length;
  const mfaUsers = users.filter(u => u.mfaEnabled || u.passkeys > 0 || u.totpEnrolled).length;
  const nonCompliant = users.filter(u => !u.policyCompliant).length;

  const handleDeactivate = (principalId: string) => {
    userRegistry.deactivate(principalId);
    refresh();
    toast.success('User deactivated');
  };

  const handleReactivate = (principalId: string) => {
    // Reactivate by updating isActive
    const all = userRegistry.getAll();
    const updated = all.map(u => u.principalId === principalId ? { ...u, isActive: true } : u);
    localStorage.setItem('nexus-user-registry', JSON.stringify(updated));
    refresh();
    toast.success('User reactivated');
  };

  const handleChangeRole = (principalId: string, newRole: string) => {
    const all = userRegistry.getAll();
    const updated = all.map(u => u.principalId === principalId ? { ...u, role: newRole } : u);
    localStorage.setItem('nexus-user-registry', JSON.stringify(updated));
    // Also update role registry
    const user = all.find(u => u.principalId === principalId);
    if (user) {
      roleRegistry.save({ email: user.email, name: user.name, role: newRole as any, tier: user.tier as 'individual' | 'smb' | 'enterprise', principalId });
    }
    refresh();
    toast.success(`Role changed to ${newRole}`);
  };

  const handleAddUser = () => {
    if (!newUser.email.trim() || !newUser.firstName.trim()) {
      toast.error('First name and email are required');
      return;
    }
    const name = `${newUser.firstName.trim()} ${newUser.lastName.trim()}`.trim();
    const email = newUser.email.trim().toLowerCase();
    const principalId = `nexus-${newUser.role}-${btoa(email).replace(/[^a-z0-9]/gi, '').slice(0, 12)}`;
    const now = Date.now();

    // Add to user registry
    const all = userRegistry.getAll();
    if (all.some(u => u.email === email)) {
      toast.error('User with this email already exists');
      return;
    }
    all.push({
      principalId, name, email, role: newUser.role as any, tier: 'individual',
      firstLoginAt: now, lastLoginAt: now, isActive: true,
      mfaEnabled: false, passkeysCount: 0, vaultCount: 0,
    });
    localStorage.setItem('nexus-user-registry', JSON.stringify(all));
    roleRegistry.save({ email, name, role: newUser.role as any, tier: 'individual', principalId });

    // Sync new user to Supabase
    import('./lib/supabaseStorage').then(({ profilesDB }) => {
      profilesDB.upsert({
        principal_id: principalId, email, name, role: newUser.role,
        tier: 'individual', is_active: true, mfa_enabled: false,
        passkeys_count: 0, vault_count: 0,
      }).catch(() => {});
    });

    // Send invite email
    const session = sessionStorage_.get();
    sendInviteEmail(email, session?.name || 'Admin', newUser.role).then(sent => {
      if (sent) toast.success(`Invite email sent to ${email}`);
      else toast.info(`${name} added — configure email in Settings to send invites`);
    }).catch(() => {});

    setShowAddUser(false);
    setNewUser({ firstName: '', lastName: '', email: '', role: 'individual' });
    refresh();
    toast.success(`${name} added as ${newUser.role}`);
  };

  return (
    <div className="space-y-5">
      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Total Users', value: totalUsers, icon: Users, color: 'text-primary' },
          { label: 'Active', value: activeUsers, icon: CheckCircle2, color: 'text-emerald-400' },
          { label: 'MFA Enrolled', value: mfaUsers, icon: Shield, color: 'text-violet-400' },
          { label: 'Non-Compliant', value: nonCompliant, icon: AlertTriangle, color: nonCompliant > 0 ? 'text-red-400' : 'text-emerald-400' },
        ].map(s => (
          <div key={s.label} className="p-4 rounded-xl glass-effect border border-border/40 text-center">
            <s.icon className={`h-5 w-5 mx-auto mb-2 ${s.color}`} />
            <p className="text-2xl font-bold">{s.value}</p>
            <p className="text-xs text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/25" />
          <Input
            placeholder="Search by name, email, or alias..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 glass-effect text-sm"
          />
        </div>
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="w-[140px] glass-effect text-sm"><SelectValue placeholder="All Roles" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Roles</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
            <SelectItem value="individual">Individual</SelectItem>
            <SelectItem value="team">Team</SelectItem>
            <SelectItem value="contractor">Contractor</SelectItem>
            <SelectItem value="guest">Guest</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[150px] glass-effect text-sm"><SelectValue placeholder="All Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
            <SelectItem value="non-compliant">Non-Compliant</SelectItem>
          </SelectContent>
        </Select>
        <Button onClick={() => setShowAddUser(true)} className="rounded-full btn-press" size="sm">
          <UserPlus className="h-4 w-4 mr-1" /> Add User
        </Button>
        <Button onClick={refresh} variant="ghost" size="sm" className="rounded-full btn-press">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* User list */}
      <ScrollArea className="h-[500px]">
        <div className="space-y-2">
          {filtered.length === 0 ? (
            <div className="py-16 text-center">
              <Users className="h-10 w-10 mx-auto mb-3 text-white/15" />
              <p className="text-sm text-white/30">No users match your filters</p>
            </div>
          ) : filtered.map(user => {
            const isExpanded = expandedUser === user.principalId;
            const roleCfg = ROLE_LABELS[user.role] ?? ROLE_LABELS.individual;

            return (
              <div key={user.principalId} className="rounded-xl border border-border/40 glass-effect overflow-hidden">
                {/* User row */}
                <button
                  className="w-full text-left p-4 flex items-center gap-4"
                  onClick={() => setExpandedUser(isExpanded ? null : user.principalId)}
                >
                  {/* Avatar */}
                  <div
                    className="h-10 w-10 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                    style={{ background: `${roleCfg.color}20`, color: roleCfg.color }}
                  >
                    {user.firstName[0]}{user.lastName[0] || ''}
                  </div>

                  {/* Name + email */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-sm font-medium text-white/85 truncate">{user.name}</span>
                      {!user.isActive && <Badge variant="destructive" className="text-[10px]">Inactive</Badge>}
                      <Badge className="text-[10px]" style={{ background: `${roleCfg.color}20`, color: roleCfg.color, border: `1px solid ${roleCfg.color}30` }}>
                        {roleCfg.label}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-white/35">
                      <span>{user.email}</span>
                      <span>@{user.alias}</span>
                    </div>
                  </div>

                  {/* MFA status badges */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {user.passkeys > 0 && (
                      <Badge variant="secondary" className="text-[10px] px-1.5">
                        <Key className="h-2.5 w-2.5 mr-0.5" />{user.passkeys}
                      </Badge>
                    )}
                    {user.totpEnrolled && (
                      <Badge variant="secondary" className="text-[10px] px-1.5">
                        <Fingerprint className="h-2.5 w-2.5 mr-0.5" />TOTP
                      </Badge>
                    )}
                    {user.hardwareKeys > 0 && (
                      <Badge variant="secondary" className="text-[10px] px-1.5">
                        <Usb className="h-2.5 w-2.5 mr-0.5" />{user.hardwareKeys}
                      </Badge>
                    )}
                    {!user.policyCompliant && (
                      <Badge variant="destructive" className="text-[10px] px-1.5">
                        <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />
                      </Badge>
                    )}
                  </div>

                  {/* Expand chevron */}
                  {isExpanded ? <ChevronUp className="h-4 w-4 text-white/25 shrink-0" /> : <ChevronDown className="h-4 w-4 text-white/25 shrink-0" />}
                </button>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="px-4 pb-4 space-y-4" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                    {/* Detail grid */}
                    <div className="grid grid-cols-3 gap-3 pt-3">
                      <div className="p-3 rounded-lg glass-effect">
                        <p className="text-[10px] text-white/30 mb-1">First Name</p>
                        <p className="text-sm text-white/70">{user.firstName || '—'}</p>
                      </div>
                      <div className="p-3 rounded-lg glass-effect">
                        <p className="text-[10px] text-white/30 mb-1">Last Name</p>
                        <p className="text-sm text-white/70">{user.lastName || '—'}</p>
                      </div>
                      <div className="p-3 rounded-lg glass-effect">
                        <p className="text-[10px] text-white/30 mb-1">Alias</p>
                        <p className="text-sm text-white/70">@{user.alias}</p>
                      </div>
                      <div className="p-3 rounded-lg glass-effect">
                        <p className="text-[10px] text-white/30 mb-1">Vault Entries</p>
                        <p className="text-sm text-white/70">{user.vaultCount}</p>
                      </div>
                      <div className="p-3 rounded-lg glass-effect">
                        <p className="text-[10px] text-white/30 mb-1">Last Login</p>
                        <p className="text-sm text-white/70">{new Date(user.lastLoginAt).toLocaleDateString()}</p>
                      </div>
                      <div className="p-3 rounded-lg glass-effect">
                        <p className="text-[10px] text-white/30 mb-1">Tier</p>
                        <p className="text-sm text-white/70 capitalize">{user.tier}</p>
                      </div>
                    </div>

                    {/* MFA Status */}
                    <div className="p-3 rounded-lg glass-effect">
                      <p className="text-[10px] text-white/30 mb-2">Authentication Methods</p>
                      <div className="flex items-center gap-3">
                        <div className={`flex items-center gap-1.5 text-xs ${user.passkeys > 0 ? 'text-emerald-400' : 'text-white/25'}`}>
                          <Key className="h-3.5 w-3.5" />
                          {user.passkeys > 0 ? `${user.passkeys} passkey${user.passkeys > 1 ? 's' : ''}` : 'No passkeys'}
                        </div>
                        <div className={`flex items-center gap-1.5 text-xs ${user.totpEnrolled ? 'text-emerald-400' : 'text-white/25'}`}>
                          <Fingerprint className="h-3.5 w-3.5" />
                          {user.totpEnrolled ? 'TOTP active' : 'No TOTP'}
                        </div>
                        <div className={`flex items-center gap-1.5 text-xs ${user.hardwareKeys > 0 ? 'text-emerald-400' : 'text-white/25'}`}>
                          <Usb className="h-3.5 w-3.5" />
                          {user.hardwareKeys > 0 ? `${user.hardwareKeys} hardware key${user.hardwareKeys > 1 ? 's' : ''}` : 'No hardware keys'}
                        </div>
                      </div>
                    </div>

                    {/* Compliance issues */}
                    {user.complianceIssues.length > 0 && (
                      <div className="p-3 rounded-lg bg-red-500/5 border border-red-500/20">
                        <p className="text-[10px] text-red-400 mb-1.5 font-medium">Compliance Issues</p>
                        <ul className="space-y-1">
                          {user.complianceIssues.map((issue, i) => (
                            <li key={i} className="text-xs text-red-300/70 flex items-center gap-1.5">
                              <AlertTriangle className="h-3 w-3 shrink-0" />{issue}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Last activity */}
                    {user.lastActivity && (
                      <div className="p-3 rounded-lg glass-effect">
                        <p className="text-[10px] text-white/30 mb-1">Last Activity</p>
                        <p className="text-xs text-white/50">
                          {user.lastActivity.action} — {user.lastActivity.details}
                          <span className="text-white/25 ml-2">{new Date(user.lastActivity.timestamp).toLocaleString()}</span>
                        </p>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <Select
                        value={user.role}
                        onValueChange={(v) => handleChangeRole(user.principalId, v)}
                      >
                        <SelectTrigger className="w-[140px] h-8 glass-effect text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="individual">Individual</SelectItem>
                          <SelectItem value="team">Team Member</SelectItem>
                          <SelectItem value="contractor">Contractor</SelectItem>
                          <SelectItem value="guest">Guest</SelectItem>
                        </SelectContent>
                      </Select>

                      {user.isActive ? (
                        <Button
                          variant="outline" size="sm"
                          className="rounded-full text-xs h-8 text-red-400 border-red-500/30 hover:bg-red-500/10"
                          onClick={() => handleDeactivate(user.principalId)}
                        >
                          <XCircle className="h-3.5 w-3.5 mr-1" /> Deactivate
                        </Button>
                      ) : (
                        <Button
                          variant="outline" size="sm"
                          className="rounded-full text-xs h-8 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10"
                          onClick={() => handleReactivate(user.principalId)}
                        >
                          <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Reactivate
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

      {/* Add User Dialog */}
      <Dialog open={showAddUser} onOpenChange={setShowAddUser}>
        <DialogContent className="glass-strong border-border/40 sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add User</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-white/50">First Name *</Label>
                <Input
                  value={newUser.firstName}
                  onChange={(e) => setNewUser(n => ({ ...n, firstName: e.target.value }))}
                  className="glass-effect text-sm"
                  placeholder="Jane"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-white/50">Last Name</Label>
                <Input
                  value={newUser.lastName}
                  onChange={(e) => setNewUser(n => ({ ...n, lastName: e.target.value }))}
                  className="glass-effect text-sm"
                  placeholder="Doe"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-white/50">Email *</Label>
              <Input
                type="email"
                value={newUser.email}
                onChange={(e) => setNewUser(n => ({ ...n, email: e.target.value }))}
                className="glass-effect text-sm"
                placeholder="jane@company.com"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-white/50">Role</Label>
              <Select value={newUser.role} onValueChange={(v) => setNewUser(n => ({ ...n, role: v }))}>
                <SelectTrigger className="glass-effect text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="individual">Individual</SelectItem>
                  <SelectItem value="team">Team Member</SelectItem>
                  <SelectItem value="contractor">Contractor</SelectItem>
                  <SelectItem value="guest">Guest (Read-Only)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddUser(false)} className="rounded-full">Cancel</Button>
            <Button onClick={handleAddUser} className="rounded-full btn-press"
              style={{ background: 'linear-gradient(135deg, rgba(139,92,246,0.9), rgba(167,139,250,0.8))', border: 'none' }}>
              Add User
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
