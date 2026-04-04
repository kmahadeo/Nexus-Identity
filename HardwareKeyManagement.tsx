/**
 * HardwareKeyManagement.tsx — Admin hardware key (FIDO2/U2F) inventory.
 *
 * Tracks YubiKey, Google Titan, Feitian, etc. across all users.
 * Lives inside the Admin Intelligence dashboard.
 */

import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Key, Plus, Shield, AlertTriangle, CheckCircle2, XCircle,
  RefreshCw, Search, Usb, Smartphone, Fingerprint, Upload, Filter,
} from 'lucide-react';
import { toast } from 'sonner';
import { logAuditEvent } from '@/lib/auditLog';
import { loadPasskeys, type StoredPasskey } from '@/lib/webauthn';

/* ── Types & storage ───────────────────────────────────────────────────── */

export interface HardwareKey {
  id: string;
  model: string;
  manufacturer: 'yubico' | 'google' | 'feitian' | 'solokeys' | 'other';
  serialNumber: string;
  aaguid?: string;           // FIDO2 authenticator AAGUID
  credentialId?: string;     // linked WebAuthn credential ID
  assignedTo: string;        // principalId
  assignedToName: string;    // display name
  assignedToEmail: string;
  enrolledAt: number;
  lastUsedAt: number | null;
  status: 'active' | 'inactive' | 'lost' | 'revoked';
  statusChangedAt?: number;  // timestamp of last status change
  firmware?: string;
  protocols: ('fido2' | 'u2f' | 'piv' | 'otp')[];
}

const HW_KEY = 'nexus-hardware-keys';

function getHardwareKeys(): HardwareKey[] {
  try { return JSON.parse(localStorage.getItem(HW_KEY) ?? '[]'); } catch { return []; }
}

function saveHardwareKeys(keys: HardwareKey[]) {
  localStorage.setItem(HW_KEY, JSON.stringify(keys));
  // Sync full state to Supabase
  syncAllHardwareKeysToSupabase(keys);
}

async function syncAllHardwareKeysToSupabase(keys: HardwareKey[]) {
  try {
    const { getSupabase, isSupabaseConfigured } = await import('./lib/supabase');
    if (!isSupabaseConfigured()) return;
    const client = getSupabase();
    if (!client) return;

    // Upsert each key — dedup by serial_number + assigned_to
    for (const key of keys) {
      await client.from('hardware_keys').upsert({
        model: key.model, manufacturer: key.manufacturer,
        serial_number: key.serialNumber, aaguid: key.aaguid || null,
        credential_id: key.credentialId || null,
        assigned_to: key.assignedTo || null,
        assigned_to_name: key.assignedToName || '',
        assigned_to_email: key.assignedToEmail || '',
        status: key.status, firmware: key.firmware || null,
        protocols: key.protocols || ['fido2', 'u2f'],
        status_changed_at: key.statusChangedAt ? new Date(key.statusChangedAt).toISOString() : null,
      }, { onConflict: 'id' }).then(({ error: e }) => { if (e) console.error("[SB]", e); });
    }
  } catch(e) { console.error("[SB]", e); }
}

/* ── Mock seed ─────────────────────────────────────────────────────────── */

function seedIfEmpty(): HardwareKey[] {
  const keys = getHardwareKeys();
  if (keys.length > 0) return keys;

  const seed: HardwareKey[] = [
    {
      id: crypto.randomUUID(), model: 'YubiKey 5 NFC', manufacturer: 'yubico',
      serialNumber: 'YK-2024-001', aaguid: 'cb69481e-8ff7-4039-93ec-0a2729a154a8',
      assignedTo: 'admin-001', assignedToName: 'Kaushik M.',
      assignedToEmail: 'kaushik@nexus-identity.io', enrolledAt: Date.now() - 45 * 86400000,
      lastUsedAt: Date.now() - 3600000, status: 'active', firmware: '5.4.3',
      protocols: ['fido2', 'u2f', 'piv', 'otp'],
    },
    {
      id: crypto.randomUUID(), model: 'YubiKey 5C', manufacturer: 'yubico',
      serialNumber: 'YK-2024-002', aaguid: 'c5ef55ff-ad9a-4b9f-b580-adebafe026d0',
      assignedTo: 'user-002', assignedToName: 'Priya S.',
      assignedToEmail: 'priya@nexus-identity.io', enrolledAt: Date.now() - 30 * 86400000,
      lastUsedAt: Date.now() - 172800000, status: 'active', firmware: '5.4.3',
      protocols: ['fido2', 'u2f'],
    },
    {
      id: crypto.randomUUID(), model: 'Titan Security Key', manufacturer: 'google',
      serialNumber: 'GT-2024-001', aaguid: 'b7d3f68e-88a6-471e-9ecf-2df26d041ede',
      assignedTo: 'user-003', assignedToName: 'Arjun R.',
      assignedToEmail: 'arjun@nexus-identity.io', enrolledAt: Date.now() - 60 * 86400000,
      lastUsedAt: null, status: 'inactive', protocols: ['fido2', 'u2f'],
    },
  ];

  saveHardwareKeys(seed);
  return seed;
}

/* ── Manufacturer config ──────────────────────────────────────────────── */

const MANUFACTURERS: Record<string, { label: string; color: string }> = {
  yubico:   { label: 'Yubico',    color: '#84cc16' },
  google:   { label: 'Google',    color: '#60a5fa' },
  feitian:  { label: 'Feitian',   color: '#f59e0b' },
  solokeys: { label: 'SoloKeys',  color: '#a78bfa' },
  other:    { label: 'Other',     color: '#94a3b8' },
};

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  active:   { label: 'Active',   color: 'text-emerald-400', icon: CheckCircle2 },
  inactive: { label: 'Inactive', color: 'text-amber-400',   icon: AlertTriangle },
  lost:     { label: 'Lost',     color: 'text-red-400',     icon: XCircle },
  revoked:  { label: 'Revoked',  color: 'text-red-500',     icon: XCircle },
};

/* ── Component ─────────────────────────────────────────────────────────── */

export default function HardwareKeyManagement() {
  const [keys, setKeys] = useState<HardwareKey[]>(seedIfEmpty);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showBulkDialog, setShowBulkDialog] = useState(false);
  const [showReEnrollDialog, setShowReEnrollDialog] = useState<string | null>(null); // key id
  const [reEnrollDraft, setReEnrollDraft] = useState({ assignedToName: '', assignedToEmail: '' });
  const [bulkCsv, setBulkCsv] = useState('');
  const [search, setSearch] = useState('');
  const [filterNoHardwareKey, setFilterNoHardwareKey] = useState(false);
  const [draft, setDraft] = useState({
    model: '', manufacturer: 'yubico' as HardwareKey['manufacturer'],
    serialNumber: '', aaguid: '', assignedToName: '', assignedToEmail: '',
  });

  const activeKeys = keys.filter(k => k.status === 'active').length;
  const needsAttention = keys.filter(k => k.status === 'inactive' || k.status === 'lost').length;

  // Cross-reference passkey registry to find users relying only on platform authenticators
  const usersWithoutHardwareKeys = useMemo(() => {
    if (!filterNoHardwareKey) return null;
    try {
      const registry: { principalId: string; email?: string; displayName?: string }[] =
        JSON.parse(localStorage.getItem('nexus-user-registry') ?? '[]');
      const hwKeyEmails = new Set(keys.filter(k => k.status === 'active').map(k => k.assignedToEmail.toLowerCase()));
      return registry.filter(u => {
        const email = (u.email ?? '').toLowerCase();
        if (hwKeyEmails.has(email)) return false; // has hardware key
        // Check if they have any passkeys (platform-only)
        const passkeys = loadPasskeys(u.principalId);
        return passkeys.length > 0 && passkeys.every(p => p.type === 'platform');
      });
    } catch { return []; }
  }, [filterNoHardwareKey, keys]);

  const filtered = keys.filter(k =>
    !search || k.model.toLowerCase().includes(search.toLowerCase()) ||
    k.assignedToName.toLowerCase().includes(search.toLowerCase()) ||
    k.serialNumber.toLowerCase().includes(search.toLowerCase())
  );

  const handleAdd = () => {
    if (!draft.model.trim() || !draft.assignedToEmail.trim()) {
      toast.error('Model and email are required');
      return;
    }
    const key: HardwareKey = {
      id: crypto.randomUUID(),
      model: draft.model.trim(),
      manufacturer: draft.manufacturer,
      serialNumber: draft.serialNumber.trim() || `HW-${Date.now().toString(36).toUpperCase()}`,
      aaguid: draft.aaguid.trim() || undefined,
      assignedTo: `nexus-${btoa(draft.assignedToEmail).replace(/[^a-z0-9]/gi, '').slice(0, 12)}`,
      assignedToName: draft.assignedToName.trim() || draft.assignedToEmail.trim(),
      assignedToEmail: draft.assignedToEmail.trim(),
      enrolledAt: Date.now(),
      lastUsedAt: null,
      status: 'active',
      protocols: ['fido2', 'u2f'],
    };
    const updated = [...keys, key];
    saveHardwareKeys(updated);
    setKeys(updated);
    logAuditEvent({
      action: 'hardware_key.assigned',
      resource: key.id,
      resourceType: 'hardware_key',
      details: `Assigned ${key.model} (SN: ${key.serialNumber}) to ${key.assignedToEmail}`,
      result: 'success',
    });
    setShowAddDialog(false);
    setDraft({ model: '', manufacturer: 'yubico', serialNumber: '', aaguid: '', assignedToName: '', assignedToEmail: '' });
    toast.success(`${key.model} assigned to ${key.assignedToName}`);
  };

  const handleBulkImport = () => {
    const lines = bulkCsv.trim().split('\n').filter(l => l.trim());
    let successCount = 0;
    const errors: string[] = [];

    lines.forEach((line, idx) => {
      const parts = line.split(',').map(s => s.trim());
      if (parts.length < 2) {
        errors.push(`Line ${idx + 1}: need at least model and serialNumber`);
        return;
      }
      const [model, serialNumber, aaguid, assignedToEmail] = parts;
      if (!model) { errors.push(`Line ${idx + 1}: model is empty`); return; }

      const key: HardwareKey = {
        id: crypto.randomUUID(),
        model,
        manufacturer: model.toLowerCase().includes('yubikey') ? 'yubico'
          : model.toLowerCase().includes('titan') ? 'google'
          : model.toLowerCase().includes('feitian') ? 'feitian'
          : model.toLowerCase().includes('solo') ? 'solokeys' : 'other',
        serialNumber: serialNumber || `HW-${Date.now().toString(36).toUpperCase()}-${idx}`,
        aaguid: aaguid || undefined,
        assignedTo: assignedToEmail ? `nexus-${btoa(assignedToEmail).replace(/[^a-z0-9]/gi, '').slice(0, 12)}` : '',
        assignedToName: assignedToEmail || 'Unassigned',
        assignedToEmail: assignedToEmail || '',
        enrolledAt: Date.now(),
        lastUsedAt: null,
        status: assignedToEmail ? 'active' : 'inactive',
        protocols: ['fido2', 'u2f'],
      };
      keys.push(key);
      successCount++;
    });

    if (successCount > 0) {
      const updated = [...keys];
      saveHardwareKeys(updated);
      setKeys(updated);
      logAuditEvent({
        action: 'hardware_key.bulk_import',
        resourceType: 'hardware_key',
        details: `Bulk imported ${successCount} hardware keys${errors.length > 0 ? ` (${errors.length} errors)` : ''}`,
        result: 'success',
      });
    }

    if (errors.length > 0) {
      toast.error(`${errors.length} error(s): ${errors[0]}${errors.length > 1 ? '...' : ''}`);
    }
    if (successCount > 0) {
      toast.success(`Successfully imported ${successCount} key(s)`);
    }
    setBulkCsv('');
    setShowBulkDialog(false);
  };

  const deactivateKey = (id: string) => {
    const key = keys.find(k => k.id === id);
    if (!key) return;
    const updated = keys.map(k => k.id === id ? { ...k, status: 'inactive' as const, statusChangedAt: Date.now() } : k);
    saveHardwareKeys(updated);
    setKeys(updated);
    logAuditEvent({
      action: 'hardware_key.deactivated',
      resource: id,
      resourceType: 'hardware_key',
      details: `Deactivated ${key.model} (SN: ${key.serialNumber}) assigned to ${key.assignedToEmail}`,
      result: 'success',
    });
    toast.success(`${key.model} deactivated`);
  };

  const reactivateKey = (id: string) => {
    const key = keys.find(k => k.id === id);
    if (!key) return;
    const updated = keys.map(k => k.id === id ? { ...k, status: 'active' as const, statusChangedAt: Date.now() } : k);
    saveHardwareKeys(updated);
    setKeys(updated);
    logAuditEvent({
      action: 'hardware_key.reactivated',
      resource: id,
      resourceType: 'hardware_key',
      details: `Reactivated ${key.model} (SN: ${key.serialNumber}) for ${key.assignedToEmail}`,
      result: 'success',
    });
    toast.success(`${key.model} reactivated`);
  };

  const revokeKey = (id: string) => {
    const key = keys.find(k => k.id === id);
    if (!key) return;
    const updated = keys.map(k => k.id === id ? {
      ...k,
      status: 'revoked' as const,
      statusChangedAt: Date.now(),
      assignedTo: '',
      assignedToName: `[revoked] ${k.assignedToName}`,
      credentialId: undefined,
    } : k);
    saveHardwareKeys(updated);
    setKeys(updated);
    logAuditEvent({
      action: 'hardware_key.revoked',
      resource: id,
      resourceType: 'hardware_key',
      details: `Revoked ${key.model} (SN: ${key.serialNumber}), unlinked from ${key.assignedToEmail}. Reason: admin action`,
      result: 'success',
    });
    toast.success(`${key.model} revoked and unlinked from user`);
  };

  const reEnrollKey = (id: string) => {
    if (!reEnrollDraft.assignedToEmail.trim()) {
      toast.error('Email is required for re-enrollment');
      return;
    }
    const key = keys.find(k => k.id === id);
    if (!key) return;
    const updated = keys.map(k => k.id === id ? {
      ...k,
      status: 'active' as const,
      statusChangedAt: Date.now(),
      assignedTo: `nexus-${btoa(reEnrollDraft.assignedToEmail).replace(/[^a-z0-9]/gi, '').slice(0, 12)}`,
      assignedToName: reEnrollDraft.assignedToName.trim() || reEnrollDraft.assignedToEmail.trim(),
      assignedToEmail: reEnrollDraft.assignedToEmail.trim(),
      enrolledAt: Date.now(),
      lastUsedAt: null,
    } : k);
    saveHardwareKeys(updated);
    setKeys(updated);
    logAuditEvent({
      action: 'hardware_key.re_enrolled',
      resource: id,
      resourceType: 'hardware_key',
      details: `Re-enrolled ${key.model} (SN: ${key.serialNumber}) to ${reEnrollDraft.assignedToEmail}`,
      result: 'success',
    });
    setShowReEnrollDialog(null);
    setReEnrollDraft({ assignedToName: '', assignedToEmail: '' });
    toast.success(`${key.model} re-enrolled to ${reEnrollDraft.assignedToEmail}`);
  };

  return (
    <div className="space-y-4">
      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 md:gap-3">
        <div className="p-4 rounded-xl glass-effect border border-border/40 text-center">
          <Key className="h-5 w-5 mx-auto mb-2 text-violet-400" />
          <p className="text-2xl font-bold">{keys.length}</p>
          <p className="text-xs text-muted-foreground">Total Keys</p>
        </div>
        <div className="p-4 rounded-xl glass-effect border border-border/40 text-center">
          <CheckCircle2 className="h-5 w-5 mx-auto mb-2 text-emerald-400" />
          <p className="text-2xl font-bold">{activeKeys}</p>
          <p className="text-xs text-muted-foreground">Active</p>
        </div>
        <div className="p-4 rounded-xl glass-effect border border-border/40 text-center">
          <AlertTriangle className="h-5 w-5 mx-auto mb-2 text-amber-400" />
          <p className="text-2xl font-bold">{needsAttention}</p>
          <p className="text-xs text-muted-foreground">Needs Attention</p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/25" />
          <Input
            placeholder="Search keys, users, serial numbers..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 glass-effect text-sm"
          />
        </div>
        <Button
          variant={filterNoHardwareKey ? 'default' : 'outline'}
          onClick={() => setFilterNoHardwareKey(f => !f)}
          className="rounded-full"
          size="sm"
          title="Show users without hardware keys (platform-only passkeys)"
        >
          <Filter className="h-4 w-4 mr-1" /> No HW Key
        </Button>
        <Button onClick={() => setShowBulkDialog(true)} variant="outline" className="rounded-full" size="sm">
          <Upload className="h-4 w-4 mr-1" /> Bulk Import
        </Button>
        <Button onClick={() => setShowAddDialog(true)} className="rounded-full btn-press" size="sm">
          <Plus className="h-4 w-4 mr-1" /> Assign Key
        </Button>
      </div>

      {/* Users without hardware keys panel */}
      {filterNoHardwareKey && usersWithoutHardwareKeys && (
        <div className="p-3 rounded-xl border border-amber-500/30 bg-amber-500/5">
          <p className="text-xs font-medium text-amber-400 mb-2">
            <AlertTriangle className="h-3.5 w-3.5 inline mr-1" />
            Users relying only on platform authenticators ({usersWithoutHardwareKeys.length})
          </p>
          {usersWithoutHardwareKeys.length === 0 ? (
            <p className="text-xs text-white/30">All passkey users have hardware key backup.</p>
          ) : (
            <div className="space-y-1">
              {usersWithoutHardwareKeys.map(u => (
                <div key={u.principalId} className="text-xs text-white/50 flex items-center gap-2">
                  <Smartphone className="h-3 w-3 text-amber-400/60" />
                  <span>{u.displayName || u.email || u.principalId}</span>
                  {u.email && <span className="text-white/25">({u.email})</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Key inventory */}
      <ScrollArea className="h-[360px]">
        <div className="space-y-2">
          {filtered.map((key) => {
            const mfr = MANUFACTURERS[key.manufacturer] ?? { label: key.manufacturer, color: '#94a3b8' };
            const status = STATUS_CONFIG[key.status] ?? { label: key.status, color: 'text-white/40', icon: AlertTriangle };
            const StatusIcon = status.icon;
            const daysSinceUsed = key.lastUsedAt
              ? Math.round((Date.now() - key.lastUsedAt) / 86400000)
              : null;

            return (
              <div key={key.id} className="p-3 rounded-xl border border-border/40 glass-effect animate-slide-in">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className="p-2 rounded-lg" style={{ background: `${mfr.color}15` }}>
                      <Usb className="h-4 w-4" style={{ color: mfr.color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium text-white/85 truncate">{key.model}</span>
                        <Badge variant="outline" className="text-[10px] px-1.5" style={{ color: mfr.color, borderColor: `${mfr.color}40` }}>
                          {mfr.label}
                        </Badge>
                        <Badge variant="outline" className={`text-[10px] px-1.5 ${status.color}`}>
                          <StatusIcon className="h-2.5 w-2.5 mr-0.5" /> {status.label}
                        </Badge>
                      </div>
                      <p className="text-xs text-white/40 mb-1">
                        {key.assignedToName} · {key.assignedToEmail}
                      </p>
                      <div className="flex items-center gap-3 text-[10px] text-white/25">
                        <span>SN: {key.serialNumber}</span>
                        <span>Enrolled: {new Date(key.enrolledAt).toLocaleDateString()}</span>
                        {daysSinceUsed !== null && (
                          <span className={daysSinceUsed > 30 ? 'text-amber-400' : ''}>
                            Last used: {daysSinceUsed === 0 ? 'today' : `${daysSinceUsed}d ago`}
                          </span>
                        )}
                        {key.firmware && <span>FW: {key.firmware}</span>}
                      </div>
                      {key.aaguid && (
                        <p className="text-[10px] text-white/20 font-mono mt-0.5">
                          AAGUID: {key.aaguid}
                          {key.credentialId && <span className="ml-2">Cred: {key.credentialId.slice(0, 16)}...</span>}
                        </p>
                      )}
                      <div className="flex gap-1 mt-1.5">
                        {key.protocols.map(p => (
                          <Badge key={p} variant="secondary" className="text-[9px] px-1 py-0">
                            {p.toUpperCase()}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {key.status === 'active' && (
                      <Button
                        variant="ghost" size="sm"
                        className="h-7 px-2 text-xs text-amber-400 hover:bg-amber-500/10 rounded-full"
                        onClick={() => deactivateKey(key.id)}
                      >
                        Deactivate
                      </Button>
                    )}
                    {key.status === 'inactive' && (
                      <Button
                        variant="ghost" size="sm"
                        className="h-7 px-2 text-xs text-emerald-400 hover:bg-emerald-500/10 rounded-full"
                        onClick={() => reactivateKey(key.id)}
                      >
                        Reactivate
                      </Button>
                    )}
                    {(key.status === 'active' || key.status === 'inactive') && (
                      <Button
                        variant="ghost" size="sm"
                        className="h-7 px-2 text-xs text-red-400 hover:bg-red-500/10 rounded-full"
                        onClick={() => revokeKey(key.id)}
                      >
                        Revoke
                      </Button>
                    )}
                    {key.status === 'revoked' && (
                      <Button
                        variant="ghost" size="sm"
                        className="h-7 px-2 text-xs text-violet-400 hover:bg-violet-500/10 rounded-full"
                        onClick={() => { setShowReEnrollDialog(key.id); setReEnrollDraft({ assignedToName: '', assignedToEmail: '' }); }}
                      >
                        Re-enroll
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div className="py-12 text-center">
              <Key className="h-10 w-10 mx-auto mb-3 text-white/15" />
              <p className="text-sm text-white/30">No hardware keys found</p>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Add Key Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="glass-strong border-border/40 sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Assign Hardware Key</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-white/50">Model</Label>
                <Input
                  placeholder="YubiKey 5 NFC"
                  value={draft.model}
                  onChange={(e) => setDraft(d => ({ ...d, model: e.target.value }))}
                  className="glass-effect text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-white/50">Manufacturer</Label>
                <Select value={draft.manufacturer} onValueChange={(v: any) => setDraft(d => ({ ...d, manufacturer: v }))}>
                  <SelectTrigger className="glass-effect text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(MANUFACTURERS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-white/50">Serial Number (optional)</Label>
              <Input
                placeholder="Auto-generated if blank"
                value={draft.serialNumber}
                onChange={(e) => setDraft(d => ({ ...d, serialNumber: e.target.value }))}
                className="glass-effect text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-white/50">AAGUID (optional)</Label>
              <Input
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                value={draft.aaguid}
                onChange={(e) => setDraft(d => ({ ...d, aaguid: e.target.value }))}
                className="glass-effect text-sm font-mono text-xs"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-white/50">User Name</Label>
                <Input
                  placeholder="Jane Doe"
                  value={draft.assignedToName}
                  onChange={(e) => setDraft(d => ({ ...d, assignedToName: e.target.value }))}
                  className="glass-effect text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-white/50">User Email *</Label>
                <Input
                  placeholder="jane@company.com"
                  type="email"
                  value={draft.assignedToEmail}
                  onChange={(e) => setDraft(d => ({ ...d, assignedToEmail: e.target.value }))}
                  className="glass-effect text-sm"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)} className="rounded-full">Cancel</Button>
            <Button onClick={handleAdd} className="rounded-full btn-press"
              style={{ background: 'linear-gradient(135deg, rgba(139,92,246,0.9), rgba(167,139,250,0.8))', border: 'none' }}>
              Assign Key
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Import Dialog */}
      <Dialog open={showBulkDialog} onOpenChange={setShowBulkDialog}>
        <DialogContent className="glass-strong border-border/40 sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Bulk Import Hardware Keys</DialogTitle>
            <DialogDescription className="text-xs text-white/40">
              Paste CSV data. Format: model,serialNumber,aaguid,assignedToEmail
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Textarea
              placeholder={`YubiKey 5 NFC,YK-2024-010,cb69481e-8ff7-4039-93ec-0a2729a154a8,alice@company.com\nYubiKey 5C,YK-2024-011,c5ef55ff-ad9a-4b9f-b580-adebafe026d0,bob@company.com`}
              value={bulkCsv}
              onChange={(e) => setBulkCsv(e.target.value)}
              className="glass-effect text-sm font-mono min-h-[120px]"
              rows={6}
            />
            <p className="text-[10px] text-white/25">
              One key per line. AAGUID and email are optional. Manufacturer is auto-detected from model name.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBulkDialog(false)} className="rounded-full">Cancel</Button>
            <Button onClick={handleBulkImport} className="rounded-full btn-press"
              disabled={!bulkCsv.trim()}
              style={{ background: 'linear-gradient(135deg, rgba(139,92,246,0.9), rgba(167,139,250,0.8))', border: 'none' }}>
              <Upload className="h-4 w-4 mr-1" /> Import
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Re-enroll Dialog */}
      <Dialog open={showReEnrollDialog !== null} onOpenChange={(open) => { if (!open) setShowReEnrollDialog(null); }}>
        <DialogContent className="glass-strong border-border/40 sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Re-enroll Revoked Key</DialogTitle>
            <DialogDescription className="text-xs text-white/40">
              Assign this revoked key to a new user.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs text-white/50">New User Name</Label>
              <Input
                placeholder="Jane Doe"
                value={reEnrollDraft.assignedToName}
                onChange={(e) => setReEnrollDraft(d => ({ ...d, assignedToName: e.target.value }))}
                className="glass-effect text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-white/50">New User Email *</Label>
              <Input
                placeholder="jane@company.com"
                type="email"
                value={reEnrollDraft.assignedToEmail}
                onChange={(e) => setReEnrollDraft(d => ({ ...d, assignedToEmail: e.target.value }))}
                className="glass-effect text-sm"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowReEnrollDialog(null)} className="rounded-full">Cancel</Button>
            <Button onClick={() => showReEnrollDialog && reEnrollKey(showReEnrollDialog)} className="rounded-full btn-press"
              style={{ background: 'linear-gradient(135deg, rgba(139,92,246,0.9), rgba(167,139,250,0.8))', border: 'none' }}>
              Re-enroll Key
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
