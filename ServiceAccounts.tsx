/**
 * ServiceAccounts.tsx — Service Accounts & Non-Human Identity management.
 *
 * Enterprise-grade NHI admin panel. Manages service/agent/machine identities,
 * API key lifecycle, rotation policies, and activity tracking.
 * Follows AURA design system patterns from the existing codebase.
 */

import { useState, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import {
  Bot, Plus, Key, Trash2, Search, AlertTriangle, RefreshCw,
  Copy, Eye, EyeOff, ChevronDown, ChevronUp, Activity,
  Pause, Play, RotateCcw, XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { sessionStorage_ } from './lib/storage';
import {
  getServiceAccounts,
  saveServiceAccount,
  deleteServiceAccount,
  suspendServiceAccount,
  activateServiceAccount,
  generateApiKey,
  revokeApiKey,
  getAccountActivity,
  checkKeyRotation,
  SERVICE_SCOPES,
  type ServiceAccount,
  type ServiceApiKey,
} from './lib/serviceAccounts';
import type { Permission } from './lib/permissions';

/* ── Available permissions for service accounts ──────────────────────── */

const AVAILABLE_PERMISSIONS: { value: Permission; label: string; group: string }[] = [
  { value: 'vault:read:own', label: 'Vault Read (Own)', group: 'Vault' },
  { value: 'vault:read:shared', label: 'Vault Read (Shared)', group: 'Vault' },
  { value: 'vault:read:all', label: 'Vault Read (All)', group: 'Vault' },
  { value: 'vault:write:own', label: 'Vault Write (Own)', group: 'Vault' },
  { value: 'vault:write:shared', label: 'Vault Write (Shared)', group: 'Vault' },
  { value: 'team:read', label: 'Team Read', group: 'Teams' },
  { value: 'team:write', label: 'Team Write', group: 'Teams' },
  { value: 'admin:users:read', label: 'Users Read', group: 'Admin' },
  { value: 'admin:audit:read', label: 'Audit Read', group: 'Admin' },
  { value: 'admin:siem:read', label: 'SIEM Read', group: 'Admin' },
  { value: 'integrations:read', label: 'Integrations Read', group: 'Integrations' },
  { value: 'integrations:write', label: 'Integrations Write', group: 'Integrations' },
  { value: 'developer:read', label: 'Developer Read', group: 'Developer' },
  { value: 'developer:write', label: 'Developer Write', group: 'Developer' },
];

/* ── Helpers ────────────────────────────────────────────────────────────── */

function formatRelativeTime(ts: number | null): string {
  if (!ts) return 'Never';
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'Just now';
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`;
  return `${Math.floor(diff / 86400_000)}d ago`;
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

const TYPE_COLORS: Record<string, string> = {
  service: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  agent: 'bg-violet-500/15 text-violet-400 border-violet-500/30',
  machine: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
};

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-500/15 text-green-400 border-green-500/30',
  suspended: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  expired: 'bg-red-500/15 text-red-400 border-red-500/30',
};

/* ── Component ──────────────────────────────────────────────────────────── */

export default function ServiceAccounts() {
  const [accounts, setAccounts] = useState<ServiceAccount[]>(() => getServiceAccounts());
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showKeyDialog, setShowKeyDialog] = useState(false);
  const [activeAccountId, setActiveAccountId] = useState<string | null>(null);
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [keyName, setKeyName] = useState('');
  const [showKey, setShowKey] = useState(true);

  // Create form state
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<'service' | 'agent' | 'machine'>('service');
  const [newDescription, setNewDescription] = useState('');
  const [newPermissions, setNewPermissions] = useState<Permission[]>([]);
  const [newScopes, setNewScopes] = useState<string[]>([]);
  const [newRotationPolicy, setNewRotationPolicy] = useState<number>(90);
  const [newExpiry, setNewExpiry] = useState<string>('');

  const refresh = useCallback(() => setAccounts(getServiceAccounts()), []);

  // Rotation alerts
  const rotationAlerts = useMemo(() => checkKeyRotation(), [accounts]);

  // Filtered accounts
  const filtered = useMemo(() => {
    if (!search.trim()) return accounts;
    const q = search.toLowerCase();
    return accounts.filter(a =>
      a.name.toLowerCase().includes(q) ||
      a.type.includes(q) ||
      a.ownerEmail.toLowerCase().includes(q) ||
      a.status.includes(q),
    );
  }, [accounts, search]);

  // Overview stats
  const stats = useMemo(() => ({
    total: accounts.length,
    active: accounts.filter(a => a.status === 'active').length,
    suspended: accounts.filter(a => a.status === 'suspended').length,
    expired: accounts.filter(a => a.status === 'expired').length,
    rotationOverdue: rotationAlerts.length,
  }), [accounts, rotationAlerts]);

  /* ── Create handler ──────────────────────────────────────────────────── */

  const handleCreate = useCallback(() => {
    if (!newName.trim()) {
      toast.error('Account name is required');
      return;
    }
    const session = sessionStorage_.get();
    if (!session) {
      toast.error('No active session');
      return;
    }

    const account: ServiceAccount = {
      id: crypto.randomUUID(),
      name: newName.trim(),
      type: newType,
      description: newDescription.trim(),
      ownerId: session.principalId,
      ownerEmail: session.email,
      status: 'active',
      apiKeys: [],
      permissions: newPermissions,
      scopes: newScopes,
      rotationPolicy: newRotationPolicy,
      lastActivity: null,
      createdAt: Date.now(),
      expiresAt: newExpiry ? new Date(newExpiry).getTime() : null,
    };

    saveServiceAccount(account);
    refresh();
    resetCreateForm();
    setShowCreateDialog(false);
    toast.success(`Service account "${account.name}" created`);
  }, [newName, newType, newDescription, newPermissions, newScopes, newRotationPolicy, newExpiry, refresh]);

  const resetCreateForm = () => {
    setNewName('');
    setNewType('service');
    setNewDescription('');
    setNewPermissions([]);
    setNewScopes([]);
    setNewRotationPolicy(90);
    setNewExpiry('');
  };

  /* ── Key generation handler ──────────────────────────────────────────── */

  const handleGenerateKey = useCallback(async () => {
    if (!activeAccountId || !keyName.trim()) {
      toast.error('Key name is required');
      return;
    }
    const result = await generateApiKey(activeAccountId, keyName.trim());
    if (result) {
      setGeneratedKey(result.plaintext);
      setShowKey(true);
      refresh();
      toast.success('API key generated');
    } else {
      toast.error('Failed to generate API key');
    }
  }, [activeAccountId, keyName, refresh]);

  /* ── Action handlers ─────────────────────────────────────────────────── */

  const handleSuspend = useCallback((id: string) => {
    suspendServiceAccount(id);
    refresh();
    toast.success('Service account suspended');
  }, [refresh]);

  const handleActivate = useCallback((id: string) => {
    activateServiceAccount(id);
    refresh();
    toast.success('Service account activated');
  }, [refresh]);

  const handleDelete = useCallback((id: string) => {
    deleteServiceAccount(id);
    refresh();
    setExpandedId(null);
    toast.success('Service account deleted');
  }, [refresh]);

  const handleRevokeKey = useCallback((accountId: string, keyId: string) => {
    revokeApiKey(accountId, keyId);
    refresh();
    toast.success('API key revoked');
  }, [refresh]);

  const handleRotateKeys = useCallback(async (accountId: string) => {
    setActiveAccountId(accountId);
    setKeyName(`rotated-${Date.now()}`);
    setGeneratedKey(null);
    setShowKeyDialog(true);
  }, []);

  const openKeyDialog = useCallback((accountId: string) => {
    setActiveAccountId(accountId);
    setKeyName('');
    setGeneratedKey(null);
    setShowKeyDialog(true);
  }, []);

  const copyToClipboard = useCallback((text: string) => {
    navigator.clipboard.writeText(text).then(() => toast.success('Copied to clipboard'));
  }, []);

  const togglePermission = (perm: Permission) => {
    setNewPermissions(prev =>
      prev.includes(perm) ? prev.filter(p => p !== perm) : [...prev, perm],
    );
  };

  const toggleScope = (scope: string) => {
    setNewScopes(prev =>
      prev.includes(scope) ? prev.filter(s => s !== scope) : [...prev, scope],
    );
  };

  return (
    <div className="space-y-6">
      {/* ── Overview Stats ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: 'Total', value: stats.total, color: 'text-white/70' },
          { label: 'Active', value: stats.active, color: 'text-green-400' },
          { label: 'Suspended', value: stats.suspended, color: 'text-amber-400' },
          { label: 'Expired', value: stats.expired, color: 'text-red-400' },
          { label: 'Rotation Due', value: stats.rotationOverdue, color: stats.rotationOverdue > 0 ? 'text-orange-400' : 'text-white/40' },
        ].map(s => (
          <div key={s.label} className="p-3 rounded-xl glass-effect border border-border/30 text-center">
            <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
            <div className="text-xs text-white/40 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* ── Rotation Alerts ──────────────────────────────────────────────── */}
      {rotationAlerts.length > 0 && (
        <div className="p-4 rounded-xl bg-orange-500/10 border border-orange-500/30 space-y-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-orange-400 shrink-0" />
            <span className="text-sm font-semibold text-orange-300">
              {rotationAlerts.length} account{rotationAlerts.length !== 1 ? 's' : ''} with keys overdue for rotation
            </span>
          </div>
          {rotationAlerts.map(({ account, overdueKeys }) => (
            <div key={account.id} className="flex items-center justify-between text-xs">
              <div>
                <span className="text-white/70 font-medium">{account.name}</span>
                <span className="text-white/30 ml-2">
                  {overdueKeys.length} key{overdueKeys.length !== 1 ? 's' : ''} overdue
                </span>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="rounded-full btn-press text-xs h-7 border-orange-500/30 hover:bg-orange-500/10 text-orange-400"
                onClick={() => handleRotateKeys(account.id)}
              >
                <RotateCcw className="h-3 w-3 mr-1" />Rotate Now
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* ── Toolbar ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search service accounts..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-10 rounded-full bg-white/5 border-border/30"
          />
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={refresh}
          className="rounded-full btn-press text-xs border-border/30"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="sm"
          onClick={() => { resetCreateForm(); setShowCreateDialog(true); }}
          className="rounded-full btn-press text-xs bg-primary/90 hover:bg-primary"
        >
          <Plus className="h-3.5 w-3.5 mr-1.5" />Create Account
        </Button>
      </div>

      {/* ── Account List ─────────────────────────────────────────────────── */}
      <ScrollArea className="max-h-[600px]">
        {filtered.length === 0 ? (
          <div className="text-center py-12 space-y-3">
            <Bot className="h-10 w-10 mx-auto text-white/20" />
            <p className="text-sm text-white/40">
              {accounts.length === 0
                ? 'No service accounts yet. Create one to get started.'
                : 'No accounts match your search.'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(account => {
              const isExpanded = expandedId === account.id;
              const activity = isExpanded ? getAccountActivity(account.id) : [];
              return (
                <div
                  key={account.id}
                  className="rounded-xl border border-border/30 glass-effect overflow-hidden transition-all"
                >
                  {/* Row header */}
                  <div
                    className="flex items-center gap-3 p-4 cursor-pointer hover:bg-white/[0.02] transition-colors"
                    onClick={() => setExpandedId(isExpanded ? null : account.id)}
                  >
                    <div className="p-2 rounded-lg bg-white/5">
                      <Bot className="h-4 w-4 text-white/60" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-white/90 truncate">{account.name}</span>
                        <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${TYPE_COLORS[account.type]}`}>
                          {account.type}
                        </Badge>
                        <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${STATUS_COLORS[account.status]}`}>
                          {account.status}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-white/30 mt-0.5">
                        <span>Owner: {account.ownerEmail}</span>
                        <span>{account.apiKeys.length} key{account.apiKeys.length !== 1 ? 's' : ''}</span>
                        <span>Last active: {formatRelativeTime(account.lastActivity)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {account.status === 'active' && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 text-amber-400/60 hover:text-amber-400 hover:bg-amber-500/10"
                          onClick={e => { e.stopPropagation(); handleSuspend(account.id); }}
                          title="Suspend"
                        >
                          <Pause className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {account.status === 'suspended' && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 text-green-400/60 hover:text-green-400 hover:bg-green-500/10"
                          onClick={e => { e.stopPropagation(); handleActivate(account.id); }}
                          title="Activate"
                        >
                          <Play className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 text-red-400/60 hover:text-red-400 hover:bg-red-500/10"
                        onClick={e => { e.stopPropagation(); handleDelete(account.id); }}
                        title="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4 text-white/30" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-white/30" />
                      )}
                    </div>
                  </div>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div className="border-t border-border/20 p-4 space-y-4 bg-white/[0.01]">
                      {/* Details grid */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                        <div>
                          <span className="text-white/30">Description</span>
                          <p className="text-white/60 mt-0.5">{account.description || 'No description'}</p>
                        </div>
                        <div>
                          <span className="text-white/30">Rotation Policy</span>
                          <p className="text-white/60 mt-0.5">{account.rotationPolicy} days</p>
                        </div>
                        <div>
                          <span className="text-white/30">Created</span>
                          <p className="text-white/60 mt-0.5">{formatDate(account.createdAt)}</p>
                        </div>
                        <div>
                          <span className="text-white/30">Expires</span>
                          <p className="text-white/60 mt-0.5">
                            {account.expiresAt ? formatDate(account.expiresAt) : 'Never'}
                          </p>
                        </div>
                      </div>

                      {/* Permissions */}
                      {account.permissions.length > 0 && (
                        <div>
                          <span className="text-xs text-white/30">Permissions</span>
                          <div className="flex flex-wrap gap-1.5 mt-1">
                            {account.permissions.map(p => (
                              <Badge key={p} variant="secondary" className="text-[10px]">{p}</Badge>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Scopes */}
                      {account.scopes.length > 0 && (
                        <div>
                          <span className="text-xs text-white/30">Scopes</span>
                          <div className="flex flex-wrap gap-1.5 mt-1">
                            {account.scopes.map(s => (
                              <Badge key={s} variant="outline" className="text-[10px] border-primary/30 text-primary/70">{s}</Badge>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* API Keys */}
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs text-white/30 font-medium">API Keys</span>
                          <Button
                            size="sm"
                            variant="outline"
                            className="rounded-full btn-press text-xs h-7 border-border/30"
                            onClick={() => openKeyDialog(account.id)}
                          >
                            <Plus className="h-3 w-3 mr-1" />Generate Key
                          </Button>
                        </div>
                        {account.apiKeys.length === 0 ? (
                          <p className="text-xs text-white/25 italic">No API keys generated yet</p>
                        ) : (
                          <div className="space-y-2">
                            {account.apiKeys.map(apiKey => {
                              const isOverdue = (Date.now() - apiKey.createdAt) > account.rotationPolicy * 86400_000;
                              return (
                                <div key={apiKey.id} className="flex items-center justify-between p-2.5 rounded-lg bg-white/[0.03] border border-border/20">
                                  <div className="flex items-center gap-3 min-w-0">
                                    <Key className="h-3.5 w-3.5 text-white/30 shrink-0" />
                                    <div className="min-w-0">
                                      <div className="flex items-center gap-2">
                                        <span className="text-xs font-medium text-white/70">{apiKey.name}</span>
                                        <code className="text-[10px] text-white/30 font-mono">{apiKey.keyPrefix}...</code>
                                        {isOverdue && (
                                          <Badge variant="outline" className="text-[9px] px-1 py-0 border-orange-500/30 text-orange-400">
                                            rotation overdue
                                          </Badge>
                                        )}
                                      </div>
                                      <div className="text-[10px] text-white/25 mt-0.5">
                                        Created {formatDate(apiKey.createdAt)}
                                        {apiKey.lastUsedAt && ` | Last used ${formatRelativeTime(apiKey.lastUsedAt)}`}
                                        {apiKey.expiresAt && ` | Expires ${formatDate(apiKey.expiresAt)}`}
                                      </div>
                                    </div>
                                  </div>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 text-xs text-red-400/60 hover:text-red-400 hover:bg-red-500/10"
                                    onClick={() => handleRevokeKey(account.id, apiKey.id)}
                                  >
                                    <XCircle className="h-3 w-3 mr-1" />Revoke
                                  </Button>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* Recent Activity */}
                      {activity.length > 0 && (
                        <div>
                          <span className="text-xs text-white/30 font-medium">Recent Activity</span>
                          <div className="mt-2 space-y-1.5">
                            {activity.slice(0, 5).map(evt => (
                              <div key={evt.id} className="flex items-center gap-2 text-[11px] text-white/40">
                                <Activity className="h-3 w-3 shrink-0" />
                                <span className="text-white/50">{evt.action}</span>
                                <span className="text-white/25">{formatRelativeTime(evt.timestamp)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </ScrollArea>

      {/* ── Create Service Account Dialog ──────────────────────────────── */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Service Account</DialogTitle>
            <DialogDescription>
              Create a non-human identity for CI/CD pipelines, monitoring agents, or machine-to-machine access.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Name */}
            <div className="space-y-1.5">
              <Label className="text-xs">Account Name</Label>
              <Input
                placeholder="e.g., CI/CD Pipeline, Monitoring Agent"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                className="bg-white/5 border-border/30"
              />
            </div>

            {/* Type */}
            <div className="space-y-1.5">
              <Label className="text-xs">Account Type</Label>
              <Select value={newType} onValueChange={v => setNewType(v as any)}>
                <SelectTrigger className="bg-white/5 border-border/30">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="service">Service - API integrations, webhooks</SelectItem>
                  <SelectItem value="agent">Agent - Monitoring, scanning, automation</SelectItem>
                  <SelectItem value="machine">Machine - Server-to-server, infrastructure</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <Label className="text-xs">Description</Label>
              <Input
                placeholder="What is this account used for?"
                value={newDescription}
                onChange={e => setNewDescription(e.target.value)}
                className="bg-white/5 border-border/30"
              />
            </div>

            {/* Permissions */}
            <div className="space-y-1.5">
              <Label className="text-xs">Permissions</Label>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 p-3 rounded-lg bg-white/[0.03] border border-border/20 max-h-40 overflow-y-auto">
                {AVAILABLE_PERMISSIONS.map(p => (
                  <label key={p.value} className="flex items-center gap-2 text-xs text-white/60 cursor-pointer hover:text-white/80">
                    <input
                      type="checkbox"
                      checked={newPermissions.includes(p.value)}
                      onChange={() => togglePermission(p.value)}
                      className="rounded border-border/30"
                    />
                    {p.label}
                  </label>
                ))}
              </div>
            </div>

            {/* Scopes */}
            <div className="space-y-1.5">
              <Label className="text-xs">Scopes</Label>
              <div className="flex flex-wrap gap-2 p-3 rounded-lg bg-white/[0.03] border border-border/20">
                {SERVICE_SCOPES.map(scope => (
                  <Badge
                    key={scope}
                    variant="outline"
                    className={`text-[10px] cursor-pointer transition-colors ${
                      newScopes.includes(scope)
                        ? 'bg-primary/15 text-primary border-primary/40'
                        : 'text-white/40 border-border/30 hover:border-border/50'
                    }`}
                    onClick={() => toggleScope(scope)}
                  >
                    {scope}
                  </Badge>
                ))}
              </div>
            </div>

            {/* Rotation Policy */}
            <div className="space-y-1.5">
              <Label className="text-xs">Key Rotation Policy</Label>
              <Select value={String(newRotationPolicy)} onValueChange={v => setNewRotationPolicy(Number(v))}>
                <SelectTrigger className="bg-white/5 border-border/30">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="30">30 days</SelectItem>
                  <SelectItem value="60">60 days</SelectItem>
                  <SelectItem value="90">90 days</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Expiry */}
            <div className="space-y-1.5">
              <Label className="text-xs">Expiry Date (optional)</Label>
              <Input
                type="date"
                value={newExpiry}
                onChange={e => setNewExpiry(e.target.value)}
                className="bg-white/5 border-border/30"
              />
              <p className="text-[10px] text-white/25">Leave empty for no expiry</p>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              className="rounded-full btn-press text-xs"
              onClick={() => setShowCreateDialog(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="rounded-full btn-press text-xs"
              onClick={handleCreate}
            >
              <Plus className="h-3.5 w-3.5 mr-1" />Create Account
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Generate API Key Dialog ───────────────────────────────────── */}
      <Dialog open={showKeyDialog} onOpenChange={open => { if (!open) { setShowKeyDialog(false); setGeneratedKey(null); setKeyName(''); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {generatedKey ? 'API Key Generated' : 'Generate API Key'}
            </DialogTitle>
            <DialogDescription>
              {generatedKey
                ? 'Copy your API key now. It will not be shown again.'
                : 'Create a new API key for this service account.'}
            </DialogDescription>
          </DialogHeader>

          {generatedKey ? (
            <div className="space-y-4 py-2">
              <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="h-4 w-4 text-amber-400" />
                  <span className="text-xs font-semibold text-amber-300">
                    This key will NOT be shown again
                  </span>
                </div>
                <p className="text-xs text-white/40">
                  Make sure to copy and store it securely before closing this dialog.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Your API Key</Label>
                <div className="flex items-center gap-2">
                  <div className="flex-1 relative">
                    <Input
                      value={showKey ? generatedKey : generatedKey.replace(/./g, '*')}
                      readOnly
                      className="font-mono text-xs bg-white/5 border-border/30 pr-10"
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6 p-0"
                      onClick={() => setShowKey(!showKey)}
                    >
                      {showKey ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                    </Button>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-full btn-press text-xs shrink-0"
                    onClick={() => copyToClipboard(generatedKey)}
                  >
                    <Copy className="h-3 w-3 mr-1" />Copy
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Key Name</Label>
                <Input
                  placeholder="e.g., production-deploy, staging-read"
                  value={keyName}
                  onChange={e => setKeyName(e.target.value)}
                  className="bg-white/5 border-border/30"
                />
              </div>
            </div>
          )}

          <DialogFooter>
            {generatedKey ? (
              <Button
                size="sm"
                className="rounded-full btn-press text-xs"
                onClick={() => { setShowKeyDialog(false); setGeneratedKey(null); setKeyName(''); }}
              >
                Done
              </Button>
            ) : (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-full btn-press text-xs"
                  onClick={() => { setShowKeyDialog(false); setKeyName(''); }}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  className="rounded-full btn-press text-xs"
                  onClick={handleGenerateKey}
                >
                  <Key className="h-3.5 w-3.5 mr-1" />Generate
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
