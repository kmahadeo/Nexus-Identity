import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  Bot,
  Plus,
  ShieldAlert,
  Activity,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Zap,
  Trash2,
  Pause,
  Play,
  Key,
  ChevronDown,
  ChevronUp,
  Copy,
  Eye,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  getAgents,
  getAgentStats,
  createAgent,
  deleteAgent,
  suspendAgent,
  activateAgent,
  createAgentToken,
  getPendingApprovals,
  getAllApprovals,
  getAgentApprovals,
  getAgentSessions,
  getAgentAuditTrail,
  approveRequest,
  denyRequest,
  killSwitch,
  AGENT_SCOPES,
  AGENT_MODELS,
  SESSION_DURATIONS,
  type AIAgent,
  type AgentCapability,
  type AgentApprovalRequest,
  type AgentSession,
} from './lib/agentIdentity';
import type { AuditEvent } from './lib/auditLog';

/* ── Helpers ───────────────────────────────────────────────────────────── */

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'Just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleString();
}

const statusColors: Record<string, string> = {
  active: 'text-success border-success/40 bg-success/10',
  suspended: 'text-warning border-warning/40 bg-warning/10',
  expired: 'text-muted-foreground border-border/40 bg-muted/10',
  pending: 'text-warning border-warning/40 bg-warning/10',
  approved: 'text-success border-success/40 bg-success/10',
  denied: 'text-destructive border-destructive/40 bg-destructive/10',
};

/* ── Main Component ────────────────────────────────────────────────────── */

export default function AgentIdentity() {
  const [agents, setAgents] = useState<AIAgent[]>([]);
  const [stats, setStats] = useState(getAgentStats());
  const [pendingApprovals, setPendingApprovals] = useState<AgentApprovalRequest[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'agents' | 'approvals'>('agents');

  const refresh = useCallback(() => {
    setAgents(getAgents());
    setStats(getAgentStats());
    setPendingApprovals(getPendingApprovals());
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 5000);
    return () => clearInterval(interval);
  }, [refresh]);

  const handleKillSwitch = () => {
    const count = killSwitch();
    toast.error(`Kill switch activated. ${count} agent(s) suspended.`);
    refresh();
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold mb-1 flex items-center gap-2">
            <Bot className="h-6 w-6 text-primary" />
            AI Agent Identity
          </h2>
          <p className="text-sm text-muted-foreground">
            Manage AI agent identities, capabilities, and human-in-the-loop approvals
          </p>
        </div>
        <div className="flex items-center gap-2">
          <CreateAgentDialog
            open={createOpen}
            onOpenChange={setCreateOpen}
            onCreated={refresh}
          />
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="destructive"
                size="sm"
                className="rounded-full btn-press"
                disabled={stats.active === 0}
              >
                <ShieldAlert className="h-4 w-4 mr-1" />
                Kill Switch
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle className="text-destructive flex items-center gap-2">
                  <ShieldAlert className="h-5 w-5" />
                  Emergency Kill Switch
                </AlertDialogTitle>
                <AlertDialogDescription>
                  This will immediately suspend ALL active AI agents, revoke all tokens,
                  terminate all sessions, and deny all pending approvals. This cannot be
                  undone automatically.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={handleKillSwitch}
                >
                  Activate Kill Switch
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {/* Stats */}
      <div className="grid md:grid-cols-4 gap-4">
        <Card className="border-border/40 glass-strong shadow-depth-md card-tactile gradient-primary">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-2">
              <Bot className="h-6 w-6 text-primary" />
              <Badge variant="secondary" className="text-xs">Total</Badge>
            </div>
            <div className="text-2xl font-bold">{stats.total}</div>
            <div className="text-xs text-muted-foreground">AI Agents</div>
          </CardContent>
        </Card>

        <Card className="border-border/40 glass-strong shadow-depth-md card-tactile gradient-success">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-2">
              <Activity className="h-6 w-6 text-success" />
              <Badge variant="secondary" className="text-xs">Live</Badge>
            </div>
            <div className="text-2xl font-bold">{stats.active}</div>
            <div className="text-xs text-muted-foreground">Active</div>
          </CardContent>
        </Card>

        <Card className="border-border/40 glass-strong shadow-depth-md card-tactile gradient-warning">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-2">
              <Clock className="h-6 w-6 text-warning" />
              <Badge variant="secondary" className="text-xs">Queue</Badge>
            </div>
            <div className="text-2xl font-bold">{stats.pendingApprovals}</div>
            <div className="text-xs text-muted-foreground">Pending Approvals</div>
          </CardContent>
        </Card>

        <Card className="border-border/40 glass-strong shadow-depth-md card-tactile from-accent/15 to-accent/5">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-2">
              <Zap className="h-6 w-6 text-accent" />
              <Badge variant="secondary" className="text-xs">Cumulative</Badge>
            </div>
            <div className="text-2xl font-bold">{stats.totalActions}</div>
            <div className="text-xs text-muted-foreground">Total Actions</div>
          </CardContent>
        </Card>
      </div>

      {/* Tab Switcher */}
      <div className="flex items-center gap-2">
        <Button
          variant={activeTab === 'agents' ? 'default' : 'outline'}
          size="sm"
          className="rounded-full btn-press"
          onClick={() => setActiveTab('agents')}
        >
          <Bot className="h-4 w-4 mr-1" />
          Agents ({agents.length})
        </Button>
        <Button
          variant={activeTab === 'approvals' ? 'default' : 'outline'}
          size="sm"
          className="rounded-full btn-press"
          onClick={() => setActiveTab('approvals')}
        >
          <Clock className="h-4 w-4 mr-1" />
          Approval Queue ({pendingApprovals.length})
        </Button>
      </div>

      {/* Content */}
      {activeTab === 'agents' ? (
        <AgentList
          agents={agents}
          expandedAgent={expandedAgent}
          onToggleExpand={(id) => setExpandedAgent(expandedAgent === id ? null : id)}
          onRefresh={refresh}
        />
      ) : (
        <ApprovalQueue onRefresh={refresh} />
      )}
    </div>
  );
}

/* ── Agent List ────────────────────────────────────────────────────────── */

function AgentList({
  agents,
  expandedAgent,
  onToggleExpand,
  onRefresh,
}: {
  agents: AIAgent[];
  expandedAgent: string | null;
  onToggleExpand: (id: string) => void;
  onRefresh: () => void;
}) {
  if (agents.length === 0) {
    return (
      <Card className="border-border/40 glass-strong shadow-depth-md">
        <CardContent className="py-12 text-center">
          <Bot className="h-12 w-12 mx-auto mb-4 text-muted-foreground/40" />
          <p className="text-muted-foreground font-medium mb-1">No AI agents configured</p>
          <p className="text-sm text-muted-foreground">
            Create your first agent to start managing AI identities.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {agents.map((agent) => (
        <AgentCard
          key={agent.id}
          agent={agent}
          isExpanded={expandedAgent === agent.id}
          onToggle={() => onToggleExpand(agent.id)}
          onRefresh={onRefresh}
        />
      ))}
    </div>
  );
}

/* ── Agent Card ────────────────────────────────────────────────────────── */

function AgentCard({
  agent,
  isExpanded,
  onToggle,
  onRefresh,
}: {
  agent: AIAgent;
  isExpanded: boolean;
  onToggle: () => void;
  onRefresh: () => void;
}) {
  const [generatedToken, setGeneratedToken] = useState<string | null>(null);
  const [sessions, setSessions] = useState<AgentSession[]>([]);
  const [approvals, setApprovals] = useState<AgentApprovalRequest[]>([]);
  const [auditTrail, setAuditTrail] = useState<AuditEvent[]>([]);
  const [detailTab, setDetailTab] = useState<'sessions' | 'approvals' | 'audit'>('sessions');

  useEffect(() => {
    if (isExpanded) {
      setSessions(getAgentSessions(agent.id));
      setApprovals(getAgentApprovals(agent.id));
      setAuditTrail(getAgentAuditTrail(agent.id));
    }
  }, [isExpanded, agent.id]);

  const handleGenerateToken = async () => {
    const result = await createAgentToken(agent.id);
    if (result) {
      setGeneratedToken(result.plaintext);
      toast.success('Agent token generated. Copy it now -- it will not be shown again.');
    } else {
      toast.error('Failed to generate token. Ensure agent is active.');
    }
  };

  const handleCopyToken = () => {
    if (generatedToken) {
      navigator.clipboard.writeText(generatedToken);
      toast.success('Token copied to clipboard');
    }
  };

  const handleSuspend = () => {
    suspendAgent(agent.id);
    toast.warning(`Agent "${agent.name}" suspended`);
    onRefresh();
  };

  const handleActivate = () => {
    activateAgent(agent.id);
    toast.success(`Agent "${agent.name}" activated`);
    onRefresh();
  };

  const handleDelete = () => {
    deleteAgent(agent.id);
    toast.success(`Agent "${agent.name}" deleted`);
    onRefresh();
  };

  const modelInfo = AGENT_MODELS.find(m => m.value === agent.model);

  return (
    <Card className="border-border/40 glass-strong shadow-depth-md">
      <CardContent className="p-0">
        {/* Header Row */}
        <div
          className="flex items-center gap-4 p-4 cursor-pointer hover:bg-accent/5 transition-colors"
          onClick={onToggle}
        >
          <div className="h-10 w-10 rounded-xl glass-effect border border-border/40 flex items-center justify-center shrink-0">
            <Bot className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="font-semibold text-sm truncate">{agent.name}</span>
              <Badge className={`text-xs ${statusColors[agent.status]}`}>
                {agent.status}
              </Badge>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span>{modelInfo?.label ?? agent.model}</span>
              <span className="text-border">|</span>
              <span>{agent.provider}</span>
              <span className="text-border">|</span>
              <span>{agent.capabilities.length} capabilities</span>
              {agent.lastActivity && (
                <>
                  <span className="text-border">|</span>
                  <span>Active {timeAgo(agent.lastActivity)}</span>
                </>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {agent.status === 'active' ? (
              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={(e) => { e.stopPropagation(); handleSuspend(); }}>
                <Pause className="h-3.5 w-3.5 text-warning" />
              </Button>
            ) : (
              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={(e) => { e.stopPropagation(); handleActivate(); }}>
                <Play className="h-3.5 w-3.5 text-success" />
              </Button>
            )}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={(e) => e.stopPropagation()}>
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Agent</AlertDialogTitle>
                  <AlertDialogDescription>
                    Permanently delete "{agent.name}"? This will revoke all tokens and
                    remove all session data. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={handleDelete}>
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </div>
        </div>

        {/* Expanded Details */}
        {isExpanded && (
          <div className="border-t border-border/40">
            {/* Agent Details */}
            <div className="p-4 space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">{agent.description}</p>
                  <div className="text-xs space-y-1">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Owner</span>
                      <span className="font-mono">{agent.ownerEmail}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Session Duration</span>
                      <span>{agent.maxSessionDuration}m</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Created</span>
                      <span>{formatDate(agent.createdAt)}</span>
                    </div>
                    {agent.expiresAt && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Expires</span>
                        <span>{formatDate(agent.expiresAt)}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">Capabilities</p>
                  <div className="flex flex-wrap gap-1">
                    {agent.capabilities.map((cap, i) => (
                      <Badge
                        key={i}
                        variant="secondary"
                        className={`text-xs ${cap.requiresApproval ? 'border-warning/40' : ''}`}
                      >
                        {cap.action}
                        {cap.requiresApproval && (
                          <Eye className="h-2.5 w-2.5 ml-1 text-warning" />
                        )}
                        <span className="ml-1 text-muted-foreground">{cap.rateLimit}/h</span>
                      </Badge>
                    ))}
                  </div>

                  <p className="text-xs font-medium text-muted-foreground mt-3">Token Scopes</p>
                  <div className="flex flex-wrap gap-1">
                    {agent.tokenScopes.map((scope, i) => (
                      <Badge key={i} variant="outline" className="text-xs font-mono">
                        {scope}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>

              {/* Token Generation */}
              <div className="p-3 rounded-xl glass-effect border border-border/40">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Key className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium">Agent Token</span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-full btn-press"
                    onClick={handleGenerateToken}
                    disabled={agent.status !== 'active'}
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    Generate Token
                  </Button>
                </div>
                {generatedToken && (
                  <div className="flex items-center gap-2 p-2 rounded-lg bg-success/10 border border-success/20">
                    <code className="text-xs font-mono flex-1 truncate">{generatedToken}</code>
                    <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={handleCopyToken}>
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                )}
              </div>

              {/* Detail Tabs */}
              <div className="flex items-center gap-1 border-b border-border/40 pb-1">
                {(['sessions', 'approvals', 'audit'] as const).map((tab) => (
                  <button
                    key={tab}
                    className={`px-3 py-1.5 text-xs font-medium rounded-t-lg transition-colors ${
                      detailTab === tab
                        ? 'bg-primary/10 text-primary border-b-2 border-primary'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                    onClick={() => setDetailTab(tab)}
                  >
                    {tab === 'sessions' ? `Sessions (${sessions.length})` :
                     tab === 'approvals' ? `Approvals (${approvals.length})` :
                     `Audit (${auditTrail.length})`}
                  </button>
                ))}
              </div>

              <ScrollArea className="h-[200px]">
                {detailTab === 'sessions' && (
                  <div className="space-y-2">
                    {sessions.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-4">No sessions recorded</p>
                    ) : sessions.map((s) => (
                      <div key={s.id} className="flex items-center gap-3 p-2 rounded-lg glass-effect border border-border/40 text-xs">
                        <Activity className="h-3.5 w-3.5 text-primary shrink-0" />
                        <div className="flex-1 min-w-0">
                          <span className="font-mono">{s.id.slice(0, 8)}...</span>
                          <span className="text-muted-foreground ml-2">{s.actionsPerformed} actions</span>
                        </div>
                        <div className="text-right text-muted-foreground shrink-0">
                          <div>{formatDate(s.startedAt)}</div>
                          <div>{s.expiresAt > Date.now() ? 'Active' : 'Expired'}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {detailTab === 'approvals' && (
                  <div className="space-y-2">
                    {approvals.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-4">No approval requests</p>
                    ) : approvals.map((a) => (
                      <ApprovalRow key={a.id} request={a} onAction={() => {
                        setApprovals(getAgentApprovals(agent.id));
                      }} />
                    ))}
                  </div>
                )}

                {detailTab === 'audit' && (
                  <div className="space-y-2">
                    {auditTrail.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-4">No audit events</p>
                    ) : auditTrail.map((e) => (
                      <div key={e.id} className="flex items-center gap-3 p-2 rounded-lg glass-effect border border-border/40 text-xs">
                        {e.result === 'success' ? <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0" /> :
                         e.result === 'denied' ? <XCircle className="h-3.5 w-3.5 text-destructive shrink-0" /> :
                         <AlertTriangle className="h-3.5 w-3.5 text-warning shrink-0" />}
                        <div className="flex-1 min-w-0">
                          <span className="font-mono font-semibold">{e.action}</span>
                          <p className="text-muted-foreground truncate">{e.details}</p>
                        </div>
                        <span className="text-muted-foreground shrink-0">{timeAgo(e.timestamp)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ── Approval Row ──────────────────────────────────────────────────────── */

function ApprovalRow({
  request,
  onAction,
}: {
  request: AgentApprovalRequest;
  onAction: () => void;
}) {
  const handleApprove = () => {
    approveRequest(request.id);
    toast.success(`Approved "${request.action}" for ${request.agentName}`);
    onAction();
  };

  const handleDeny = () => {
    denyRequest(request.id);
    toast.warning(`Denied "${request.action}" for ${request.agentName}`);
    onAction();
  };

  return (
    <div className="flex items-center gap-3 p-2.5 rounded-lg glass-effect border border-border/40">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-xs font-semibold">{request.agentName}</span>
          <Badge className={`text-xs ${statusColors[request.status]}`}>
            {request.status}
          </Badge>
        </div>
        <p className="text-xs font-mono text-primary">{request.action}</p>
        <p className="text-xs text-muted-foreground truncate">{request.details}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{timeAgo(request.requestedAt)}</p>
      </div>
      {request.status === 'pending' && (
        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 rounded-full hover:bg-success/10"
            onClick={handleApprove}
          >
            <CheckCircle2 className="h-4 w-4 text-success" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 rounded-full hover:bg-destructive/10"
            onClick={handleDeny}
          >
            <XCircle className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      )}
      {request.status !== 'pending' && request.respondedBy && (
        <span className="text-xs text-muted-foreground shrink-0">
          by {request.respondedBy}
        </span>
      )}
    </div>
  );
}

/* ── Approval Queue ────────────────────────────────────────────────────── */

function ApprovalQueue({ onRefresh }: { onRefresh: () => void }) {
  const [allApprovals, setAllApprovals] = useState<AgentApprovalRequest[]>([]);

  useEffect(() => {
    setAllApprovals(getAllApprovals());
  }, []);

  const refreshAll = () => {
    setAllApprovals(getAllApprovals());
    onRefresh();
  };

  const pending = allApprovals.filter(a => a.status === 'pending');
  const resolved = allApprovals.filter(a => a.status !== 'pending');

  return (
    <Card className="border-border/40 glass-strong shadow-depth-md">
      <CardHeader>
        <CardTitle className="text-lg">Approval Queue</CardTitle>
        <CardDescription>
          Agent actions requiring human approval. Requests auto-expire after 10 minutes.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {pending.length > 0 && (
          <div className="space-y-2 mb-4">
            <p className="text-xs font-medium text-warning">Pending ({pending.length})</p>
            {pending.map((a) => (
              <ApprovalRow key={a.id} request={a} onAction={refreshAll} />
            ))}
          </div>
        )}
        {pending.length === 0 && (
          <div className="text-center py-6 mb-4">
            <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-success/40" />
            <p className="text-sm text-muted-foreground">No pending approvals</p>
          </div>
        )}
        {resolved.length > 0 && (
          <>
            <Separator className="mb-4" />
            <p className="text-xs font-medium text-muted-foreground mb-2">History</p>
            <ScrollArea className="h-[240px]">
              <div className="space-y-2">
                {resolved.slice(0, 50).map((a) => (
                  <ApprovalRow key={a.id} request={a} onAction={refreshAll} />
                ))}
              </div>
            </ScrollArea>
          </>
        )}
      </CardContent>
    </Card>
  );
}

/* ── Create Agent Dialog ───────────────────────────────────────────────── */

function CreateAgentDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [model, setModel] = useState('claude-sonnet-4-6');
  const [provider, setProvider] = useState('anthropic');
  const [sessionDuration, setSessionDuration] = useState(240);
  const [expiryDays, setExpiryDays] = useState('');
  const [selectedScopes, setSelectedScopes] = useState<string[]>([]);
  const [capabilities, setCapabilities] = useState<AgentCapability[]>([]);
  const [newCapAction, setNewCapAction] = useState('');
  const [newCapApproval, setNewCapApproval] = useState(false);
  const [newCapRateLimit, setNewCapRateLimit] = useState(100);

  const resetForm = () => {
    setName('');
    setDescription('');
    setModel('claude-sonnet-4-6');
    setProvider('anthropic');
    setSessionDuration(240);
    setExpiryDays('');
    setSelectedScopes([]);
    setCapabilities([]);
    setNewCapAction('');
    setNewCapApproval(false);
    setNewCapRateLimit(100);
  };

  const handleModelChange = (val: string) => {
    setModel(val);
    const modelInfo = AGENT_MODELS.find(m => m.value === val);
    if (modelInfo) setProvider(modelInfo.provider);
  };

  const addCapability = () => {
    if (!newCapAction.trim()) return;
    setCapabilities(prev => [
      ...prev,
      { action: newCapAction.trim(), requiresApproval: newCapApproval, rateLimit: newCapRateLimit },
    ]);
    setNewCapAction('');
    setNewCapApproval(false);
    setNewCapRateLimit(100);
  };

  const removeCapability = (index: number) => {
    setCapabilities(prev => prev.filter((_, i) => i !== index));
  };

  const toggleScope = (scope: string) => {
    setSelectedScopes(prev =>
      prev.includes(scope) ? prev.filter(s => s !== scope) : [...prev, scope],
    );
  };

  const handleCreate = () => {
    if (!name.trim()) {
      toast.error('Agent name is required');
      return;
    }

    const session = (() => {
      try { return JSON.parse(localStorage.getItem('nexus-session') ?? 'null'); } catch { return null; }
    })();

    createAgent({
      name: name.trim(),
      description: description.trim(),
      model,
      provider,
      ownerId: session?.principalId ?? 'unknown',
      ownerEmail: session?.email ?? 'unknown',
      status: 'active',
      capabilities,
      tokenScopes: selectedScopes,
      humanApprovalRequired: capabilities.filter(c => c.requiresApproval).map(c => c.action),
      maxSessionDuration: sessionDuration,
      expiresAt: expiryDays ? Date.now() + (parseInt(expiryDays) * 86_400_000) : null,
    });

    toast.success(`Agent "${name}" created`);
    resetForm();
    onOpenChange(false);
    onCreated();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" className="rounded-full btn-press">
          <Plus className="h-4 w-4 mr-1" />
          Create Agent
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary" />
            Create AI Agent
          </DialogTitle>
          <DialogDescription>
            Define an AI agent identity with scoped capabilities and human approval controls.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Basic Info */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="agent-name">Agent Name</Label>
              <Input
                id="agent-name"
                placeholder="Deploy Bot"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="agent-model">Model</Label>
              <Select value={model} onValueChange={handleModelChange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AGENT_MODELS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label} ({m.provider})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="agent-desc">Description</Label>
            <Textarea
              id="agent-desc"
              placeholder="What does this agent do?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>

          {/* Session & Expiry */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Session Duration</Label>
              <Select value={String(sessionDuration)} onValueChange={(v) => setSessionDuration(Number(v))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SESSION_DURATIONS.map((d) => (
                    <SelectItem key={d.value} value={String(d.value)}>
                      {d.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="expiry-days">Expiry (days from now, blank = never)</Label>
              <Input
                id="expiry-days"
                type="number"
                placeholder="30"
                value={expiryDays}
                onChange={(e) => setExpiryDays(e.target.value)}
              />
            </div>
          </div>

          <Separator />

          {/* Token Scopes */}
          <div className="space-y-2">
            <Label>Token Scopes</Label>
            <div className="flex flex-wrap gap-2">
              {AGENT_SCOPES.map((scope) => (
                <Badge
                  key={scope}
                  variant={selectedScopes.includes(scope) ? 'default' : 'outline'}
                  className="cursor-pointer text-xs transition-colors"
                  onClick={() => toggleScope(scope)}
                >
                  {scope}
                </Badge>
              ))}
            </div>
          </div>

          <Separator />

          {/* Capabilities */}
          <div className="space-y-3">
            <Label>Capabilities</Label>
            {capabilities.length > 0 && (
              <div className="space-y-1.5">
                {capabilities.map((cap, i) => (
                  <div key={i} className="flex items-center gap-2 p-2 rounded-lg glass-effect border border-border/40 text-xs">
                    <span className="font-mono font-medium flex-1">{cap.action}</span>
                    {cap.requiresApproval && (
                      <Badge variant="secondary" className="text-xs border-warning/40">
                        <Eye className="h-2.5 w-2.5 mr-1" />
                        Approval
                      </Badge>
                    )}
                    <span className="text-muted-foreground">{cap.rateLimit}/h</span>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeCapability(i)}>
                      <XCircle className="h-3 w-3 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-end gap-2 p-3 rounded-xl glass-effect border border-border/40">
              <div className="flex-1 space-y-1">
                <Label className="text-xs">Action</Label>
                <Input
                  placeholder="vault.read"
                  value={newCapAction}
                  onChange={(e) => setNewCapAction(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Rate/h</Label>
                <Input
                  type="number"
                  value={newCapRateLimit}
                  onChange={(e) => setNewCapRateLimit(Number(e.target.value))}
                  className="h-8 w-20 text-xs"
                />
              </div>
              <div className="flex items-center gap-1.5 pb-0.5">
                <Switch
                  checked={newCapApproval}
                  onCheckedChange={setNewCapApproval}
                  className="scale-75"
                />
                <Label className="text-xs text-muted-foreground whitespace-nowrap">Approval</Label>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-8 rounded-full btn-press"
                onClick={addCapability}
                disabled={!newCapAction.trim()}
              >
                <Plus className="h-3 w-3" />
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { resetForm(); onOpenChange(false); }}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={!name.trim()} className="rounded-full btn-press">
            <Bot className="h-4 w-4 mr-1" />
            Create Agent
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
