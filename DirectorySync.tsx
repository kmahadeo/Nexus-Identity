/**
 * DirectorySync.tsx — Admin UI for directory sync, SCIM integration, and SIEM forwarding.
 *
 * Embedded inside AdminIntelligence.tsx. Provides three tabs:
 *   1. Connections — CRUD for directory connections with provider-specific config
 *   2. Sync History — chronological event log with filters
 *   3. SIEM — SIEM/webhook configuration and test delivery
 */

import { useState, useCallback, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  RefreshCw, Plus, Trash2, CheckCircle2, AlertTriangle, XCircle,
  ArrowUpDown, Clock, Users, FolderSync, Wifi, WifiOff, Zap, Send,
  Settings2, Link2, Database, Shield, Play, ExternalLink,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  getConnections, saveConnection, deleteConnection, getConnection,
  getSyncHistory, simulateDirectorySync,
  getDefaultAttributeMappings, getSCIMProviderConfig,
  getSIEMConnections, saveSIEMConnection, deleteSIEMConnection,
  formatCEFEvent, formatSplunkHEC, formatSentinelEvent,
  simulateSIEMForward,
  type DirectoryConnection, type DirectoryProvider, type SyncEvent,
  type SIEMConnection, type SIEMType, type AttributeMapping,
} from './lib/directorySync';
import { type AuditEvent } from './lib/auditLog';

/* ── Provider Metadata ─────────────────────────────────────────────────── */

const PROVIDER_META: Record<DirectoryProvider, { label: string; icon: string; color: string }> = {
  entra_id:         { label: 'Microsoft Entra ID', icon: '🔷', color: 'text-blue-400' },
  okta:             { label: 'Okta',               icon: '🔵', color: 'text-indigo-400' },
  duo:              { label: 'Duo Security',       icon: '🟢', color: 'text-emerald-400' },
  workday:          { label: 'Workday',            icon: '🟠', color: 'text-orange-400' },
  google_workspace: { label: 'Google Workspace',   icon: '🔴', color: 'text-red-400' },
  custom_scim:      { label: 'Custom SCIM 2.0',   icon: '⚙️', color: 'text-gray-400' },
};

const SIEM_META: Record<SIEMType, { label: string; icon: string }> = {
  sentinel: { label: 'Azure Sentinel', icon: '🔷' },
  splunk:   { label: 'Splunk',         icon: '📊' },
  custom:   { label: 'Custom Webhook', icon: '🔗' },
};

/* ── Connections Tab ───────────────────────────────────────────────────── */

function ConnectionsTab() {
  const [connections, setConnections] = useState(getConnections);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showMappingDialog, setShowMappingDialog] = useState<string | null>(null);
  const [editMappings, setEditMappings] = useState<AttributeMapping[]>([]);
  const [newConn, setNewConn] = useState<{
    name: string;
    provider: DirectoryProvider;
    tenantUrl: string;
    clientId: string;
    hasSecret: boolean;
    syncInterval: number;
    syncDirection: 'inbound' | 'outbound' | 'bidirectional';
  }>({
    name: '',
    provider: 'entra_id',
    tenantUrl: '',
    clientId: '',
    hasSecret: false,
    syncInterval: 30,
    syncDirection: 'inbound',
  });

  const refresh = useCallback(() => setConnections(getConnections()), []);

  const handleAddConnection = () => {
    if (!newConn.name.trim()) { toast.error('Connection name is required'); return; }
    if (!newConn.tenantUrl.trim()) { toast.error('Tenant URL is required'); return; }

    const conn: DirectoryConnection = {
      id: crypto.randomUUID(),
      name: newConn.name.trim(),
      provider: newConn.provider,
      status: 'connected',
      config: {
        tenantUrl: newConn.tenantUrl.trim(),
        clientId: newConn.clientId.trim() || undefined,
        hasSecret: newConn.hasSecret,
        scopes: getSCIMProviderConfig(newConn.provider).capabilities,
        syncInterval: newConn.syncInterval,
        syncDirection: newConn.syncDirection,
        attributeMapping: getDefaultAttributeMappings(newConn.provider),
        lastSyncAt: null,
        lastSyncResult: null,
        lastSyncCount: 0,
        totalUsers: 0,
        totalGroups: 0,
      },
      createdAt: Date.now(),
    };

    saveConnection(conn);
    refresh();
    setShowAddDialog(false);
    setNewConn({ name: '', provider: 'entra_id', tenantUrl: '', clientId: '', hasSecret: false, syncInterval: 30, syncDirection: 'inbound' });
    toast.success(`Connected to ${PROVIDER_META[conn.provider].label}`);
  };

  const handleTestConnection = (id: string) => {
    const conn = getConnection(id);
    if (!conn) return;
    // Simulate connection test
    toast.promise(
      new Promise<void>((resolve) => setTimeout(resolve, 1200)),
      {
        loading: `Testing connection to ${conn.name}...`,
        success: `Connection to ${conn.name} is healthy`,
        error: 'Connection test failed',
      },
    );
  };

  const handleSync = (id: string) => {
    const conn = getConnection(id);
    if (!conn) return;

    toast.promise(
      new Promise<{ syncedCount: number }>((resolve, reject) => {
        setTimeout(() => {
          const result = simulateDirectorySync(id);
          if (result.success) resolve(result);
          else reject(new Error(result.error));
        }, 1500);
      }),
      {
        loading: `Syncing ${conn.name}...`,
        success: (r) => { refresh(); return `Synced ${r.syncedCount} users from ${conn.name}`; },
        error: (e) => { refresh(); return `Sync failed: ${e.message}`; },
      },
    );
  };

  const handleDelete = (id: string) => {
    deleteConnection(id);
    refresh();
    toast.success('Connection removed');
  };

  const openMappingEditor = (id: string) => {
    const conn = getConnection(id);
    if (!conn) return;
    setEditMappings([...conn.config.attributeMapping]);
    setShowMappingDialog(id);
  };

  const saveMappings = () => {
    if (!showMappingDialog) return;
    const conn = getConnection(showMappingDialog);
    if (!conn) return;
    saveConnection({ ...conn, config: { ...conn.config, attributeMapping: editMappings } });
    refresh();
    setShowMappingDialog(null);
    toast.success('Attribute mappings updated');
  };

  const statusBadge = (status: DirectoryConnection['status']) => {
    const map: Record<typeof status, { variant: 'default' | 'secondary' | 'destructive'; icon: typeof CheckCircle2; label: string }> = {
      connected:    { variant: 'default',     icon: CheckCircle2,  label: 'Connected' },
      disconnected: { variant: 'secondary',   icon: WifiOff,       label: 'Disconnected' },
      syncing:      { variant: 'secondary',   icon: RefreshCw,     label: 'Syncing...' },
      error:        { variant: 'destructive',  icon: XCircle,       label: 'Error' },
    };
    const m = map[status];
    return (
      <Badge variant={m.variant} className="text-[10px] gap-1">
        <m.icon className={`h-3 w-3 ${status === 'syncing' ? 'animate-spin' : ''}`} />
        {m.label}
      </Badge>
    );
  };

  const providerConfig = getSCIMProviderConfig(newConn.provider);

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-xs">{connections.length} connection{connections.length !== 1 ? 's' : ''}</Badge>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={refresh} className="rounded-full btn-press text-xs">
            <RefreshCw className="h-3.5 w-3.5 mr-1" />Refresh
          </Button>
          <Button size="sm" onClick={() => setShowAddDialog(true)} className="rounded-full btn-press text-xs">
            <Plus className="h-3.5 w-3.5 mr-1" />Add Connection
          </Button>
        </div>
      </div>

      {connections.length === 0 ? (
        <div className="py-12 text-center">
          <FolderSync className="h-12 w-12 text-white/10 mx-auto mb-3" />
          <p className="text-sm text-white/30">No directory connections configured</p>
          <p className="text-xs text-white/20 mt-1">Connect Entra ID, Okta, Duo, Workday, or a custom SCIM provider</p>
          <Button size="sm" className="mt-4 rounded-full btn-press text-xs" onClick={() => setShowAddDialog(true)}>
            <Plus className="h-3.5 w-3.5 mr-1" />Add Your First Connection
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {connections.map(conn => {
            const meta = PROVIDER_META[conn.provider];
            return (
              <div key={conn.id} className="p-4 rounded-xl glass-effect border border-border/40 shadow-depth-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <span className="text-2xl shrink-0">{meta.icon}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap mb-0.5">
                        <span className="text-sm font-semibold truncate">{conn.name}</span>
                        {statusBadge(conn.status)}
                        <Badge variant="outline" className="text-[10px]">{conn.config.syncDirection}</Badge>
                      </div>
                      <p className="text-xs text-white/40 truncate">{conn.config.tenantUrl}</p>
                      <div className="flex items-center gap-3 mt-1.5 text-[10px] text-white/30">
                        <span className="flex items-center gap-1"><Users className="h-3 w-3" />{conn.config.totalUsers} users</span>
                        <span className="flex items-center gap-1"><Database className="h-3 w-3" />{conn.config.totalGroups} groups</span>
                        <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{conn.config.syncInterval}m interval</span>
                        {conn.config.lastSyncAt && (
                          <span>Last sync: {new Date(conn.config.lastSyncAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        )}
                        {conn.config.lastSyncResult && (
                          <Badge variant={conn.config.lastSyncResult === 'success' ? 'default' : conn.config.lastSyncResult === 'partial' ? 'secondary' : 'destructive'} className="text-[9px]">
                            {conn.config.lastSyncResult}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Button variant="ghost" size="sm" onClick={() => handleTestConnection(conn.id)} className="rounded-full text-xs h-7 px-2">
                      <Wifi className="h-3 w-3 mr-1" />Test
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => openMappingEditor(conn.id)} className="rounded-full text-xs h-7 px-2">
                      <Settings2 className="h-3 w-3 mr-1" />Map
                    </Button>
                    <Button size="sm" onClick={() => handleSync(conn.id)} className="rounded-full btn-press text-xs h-7 px-2.5">
                      <Play className="h-3 w-3 mr-1" />Sync Now
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(conn.id)} className="rounded-full text-xs h-7 px-2 text-destructive hover:text-destructive">
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Connection Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="glass-strong border-border/40 sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Link2 className="h-5 w-5" />Add Directory Connection
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Provider</Label>
              <Select value={newConn.provider} onValueChange={v => setNewConn(p => ({ ...p, provider: v as DirectoryProvider, tenantUrl: getSCIMProviderConfig(v as DirectoryProvider).baseUrlHint }))}>
                <SelectTrigger className="glass-effect"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(PROVIDER_META) as DirectoryProvider[]).map(k => (
                    <SelectItem key={k} value={k}>{PROVIDER_META[k].icon} {PROVIDER_META[k].label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-white/30">
                Auth: {providerConfig.authMethods.join(', ')} | SCIM {providerConfig.scimVersion}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>Connection Name</Label>
              <Input placeholder="e.g., Entra ID Production" className="glass-effect"
                value={newConn.name} onChange={e => setNewConn(p => ({ ...p, name: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Tenant / Base URL</Label>
              <Input placeholder={providerConfig.baseUrlHint} className="glass-effect"
                value={newConn.tenantUrl} onChange={e => setNewConn(p => ({ ...p, tenantUrl: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Client ID</Label>
                <Input placeholder="Application client ID" className="glass-effect"
                  value={newConn.clientId} onChange={e => setNewConn(p => ({ ...p, clientId: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Client Secret</Label>
                <div className="flex items-center gap-2">
                  <Input type="password" placeholder="••••••••" className="glass-effect"
                    onChange={() => setNewConn(p => ({ ...p, hasSecret: true }))} />
                  {newConn.hasSecret && <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Sync Interval</Label>
                <Select value={String(newConn.syncInterval)} onValueChange={v => setNewConn(p => ({ ...p, syncInterval: Number(v) }))}>
                  <SelectTrigger className="glass-effect"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="15">Every 15 minutes</SelectItem>
                    <SelectItem value="30">Every 30 minutes</SelectItem>
                    <SelectItem value="60">Every 60 minutes</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Sync Direction</Label>
                <Select value={newConn.syncDirection} onValueChange={v => setNewConn(p => ({ ...p, syncDirection: v as typeof p.syncDirection }))}>
                  <SelectTrigger className="glass-effect"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="inbound">Inbound (Directory to Nexus)</SelectItem>
                    <SelectItem value="outbound">Outbound (Nexus to Directory)</SelectItem>
                    <SelectItem value="bidirectional">Bidirectional</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="p-3 rounded-lg glass-effect border border-border/30">
              <p className="text-xs font-medium text-white/60 mb-1.5">SCIM Endpoints</p>
              <div className="grid grid-cols-2 gap-1">
                {providerConfig.endpoints.map(ep => (
                  <div key={ep.path} className="text-[10px] text-white/30">
                    <code className="text-white/50">{ep.path}</code> — {ep.description}
                  </div>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)} className="rounded-full">Cancel</Button>
            <Button onClick={handleAddConnection} className="rounded-full btn-press">
              <Link2 className="h-4 w-4 mr-2" />Connect
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Attribute Mapping Dialog */}
      <Dialog open={!!showMappingDialog} onOpenChange={() => setShowMappingDialog(null)}>
        <DialogContent className="glass-strong border-border/40 sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowUpDown className="h-5 w-5" />Attribute Mappings
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="h-[320px]">
            <div className="space-y-2 pr-2">
              {editMappings.map((m, i) => (
                <div key={i} className="flex items-center gap-2 p-2 rounded-lg glass-effect border border-border/30">
                  <Input value={m.source} className="glass-effect text-xs flex-1"
                    onChange={e => { const u = [...editMappings]; u[i] = { ...m, source: e.target.value }; setEditMappings(u); }} />
                  <Badge variant="outline" className="text-[9px] shrink-0">
                    {m.direction === 'in' ? '>>>' : m.direction === 'out' ? '<<<' : '<=>'}
                  </Badge>
                  <Input value={m.target} className="glass-effect text-xs flex-1"
                    onChange={e => { const u = [...editMappings]; u[i] = { ...m, target: e.target.value }; setEditMappings(u); }} />
                  <Select value={m.direction} onValueChange={v => { const u = [...editMappings]; u[i] = { ...m, direction: v as 'in' | 'out' | 'both' }; setEditMappings(u); }}>
                    <SelectTrigger className="w-20 glass-effect text-[10px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="in">In</SelectItem>
                      <SelectItem value="out">Out</SelectItem>
                      <SelectItem value="both">Both</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0 shrink-0 text-destructive"
                    onClick={() => setEditMappings(editMappings.filter((_, j) => j !== i))}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          </ScrollArea>
          <Button variant="outline" size="sm" className="rounded-full text-xs"
            onClick={() => setEditMappings([...editMappings, { source: '', target: '', direction: 'in' }])}>
            <Plus className="h-3 w-3 mr-1" />Add Mapping
          </Button>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowMappingDialog(null)} className="rounded-full">Cancel</Button>
            <Button onClick={saveMappings} className="rounded-full btn-press">Save Mappings</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ── Sync History Tab ──────────────────────────────────────────────────── */

function SyncHistoryTab() {
  const [events, setEvents] = useState<SyncEvent[]>(() => getSyncHistory());
  const [filterConnection, setFilterConnection] = useState<string>('all');
  const [filterAction, setFilterAction] = useState<string>('all');
  const [filterResult, setFilterResult] = useState<string>('all');

  const connections = useMemo(getConnections, []);

  const refresh = useCallback(() => setEvents(getSyncHistory()), []);

  const filtered = useMemo(() => {
    return events.filter(e => {
      if (filterConnection !== 'all' && e.connectionId !== filterConnection) return false;
      if (filterAction !== 'all' && e.action !== filterAction) return false;
      if (filterResult !== 'all' && e.result !== filterResult) return false;
      return true;
    });
  }, [events, filterConnection, filterAction, filterResult]);

  const actionBadge = (action: SyncEvent['action']) => {
    const map: Record<typeof action, { color: string; label: string }> = {
      create:       { color: 'text-emerald-400 bg-emerald-400/10', label: 'Created' },
      update:       { color: 'text-blue-400 bg-blue-400/10',      label: 'Updated' },
      deactivate:   { color: 'text-red-400 bg-red-400/10',        label: 'Deactivated' },
      reactivate:   { color: 'text-amber-400 bg-amber-400/10',    label: 'Reactivated' },
      group_assign: { color: 'text-violet-400 bg-violet-400/10',  label: 'Group +' },
      group_remove: { color: 'text-orange-400 bg-orange-400/10',  label: 'Group -' },
    };
    const m = map[action];
    return <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${m.color}`}>{m.label}</span>;
  };

  return (
    <>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={filterConnection} onValueChange={setFilterConnection}>
            <SelectTrigger className="w-40 glass-effect text-xs h-8"><SelectValue placeholder="All connections" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All connections</SelectItem>
              {connections.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterAction} onValueChange={setFilterAction}>
            <SelectTrigger className="w-32 glass-effect text-xs h-8"><SelectValue placeholder="All actions" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All actions</SelectItem>
              {['create','update','deactivate','reactivate','group_assign','group_remove'].map(a => (
                <SelectItem key={a} value={a}>{a.replace('_', ' ')}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterResult} onValueChange={setFilterResult}>
            <SelectTrigger className="w-28 glass-effect text-xs h-8"><SelectValue placeholder="All results" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All results</SelectItem>
              <SelectItem value="success">Success</SelectItem>
              <SelectItem value="error">Error</SelectItem>
              <SelectItem value="skipped">Skipped</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-xs">{filtered.length} event{filtered.length !== 1 ? 's' : ''}</Badge>
          <Button variant="outline" size="sm" onClick={refresh} className="rounded-full btn-press text-xs h-8">
            <RefreshCw className="h-3.5 w-3.5 mr-1" />Refresh
          </Button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="py-12 text-center">
          <Clock className="h-12 w-12 text-white/10 mx-auto mb-3" />
          <p className="text-sm text-white/30">No sync events yet</p>
          <p className="text-xs text-white/20 mt-1">Run a directory sync to see activity here</p>
        </div>
      ) : (
        <ScrollArea className="h-[400px]">
          <div className="space-y-1.5 pr-2">
            {filtered.map(ev => {
              const conn = connections.find(c => c.id === ev.connectionId);
              return (
                <div key={ev.id} className="flex items-center gap-3 p-3 rounded-lg glass-effect border border-border/30">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      {actionBadge(ev.action)}
                      <span className="text-xs font-medium text-white/70 truncate">{ev.userName}</span>
                      <span className="text-[10px] text-white/25">{ev.userEmail}</span>
                    </div>
                    <p className="text-[10px] text-white/35 truncate">{ev.details}</p>
                  </div>
                  <div className="text-right shrink-0 space-y-0.5">
                    {conn && <p className="text-[10px] text-white/25">{conn.name}</p>}
                    <p className="text-[10px] text-white/20">{new Date(ev.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</p>
                    <Badge variant={ev.result === 'success' ? 'default' : ev.result === 'error' ? 'destructive' : 'secondary'} className="text-[9px]">
                      {ev.result}
                    </Badge>
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      )}
    </>
  );
}

/* ── SIEM Tab ──────────────────────────────────────────────────────────── */

function SIEMTab() {
  const [siemConnections, setSiemConnections] = useState(getSIEMConnections);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newSiem, setNewSiem] = useState<{
    name: string; type: SIEMType; endpointUrl: string; hasAuthToken: boolean;
  }>({ name: '', type: 'sentinel', endpointUrl: '', hasAuthToken: false });

  const refresh = useCallback(() => setSiemConnections(getSIEMConnections()), []);

  const handleAdd = () => {
    if (!newSiem.name.trim() || !newSiem.endpointUrl.trim()) { toast.error('Name and endpoint URL are required'); return; }
    const conn: SIEMConnection = {
      id: crypto.randomUUID(),
      name: newSiem.name.trim(),
      type: newSiem.type,
      endpointUrl: newSiem.endpointUrl.trim(),
      hasAuthToken: newSiem.hasAuthToken,
      enabled: true,
      lastForwardedAt: null,
      eventsForwarded: 0,
      createdAt: Date.now(),
    };
    saveSIEMConnection(conn);
    refresh();
    setShowAddDialog(false);
    setNewSiem({ name: '', type: 'sentinel', endpointUrl: '', hasAuthToken: false });
    toast.success(`SIEM connection added: ${SIEM_META[conn.type].label}`);
  };

  const handleTestDelivery = (id: string) => {
    const testEvent: AuditEvent = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      action: 'siem.test.event',
      actor: 'admin',
      actorEmail: 'admin@nexus.io',
      actorRole: 'admin',
      details: 'Test event delivery from Nexus Identity SIEM integration',
      ipAddress: '127.0.0.1',
      result: 'success',
      resource: 'siem-test',
      resourceType: 'test',
    };

    const count = simulateSIEMForward(id, [testEvent]);
    refresh();
    if (count > 0) {
      toast.success('Test event delivered successfully');
    } else {
      toast.error('Failed to deliver test event');
    }
  };

  const handleToggle = (id: string) => {
    const conn = siemConnections.find(c => c.id === id);
    if (!conn) return;
    saveSIEMConnection({ ...conn, enabled: !conn.enabled });
    refresh();
    toast.success(conn.enabled ? 'SIEM forwarding paused' : 'SIEM forwarding resumed');
  };

  const handleDelete = (id: string) => {
    deleteSIEMConnection(id);
    refresh();
    toast.success('SIEM connection removed');
  };

  const formatPreview = (type: SIEMType): string => {
    const sample: AuditEvent = {
      id: 'sample-001', timestamp: Date.now(), action: 'vault.entry.created',
      actor: 'user-abc', actorEmail: 'user@corp.io', actorRole: 'admin',
      details: 'Created vault entry for AWS credentials', ipAddress: '10.0.1.42',
      result: 'success', resource: 'entry-xyz', resourceType: 'vault_entry',
    };
    switch (type) {
      case 'sentinel': return JSON.stringify(formatSentinelEvent(sample), null, 2);
      case 'splunk': return JSON.stringify(formatSplunkHEC(sample), null, 2);
      default: return formatCEFEvent(sample);
    }
  };

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <Badge variant="secondary" className="text-xs">{siemConnections.length} SIEM connection{siemConnections.length !== 1 ? 's' : ''}</Badge>
        <Button size="sm" onClick={() => setShowAddDialog(true)} className="rounded-full btn-press text-xs">
          <Plus className="h-3.5 w-3.5 mr-1" />Add SIEM
        </Button>
      </div>

      {siemConnections.length === 0 ? (
        <div className="py-12 text-center">
          <Shield className="h-12 w-12 text-white/10 mx-auto mb-3" />
          <p className="text-sm text-white/30">No SIEM connections configured</p>
          <p className="text-xs text-white/20 mt-1">Forward audit events to Azure Sentinel, Splunk, or a custom webhook</p>
        </div>
      ) : (
        <div className="space-y-3">
          {siemConnections.map(conn => (
            <div key={conn.id} className="p-4 rounded-xl glass-effect border border-border/40 shadow-depth-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <span className="text-2xl shrink-0">{SIEM_META[conn.type].icon}</span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      <span className="text-sm font-semibold">{conn.name}</span>
                      <Badge variant={conn.enabled ? 'default' : 'secondary'} className="text-[10px]">
                        {conn.enabled ? 'Active' : 'Paused'}
                      </Badge>
                    </div>
                    <p className="text-xs text-white/40 truncate">{conn.endpointUrl}</p>
                    <div className="flex items-center gap-3 mt-1 text-[10px] text-white/30">
                      <span>{conn.eventsForwarded} events forwarded</span>
                      {conn.lastForwardedAt && <span>Last: {new Date(conn.lastForwardedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Switch checked={conn.enabled} onCheckedChange={() => handleToggle(conn.id)} />
                  <Button variant="ghost" size="sm" onClick={() => handleTestDelivery(conn.id)} className="rounded-full text-xs h-7 px-2">
                    <Send className="h-3 w-3 mr-1" />Test
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => handleDelete(conn.id)} className="rounded-full text-xs h-7 px-2 text-destructive hover:text-destructive">
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add SIEM Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="glass-strong border-border/40 sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Shield className="h-5 w-5" />Add SIEM Connection</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>SIEM Provider</Label>
              <Select value={newSiem.type} onValueChange={v => setNewSiem(p => ({ ...p, type: v as SIEMType }))}>
                <SelectTrigger className="glass-effect"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(SIEM_META) as SIEMType[]).map(k => (
                    <SelectItem key={k} value={k}>{SIEM_META[k].icon} {SIEM_META[k].label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Connection Name</Label>
              <Input placeholder="e.g., Production Sentinel" className="glass-effect"
                value={newSiem.name} onChange={e => setNewSiem(p => ({ ...p, name: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Endpoint URL</Label>
              <Input placeholder={newSiem.type === 'splunk' ? 'https://splunk-hec:8088/services/collector' : newSiem.type === 'sentinel' ? 'https://<workspace>.ods.opinsights.azure.com/api/logs' : 'https://your-webhook.example.com/events'} className="glass-effect"
                value={newSiem.endpointUrl} onChange={e => setNewSiem(p => ({ ...p, endpointUrl: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Auth Token</Label>
              <div className="flex items-center gap-2">
                <Input type="password" placeholder="Bearer token or HEC token" className="glass-effect"
                  onChange={() => setNewSiem(p => ({ ...p, hasAuthToken: true }))} />
                {newSiem.hasAuthToken && <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />}
              </div>
            </div>
            <div className="p-3 rounded-lg glass-effect border border-border/30">
              <p className="text-xs font-medium text-white/60 mb-1.5">Event Format Preview ({SIEM_META[newSiem.type].label})</p>
              <pre className="text-[10px] text-white/40 overflow-x-auto max-h-32 whitespace-pre-wrap">{formatPreview(newSiem.type)}</pre>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)} className="rounded-full">Cancel</Button>
            <Button onClick={handleAdd} className="rounded-full btn-press"><Shield className="h-4 w-4 mr-2" />Connect</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ── Main Component ────────────────────────────────────────────────────── */

export default function DirectorySync() {
  const connections = getConnections();
  const syncHistory = getSyncHistory();
  const siemConnections = getSIEMConnections();

  const totalSynced = connections.reduce((sum, c) => sum + c.config.totalUsers, 0);
  const lastSync = connections
    .filter(c => c.config.lastSyncAt)
    .sort((a, b) => (b.config.lastSyncAt ?? 0) - (a.config.lastSyncAt ?? 0))[0];
  const errorCount = syncHistory.filter(e => e.result === 'error').length;

  return (
    <div className="space-y-4">
      {/* Stats Row */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Directories', value: connections.length, sub: `${connections.filter(c => c.status === 'connected').length} connected`, icon: FolderSync },
          { label: 'Users Synced', value: totalSynced, sub: 'across all dirs', icon: Users },
          { label: 'Last Sync', value: lastSync?.config.lastSyncAt ? new Date(lastSync.config.lastSyncAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--', sub: lastSync?.name ?? 'none', icon: Clock },
          { label: 'Errors', value: errorCount, sub: `of ${syncHistory.length} events`, icon: AlertTriangle },
        ].map(({ label, value, sub, icon: Icon }) => (
          <div key={label} className="p-3 rounded-xl glass-effect border border-border/30 text-center">
            <Icon className="h-4 w-4 mx-auto mb-1 text-white/40" />
            <div className="text-lg font-bold">{value}</div>
            <div className="text-[10px] text-white/40">{label}</div>
            <div className="text-[9px] text-white/25">{sub}</div>
          </div>
        ))}
      </div>

      {/* Tabbed Content */}
      <Tabs defaultValue="connections" className="w-full">
        <TabsList className="w-full glass-effect border border-border/30">
          <TabsTrigger value="connections" className="flex-1 text-xs gap-1.5">
            <FolderSync className="h-3.5 w-3.5" />Connections
          </TabsTrigger>
          <TabsTrigger value="history" className="flex-1 text-xs gap-1.5">
            <Clock className="h-3.5 w-3.5" />Sync History
            {syncHistory.length > 0 && <Badge variant="secondary" className="text-[9px] ml-1">{syncHistory.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="siem" className="flex-1 text-xs gap-1.5">
            <Shield className="h-3.5 w-3.5" />SIEM
            {siemConnections.length > 0 && <Badge variant="secondary" className="text-[9px] ml-1">{siemConnections.length}</Badge>}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="connections" className="mt-4">
          <ConnectionsTab />
        </TabsContent>
        <TabsContent value="history" className="mt-4">
          <SyncHistoryTab />
        </TabsContent>
        <TabsContent value="siem" className="mt-4">
          <SIEMTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
