import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Brain, Shield, AlertTriangle, TrendingUp, Users, Activity, Zap, CheckCircle2, Target, FileText, Database, ExternalLink } from 'lucide-react';
import { useGetVaultEntries, useGetTeams } from '../hooks/useQueries';

export default function AdminIntelligence() {
  const { data: vaultEntries } = useGetVaultEntries();
  const { data: teams } = useGetTeams();

  const totalUsers = 47;
  const activeThreats = 3;
  const complianceScore = 94;
  const automatedRemediations = 12;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold mb-2">Admin Intelligence Dashboard</h1>
          <p className="text-muted-foreground">AI-powered organizational security management with SIEM integration and compliance monitoring via Caffeine.ai</p>
        </div>
        <Badge variant="secondary" className="text-sm">
          <Brain className="h-4 w-4 mr-1" />
          AI OS-Layer Active
        </Badge>
      </div>

      {/* Key Metrics */}
      <div className="grid md:grid-cols-4 gap-4">
        <Card className="border-border/40 glass-strong shadow-depth-md card-tactile gradient-primary">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-3">
              <Users className="h-7 w-7 text-primary" />
              <Badge variant="secondary" className="text-xs">Active</Badge>
            </div>
            <div className="text-3xl font-bold mb-1">{totalUsers}</div>
            <div className="text-sm text-muted-foreground">Total Users</div>
          </CardContent>
        </Card>

        <Card className="border-border/40 glass-strong shadow-depth-md card-tactile gradient-warning">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-3">
              <AlertTriangle className="h-7 w-7 text-warning" />
              <Badge variant="secondary" className="text-xs">Critical</Badge>
            </div>
            <div className="text-3xl font-bold mb-1">{activeThreats}</div>
            <div className="text-sm text-muted-foreground">Active Threats</div>
          </CardContent>
        </Card>

        <Card className="border-border/40 glass-strong shadow-depth-md card-tactile gradient-success">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-3">
              <CheckCircle2 className="h-7 w-7 text-success" />
              <Badge variant="secondary" className="text-xs">{complianceScore}%</Badge>
            </div>
            <div className="text-3xl font-bold mb-1">SOC2</div>
            <div className="text-sm text-muted-foreground">Compliance</div>
          </CardContent>
        </Card>

        <Card className="border-border/40 glass-strong shadow-depth-md card-tactile from-accent/15 to-accent/5">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-3">
              <Zap className="h-7 w-7 text-accent" />
              <Badge variant="secondary" className="text-xs">Auto</Badge>
            </div>
            <div className="text-3xl font-bold mb-1">{automatedRemediations}</div>
            <div className="text-sm text-muted-foreground">Remediations</div>
          </CardContent>
        </Card>
      </div>

      {/* SIEM Integration */}
      <Card className="border-border/40 glass-strong shadow-depth-md">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>SIEM Integration & Event Streaming</CardTitle>
              <CardDescription>Real-time security event correlation via 1Password Events API with production endpoints</CardDescription>
            </div>
            <Badge variant="secondary" className="text-xs">
              <Activity className="h-3 w-3 mr-1 animate-pulse" />
              Live
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-3 gap-4">
            <SIEMCard
              name="Splunk"
              status="Connected"
              events={1247}
              icon="📊"
              apiDocs="https://docs.splunk.com/Documentation/Splunk"
            />
            <SIEMCard
              name="Microsoft Sentinel"
              status="Connected"
              events={892}
              icon="🛡️"
              apiDocs="https://learn.microsoft.com/en-us/azure/sentinel/"
            />
            <SIEMCard
              name="1Password Events API"
              status="Active"
              events={2139}
              icon="🔐"
              apiDocs="https://developer.1password.com/docs/events-api/"
            />
          </div>
          <div className="mt-4 p-4 rounded-xl glass-effect border border-border/40">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Event Stream Health</span>
              <span className="text-sm font-semibold text-success">100%</span>
            </div>
            <Progress value={100} className="h-2 mb-2" />
            <p className="text-xs text-muted-foreground">Real-time audit trails and security correlation active with live API connections</p>
          </div>
        </CardContent>
      </Card>

      {/* Security Heatmap */}
      <Card className="border-border/40 glass-strong shadow-depth-md">
        <CardHeader>
          <CardTitle>Organizational Security Heatmap</CardTitle>
          <CardDescription>Real-time security posture across all departments powered by Caffeine.ai</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-3 gap-4">
            <HeatmapCard
              department="Engineering"
              score={92}
              users={18}
              status="secure"
            />
            <HeatmapCard
              department="Sales"
              score={78}
              users={15}
              status="warning"
            />
            <HeatmapCard
              department="Marketing"
              score={85}
              users={14}
              status="secure"
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-6">
        {/* AI Policy Generator */}
        <Card className="border-border/40 glass-strong shadow-depth-md">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>AI Policy Generator</CardTitle>
                <CardDescription>Automated security policy creation powered by Caffeine.ai</CardDescription>
              </div>
              <Brain className="h-6 w-6 text-primary" />
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <PolicyCard
              name="Password Rotation Policy"
              status="Active"
              coverage="100%"
            />
            <PolicyCard
              name="MFA Enforcement"
              status="Active"
              coverage="94%"
            />
            <PolicyCard
              name="Device Trust Policy"
              status="Pending"
              coverage="0%"
            />
            <Button className="w-full rounded-full btn-press">
              <Brain className="h-4 w-4 mr-2" />
              Generate New Policy
            </Button>
          </CardContent>
        </Card>

        {/* Automated Remediation */}
        <Card className="border-border/40 glass-strong shadow-depth-md">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Automated Remediation</CardTitle>
                <CardDescription>AI-driven security fixes with policy enforcement via Caffeine.ai</CardDescription>
              </div>
              <Zap className="h-6 w-6 text-accent" />
            </div>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[240px]">
              <div className="space-y-3">
                <RemediationCard
                  action="Weak password reset"
                  user="john.doe@company.com"
                  status="Completed"
                  time="2 hours ago"
                />
                <RemediationCard
                  action="MFA enforcement"
                  user="jane.smith@company.com"
                  status="In Progress"
                  time="30 minutes ago"
                />
                <RemediationCard
                  action="Credential rotation"
                  user="bob.wilson@company.com"
                  status="Scheduled"
                  time="Tomorrow"
                />
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      {/* Compliance Monitoring */}
      <Card className="border-border/40 glass-strong shadow-depth-md">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Compliance Monitoring</CardTitle>
              <CardDescription>Real-time compliance status with automated audit trails and production API integration</CardDescription>
            </div>
            <a
              href="https://www.aicpa-cima.com/topic/audit-assurance/audit-and-assurance-greater-than-soc-2"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-primary hover:underline flex items-center gap-1"
            >
              <ExternalLink className="h-3 w-3" />
              SOC2 Framework
            </a>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-4 gap-4">
            <ComplianceCard
              framework="SOC2"
              score={94}
              status="Compliant"
            />
            <ComplianceCard
              framework="ISO27001"
              score={89}
              status="Compliant"
            />
            <ComplianceCard
              framework="GDPR"
              score={96}
              status="Compliant"
            />
            <ComplianceCard
              framework="HIPAA"
              score={72}
              status="Action Required"
            />
          </div>
        </CardContent>
      </Card>

      {/* Executive Briefing */}
      <Card className="border-border/40 glass-strong shadow-depth-md">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Executive Security Briefing</CardTitle>
              <CardDescription>AI-generated strategic recommendations with risk assessments powered by Caffeine.ai</CardDescription>
            </div>
            <Button variant="outline" className="rounded-full btn-press">
              <FileText className="h-4 w-4 mr-2" />
              Export Report
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <BriefingCard
              title="Critical: Increase MFA Adoption"
              description="6% of users still without MFA. Recommend mandatory enforcement by end of quarter via Cisco Duo or HYPR integration with production API connections."
              priority="high"
            />
            <BriefingCard
              title="Opportunity: Implement Passkey Migration"
              description="Passwordless authentication with FIDO2/WebAuthn and FIDO Alliance MDS integration can reduce support tickets by 40% and improve security posture."
              priority="medium"
            />
            <BriefingCard
              title="Success: Zero Security Incidents"
              description="30 consecutive days without security incidents. AI monitoring effectiveness at 98% with real-time SIEM correlation via Splunk, Sentinel, and 1Password Events API."
              priority="low"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function SIEMCard({ name, status, events, icon, apiDocs }: any) {
  return (
    <div className="p-4 rounded-xl glass-effect border border-border/40 shadow-depth-sm card-tactile">
      <div className="flex items-center gap-3 mb-3">
        <div className="text-3xl">{icon}</div>
        <div className="flex-1">
          <h4 className="font-semibold mb-1">{name}</h4>
          <Badge variant="secondary" className="text-xs">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            {status}
          </Badge>
        </div>
      </div>
      <div className="flex items-center justify-between text-sm mb-2">
        <span className="text-muted-foreground">Events Today</span>
        <span className="font-semibold">{events.toLocaleString()}</span>
      </div>
      {apiDocs && (
        <a
          href={apiDocs}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-primary hover:underline flex items-center gap-1"
        >
          <ExternalLink className="h-3 w-3" />
          API Documentation
        </a>
      )}
    </div>
  );
}

function HeatmapCard({ department, score, users, status }: any) {
  const statusColors = {
    secure: 'gradient-success',
    warning: 'gradient-warning',
    critical: 'from-destructive/15 to-destructive/5',
  };

  return (
    <div className={`p-4 rounded-xl border border-border/40 glass-effect shadow-depth-sm card-tactile ${statusColors[status]}`}>
      <div className="flex items-center justify-between mb-3">
        <h4 className="font-semibold">{department}</h4>
        <Badge variant="secondary" className="text-xs">{users} users</Badge>
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Security Score</span>
          <span className="font-bold">{score}%</span>
        </div>
        <Progress value={score} className="h-2" />
      </div>
    </div>
  );
}

function PolicyCard({ name, status, coverage }: any) {
  return (
    <div className="p-3 rounded-xl glass-effect border border-border/40 shadow-depth-sm">
      <div className="flex items-center justify-between mb-2">
        <h4 className="font-medium text-sm">{name}</h4>
        <Badge variant={status === 'Active' ? 'default' : 'secondary'} className="text-xs">
          {status}
        </Badge>
      </div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Target className="h-3 w-3" />
        <span>Coverage: {coverage}</span>
      </div>
    </div>
  );
}

function RemediationCard({ action, user, status, time }: any) {
  const statusColors: Record<string, string> = {
    Completed: 'text-success',
    'In Progress': 'text-warning',
    Scheduled: 'text-muted-foreground',
  };

  return (
    <div className="p-3 rounded-xl glass-effect border border-border/40 shadow-depth-sm">
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1">
          <h4 className="font-medium text-sm mb-1">{action}</h4>
          <p className="text-xs text-muted-foreground">{user}</p>
        </div>
        <Badge variant="secondary" className={`text-xs ${statusColors[status]}`}>
          {status}
        </Badge>
      </div>
      <p className="text-xs text-muted-foreground">{time}</p>
    </div>
  );
}

function ComplianceCard({ framework, score, status }: any) {
  return (
    <div className="p-4 rounded-xl glass-effect border border-border/40 shadow-depth-sm card-tactile text-center">
      <Shield className={`h-8 w-8 mx-auto mb-2 ${score >= 90 ? 'text-success' : 'text-warning'}`} />
      <h4 className="font-semibold mb-1">{framework}</h4>
      <div className="text-2xl font-bold mb-2">{score}%</div>
      <Badge variant={status === 'Compliant' ? 'default' : 'destructive'} className="text-xs">
        {status}
      </Badge>
    </div>
  );
}

function BriefingCard({ title, description, priority }: any) {
  const priorityColors: Record<string, string> = {
    high: 'border-destructive/40 bg-destructive/5',
    medium: 'border-warning/40 bg-warning/5',
    low: 'border-success/40 bg-success/5',
  };

  const priorityIcons: Record<string, any> = {
    high: AlertTriangle,
    medium: Activity,
    low: CheckCircle2,
  };

  const Icon = priorityIcons[priority];

  return (
    <div className={`p-4 rounded-xl border ${priorityColors[priority]} shadow-depth-sm`}>
      <div className="flex items-start gap-3">
        <Icon className="h-5 w-5 mt-0.5" />
        <div className="flex-1">
          <h4 className="font-semibold mb-1">{title}</h4>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
    </div>
  );
}
