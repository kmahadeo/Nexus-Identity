import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Shield, Activity, Target, CheckCircle2 } from 'lucide-react';
import { useGetVaultEntries, useGetPasskeyCount, useGetRecommendations, useGetTeams } from '../hooks/useQueries';
import { generateInsights, computeSecurityScore, type SecurityState } from '../lib/securityEngine';
import { toast } from 'sonner';

export default function ThreatAnalysis() {
  const { data: vaultEntries = [] } = useGetVaultEntries();
  const { data: passkeyCount = 0 } = useGetPasskeyCount();
  const { data: recommendations = [] } = useGetRecommendations();
  const { data: teams = [] } = useGetTeams();
  const [isScanning, setIsScanning] = useState(false);
  const [scanComplete, setScanComplete] = useState(false);

  const state: SecurityState = {
    vaultEntries,
    passkeyCount,
    recommendations,
    teamCount: teams.length,
  };

  const insights = generateInsights(state);
  const score = computeSecurityScore(state);
  const findings = insights.filter(i => i.id !== 'all-good');

  const handleRunScan = () => {
    setIsScanning(true);
    setTimeout(() => {
      setIsScanning(false);
      setScanComplete(true);
      toast.success(`Security scan complete. Score: ${score}/100`, {
        description: `Found ${findings.length} finding(s).`,
      });
    }, 1500);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">Threat Analysis</h1>
        <p className="text-muted-foreground">Security posture monitoring and threat detection</p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <Card className="border-border/40 glass-strong shadow-depth-md">
          <CardHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-3 rounded-xl bg-red-500/20">
                <AlertTriangle className="h-6 w-6 text-red-500" />
              </div>
              <div>
                <CardTitle>Security Findings</CardTitle>
                <CardDescription>
                  {scanComplete
                    ? `${findings.length} finding(s) from latest scan`
                    : 'Run a scan to analyze your security posture'}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {findings.length > 0 ? (
                findings.map((insight) => (
                  <ThreatItem
                    key={insight.id}
                    label={insight.message}
                    status={insight.priority}
                  />
                ))
              ) : (
                <div className="text-center py-6">
                  <CheckCircle2 className="h-10 w-10 text-success mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No threats detected</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/40 glass-strong shadow-depth-md gradient-success">
          <CardHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-3 rounded-xl bg-green-500/20">
                <Activity className="h-6 w-6 text-green-500" />
              </div>
              <div>
                <CardTitle>Real-time Monitoring</CardTitle>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <MonitoringItem label="Security Score" value={`${score}/100`} color="green" />
            <MonitoringItem label="Accounts Monitored" value={`${vaultEntries.length} entries`} color="blue" />
            <MonitoringItem label="Passkeys" value={`${passkeyCount} registered`} color="cyan" />
            <Button
              className="w-full rounded-full bg-gradient-to-r from-orange-500 to-red-500 hover:opacity-90"
              onClick={handleRunScan}
              disabled={isScanning}
            >
              {isScanning ? (
                <>
                  <div className="h-4 w-4 mr-2 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Scanning Identity Fabric...
                </>
              ) : (
                <>
                  <Target className="h-4 w-4 mr-2" />
                  Run Full Security Scan
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ThreatItem({ label, status }: { label: string; status: string }) {
  const dotColor = status === 'critical' ? 'bg-red-500' :
                   status === 'high' ? 'bg-orange-500' :
                   status === 'medium' ? 'bg-yellow-500' : 'bg-green-500';
  return (
    <div className="flex items-center justify-between p-3 rounded-lg bg-background/50 border border-border/40">
      <div className="flex items-center gap-3">
        <div className={`h-2 w-2 rounded-full ${dotColor} animate-pulse`} />
        <span className="text-sm">{label}</span>
      </div>
      <Badge variant="secondary" className="text-xs">
        {status}
      </Badge>
    </div>
  );
}

function MonitoringItem({ label, value, color }: any) {
  const colorClasses: Record<string, string> = {
    green: 'text-green-500',
    blue: 'text-blue-500',
    cyan: 'text-cyan-400',
  };

  return (
    <div className="flex items-center justify-between p-3 rounded-lg bg-background/50 border border-border/40">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={`font-semibold ${colorClasses[color] || ''}`}>{value}</span>
    </div>
  );
}
