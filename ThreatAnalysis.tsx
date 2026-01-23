import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Shield, Activity, Target } from 'lucide-react';

export default function ThreatAnalysis() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">Threat Analysis</h1>
        <p className="text-muted-foreground">AI-powered security monitoring and threat detection</p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <Card className="border-border/40 bg-card/50 backdrop-blur-xl">
          <CardHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-3 rounded-xl bg-red-500/20">
                <AlertTriangle className="h-6 w-6 text-red-500" />
              </div>
              <div>
                <CardTitle>AI Security Analysis</CardTitle>
                <CardDescription>Our AI continuously monitors your accounts for:</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <ThreatItem label="Unusual login patterns" status="monitoring" />
              <ThreatItem label="Weak password detection" status="monitoring" />
              <ThreatItem label="Account compromise indicators" status="monitoring" />
              <ThreatItem label="Multi-factor authentication gaps" status="monitoring" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/40 bg-gradient-to-br from-green-500/10 to-green-500/5 backdrop-blur-xl">
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
            <MonitoringItem label="Security Status" value="All Clear" color="green" />
            <MonitoringItem label="Accounts Monitored" value="5 Active" color="blue" />
            <MonitoringItem label="Last Scan" value="2 min ago" color="purple" />
            <Button className="w-full rounded-full bg-gradient-to-r from-orange-500 to-red-500 hover:opacity-90">
              <Target className="h-4 w-4 mr-2" />
              Run Full Security Scan
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ThreatItem({ label, status }: any) {
  return (
    <div className="flex items-center justify-between p-3 rounded-lg bg-background/50 border border-border/40">
      <div className="flex items-center gap-3">
        <div className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
        <span className="text-sm">{label}</span>
      </div>
      <Badge variant="secondary" className="text-xs">
        {status}
      </Badge>
    </div>
  );
}

function MonitoringItem({ label, value, color }: any) {
  const colorClasses = {
    green: 'text-green-500',
    blue: 'text-blue-500',
    purple: 'text-purple-500',
  };

  return (
    <div className="flex items-center justify-between p-3 rounded-lg bg-background/50 border border-border/40">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={`font-semibold ${colorClasses[color]}`}>{value}</span>
    </div>
  );
}
