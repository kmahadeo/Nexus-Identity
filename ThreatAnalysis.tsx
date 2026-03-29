import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useGetRecommendations, useAutoApplyFix, useGetDashboardData } from './hooks/useQueries';
import { AlertTriangle, Shield, Activity, Target, CheckCircle2, Zap, Clock, RefreshCw, Eye, ChevronDown, ChevronUp, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import type { SecurityRecommendation } from './backend';

type ScanStatus = 'idle' | 'scanning' | 'complete';

const SEVERITY_CONFIG: Record<string, { color: string; bgClass: string; borderClass: string; label: string; priority: number }> = {
  critical: { color: 'text-red-400', bgClass: 'bg-red-500/10', borderClass: 'border-red-500/30', label: 'Critical', priority: 4 },
  high:     { color: 'text-orange-400', bgClass: 'bg-orange-500/10', borderClass: 'border-orange-500/30', label: 'High', priority: 3 },
  medium:   { color: 'text-yellow-400', bgClass: 'bg-yellow-500/10', borderClass: 'border-yellow-500/30', label: 'Medium', priority: 2 },
  low:      { color: 'text-green-400', bgClass: 'bg-green-500/10', borderClass: 'border-green-500/30', label: 'Low', priority: 1 },
};

const MONITORING_ITEMS = [
  { label: 'Unusual login patterns', icon: Eye },
  { label: 'Credential breach detection', icon: Shield },
  { label: 'Account compromise indicators', icon: AlertTriangle },
  { label: 'MFA coverage gaps', icon: CheckCircle2 },
  { label: 'Stale API key detection', icon: Clock },
  { label: 'Password reuse analysis', icon: Activity },
];

function ThreatCard({ rec, onFix }: { rec: SecurityRecommendation; onFix: (rec: SecurityRecommendation) => void }) {
  const [expanded, setExpanded] = useState(false);
  const cfg = SEVERITY_CONFIG[rec.severity] || SEVERITY_CONFIG.medium;

  return (
    <div className={`rounded-xl border ${cfg.borderClass} ${cfg.bgClass} shadow-depth-sm animate-slide-in`}>
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className={`p-2 rounded-lg ${cfg.bgClass} mt-0.5`}>
            <AlertTriangle className={`h-4 w-4 ${cfg.color}`} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <h4 className="font-semibold text-sm">{rec.title}</h4>
              <Badge variant="secondary" className={`text-xs ${cfg.color}`}>{cfg.label}</Badge>
              <Badge variant="secondary" className="text-xs">{rec.category}</Badge>
            </div>
            <p className="text-xs text-muted-foreground">{rec.message || rec.description}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {rec.actionable && (
              <Button
                size="sm"
                onClick={() => onFix(rec)}
                className="rounded-full btn-press h-7 px-3 text-xs"
              >
                <Zap className="h-3 w-3 mr-1" />
                Auto-fix
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setExpanded(!expanded)}
              className="rounded-full h-7 w-7 btn-press"
            >
              {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </Button>
          </div>
        </div>
        {expanded && (
          <div className="mt-3 pt-3 border-t border-white/[0.06]">
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-muted-foreground">Category</span>
                <p className="font-medium mt-0.5">{rec.category}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Actionable</span>
                <p className="font-medium mt-0.5">{rec.actionable ? 'Yes — auto-fix available' : 'Manual review required'}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ThreatAnalysis() {
  const { data: recommendations, isLoading } = useGetRecommendations();
  const { data: dashboardData } = useGetDashboardData();
  const { mutate: autoApplyFix, isPending: isFixing } = useAutoApplyFix();

  const [scanStatus, setScanStatus] = useState<ScanStatus>('idle');
  const [scanProgress, setScanProgress] = useState(0);
  const [fixingId, setFixingId] = useState<string | null>(null);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  const activeRecs = recommendations?.filter(r => !dismissedIds.has(r.id)) || [];
  const critical = activeRecs.filter(r => r.severity === 'critical').length;
  const high = activeRecs.filter(r => r.severity === 'high').length;
  const medium = activeRecs.filter(r => r.severity === 'medium').length;
  const low = activeRecs.filter(r => r.severity === 'low').length;

  const sortedRecs = [...activeRecs].sort((a, b) => {
    const pa = SEVERITY_CONFIG[a.severity]?.priority || 0;
    const pb = SEVERITY_CONFIG[b.severity]?.priority || 0;
    return pb - pa;
  });

  const handleRunScan = async () => {
    setScanStatus('scanning');
    setScanProgress(0);
    for (let i = 0; i <= 100; i += 10) {
      await new Promise(r => setTimeout(r, 180));
      setScanProgress(i);
    }
    setScanStatus('complete');
    toast.success(`Scan complete — ${activeRecs.length} issue${activeRecs.length !== 1 ? 's' : ''} found`);
    setTimeout(() => setScanStatus('idle'), 3000);
  };

  const handleAutoFix = (rec: SecurityRecommendation) => {
    setFixingId(rec.id);
    autoApplyFix(rec, {
      onSuccess: () => {
        setDismissedIds(prev => new Set([...prev, rec.id]));
        setFixingId(null);
        toast.success(`Fixed: ${rec.title}`);
      },
      onError: () => {
        setFixingId(null);
        toast.error('Auto-fix failed — try again');
      },
    });
  };

  const overallScore = dashboardData?.securityScore || 87;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold mb-2">Threat Analysis</h1>
          <p className="text-muted-foreground">AI-powered security monitoring with real-time threat detection</p>
        </div>
        <Button
          onClick={handleRunScan}
          disabled={scanStatus === 'scanning'}
          className="rounded-full btn-press shadow-lg"
          style={{ background: 'linear-gradient(135deg, #ef4444, #f97316)' }}
        >
          {scanStatus === 'scanning' ? (
            <>
              <div className="h-4 w-4 mr-2 animate-spin rounded-full border-2 border-white border-t-transparent" />
              Scanning…
            </>
          ) : (
            <>
              <Target className="h-4 w-4 mr-2" />
              {scanStatus === 'complete' ? 'Scan Again' : 'Run Full Scan'}
            </>
          )}
        </Button>
      </div>

      {scanStatus === 'scanning' && (
        <Card className="border-border/40 glass-strong shadow-depth-md">
          <CardContent className="p-5">
            <div className="flex items-center gap-4 mb-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Sparkles className="h-5 w-5 text-primary animate-pulse" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium">AI Security Scan Running</p>
                <p className="text-xs text-muted-foreground">Analysing vault health, auth events, device trust…</p>
              </div>
              <span className="text-sm font-mono text-primary">{scanProgress}%</span>
            </div>
            <Progress value={scanProgress} className="h-1.5" />
          </CardContent>
        </Card>
      )}

      {/* Metric cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-border/40 glass-strong shadow-depth-md card-tactile from-red-500/15 to-red-500/5">
          <CardContent className="p-5">
            <AlertTriangle className="h-6 w-6 text-red-400 mb-2" />
            <div className="text-2xl font-bold mb-0.5">{critical}</div>
            <div className="text-xs text-muted-foreground">Critical</div>
          </CardContent>
        </Card>
        <Card className="border-border/40 glass-strong shadow-depth-md card-tactile from-orange-500/15 to-orange-500/5">
          <CardContent className="p-5">
            <AlertTriangle className="h-6 w-6 text-orange-400 mb-2" />
            <div className="text-2xl font-bold mb-0.5">{high}</div>
            <div className="text-xs text-muted-foreground">High</div>
          </CardContent>
        </Card>
        <Card className="border-border/40 glass-strong shadow-depth-md card-tactile gradient-warning">
          <CardContent className="p-5">
            <AlertTriangle className="h-6 w-6 text-warning mb-2" />
            <div className="text-2xl font-bold mb-0.5">{medium}</div>
            <div className="text-xs text-muted-foreground">Medium</div>
          </CardContent>
        </Card>
        <Card className="border-border/40 glass-strong shadow-depth-md card-tactile gradient-success">
          <CardContent className="p-5">
            <CheckCircle2 className="h-6 w-6 text-success mb-2" />
            <div className="text-2xl font-bold mb-0.5">{low}</div>
            <div className="text-xs text-muted-foreground">Low / Informational</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        {/* Threat feed */}
        <div className="md:col-span-2 space-y-4">
          <Card className="border-border/40 glass-strong shadow-depth-md">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Active Threats</CardTitle>
                  <CardDescription>
                    {activeRecs.length > 0
                      ? `${activeRecs.length} issue${activeRecs.length !== 1 ? 's' : ''} require attention`
                      : 'No active threats detected'}
                  </CardDescription>
                </div>
                <Badge variant="secondary" className="text-xs font-mono">
                  <Activity className="h-3 w-3 mr-1 animate-pulse" />
                  Live
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex justify-center py-8">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                </div>
              ) : sortedRecs.length > 0 ? (
                <ScrollArea className="h-[400px]">
                  <div className="space-y-3 pr-2">
                    {sortedRecs.map(rec => (
                      <ThreatCard
                        key={rec.id}
                        rec={rec}
                        onFix={handleAutoFix}
                      />
                    ))}
                  </div>
                </ScrollArea>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="p-5 rounded-2xl bg-success/10 mb-4">
                    <Shield className="h-12 w-12 text-success" />
                  </div>
                  <h3 className="font-semibold mb-1">All clear!</h3>
                  <p className="text-sm text-muted-foreground">No active threats detected. Keep it up.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right column */}
        <div className="space-y-4">
          {/* Overall risk score */}
          <Card className="border-border/40 glass-strong shadow-depth-md gradient-success">
            <CardHeader>
              <CardTitle className="text-base">Risk Score</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-end gap-2 mb-3">
                <span className="text-4xl font-bold text-success">{overallScore}</span>
                <span className="text-muted-foreground mb-1">/100</span>
              </div>
              <Progress value={overallScore} className="h-2 mb-2" />
              <p className="text-xs text-muted-foreground">
                {overallScore >= 90 ? 'Excellent security posture' : overallScore >= 70 ? 'Good — some improvements needed' : 'Action required'}
              </p>
            </CardContent>
          </Card>

          {/* Monitoring items */}
          <Card className="border-border/40 glass-strong shadow-depth-md">
            <CardHeader>
              <div className="flex items-center gap-2">
                <CardTitle className="text-base">AI Monitoring</CardTitle>
                <Badge variant="secondary" className="text-xs">
                  <Activity className="h-3 w-3 mr-1 animate-pulse" />
                  Active
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {MONITORING_ITEMS.map(({ label, icon: Icon }) => (
                  <div key={label} className="flex items-center gap-3 p-2.5 rounded-lg glass-effect border border-border/40">
                    <div className="h-1.5 w-1.5 rounded-full bg-success animate-pulse shrink-0" />
                    <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="text-xs">{label}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Last scan */}
          <Card className="border-border/40 glass-strong shadow-depth-md">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Last Scan</span>
                <RefreshCw className="h-4 w-4 text-muted-foreground" />
              </div>
              <p className="text-xs text-muted-foreground mb-1">2 minutes ago</p>
              <div className="flex items-center gap-2">
                <div className="h-1.5 w-1.5 rounded-full bg-success" />
                <span className="text-xs text-success">Clean</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
