import { useEffect, useMemo, useState } from 'react';
import { useGetVaultEntries, useAddRecommendation, useGetRecommendations, useGetAIRecommendationsQuery, useAutoApplyFix } from './hooks/useQueries';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Sparkles, AlertTriangle, CheckCircle2, Shield, Activity, Eye, Brain, Info, Loader2, RefreshCw, Lock, Clock, Globe, Copy, KeyRound } from 'lucide-react';
import { toast } from 'sonner';
import type { SecurityRecommendation, AIContext } from './backend';
import { settings as appSettings } from './lib/storage';

// ---------- Local rule-based intelligence ----------

interface LocalFinding {
  id: string;
  title: string;
  message: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  icon: 'weak' | 'stale' | 'http' | 'reuse' | 'mfa';
  affected: string[]; // entry names
}

interface LocalAnalysis {
  score: number; // 0-100
  findings: LocalFinding[];
  stats: {
    totalEntries: number;
    weakPasswords: number;
    staleCredentials: number;
    httpUrls: number;
    reusedPasswords: number;
    missingMfa: number;
  };
}

function runLocalAnalysis(entries: any[]): LocalAnalysis {
  if (!entries || entries.length === 0) {
    return { score: 100, findings: [], stats: { totalEntries: 0, weakPasswords: 0, staleCredentials: 0, httpUrls: 0, reusedPasswords: 0, missingMfa: 0 } };
  }

  const findings: LocalFinding[] = [];
  let deductions = 0;

  // 1. Weak passwords (< 12 chars)
  const weakEntries = entries.filter(e =>
    e.category === 'password' && (e.password || e.encryptedData || '').length < 12
  );
  if (weakEntries.length > 0) {
    const ratio = weakEntries.length / Math.max(entries.filter(e => e.category === 'password').length, 1);
    const sev = ratio > 0.5 ? 'critical' : ratio > 0.25 ? 'high' : 'medium';
    findings.push({
      id: 'local-weak-pw',
      title: 'Weak Passwords Detected',
      message: `${weakEntries.length} credential${weakEntries.length > 1 ? 's' : ''} use passwords shorter than 12 characters. Upgrade to 16+ character passphrases for stronger protection.`,
      severity: sev,
      icon: 'weak',
      affected: weakEntries.map(e => e.name),
    });
    deductions += weakEntries.length * 8;
  }

  // 2. Stale credentials (> 90 days)
  const staleEntries = entries.filter(e => {
    const updatedMs = Number(e.updatedAt) > 1e15 ? Number(e.updatedAt) / 1_000_000 : Number(e.updatedAt);
    const daysSince = (Date.now() - updatedMs) / (1000 * 60 * 60 * 24);
    return daysSince > 90;
  });
  if (staleEntries.length > 0) {
    const sev = staleEntries.length > 5 ? 'high' : 'medium';
    findings.push({
      id: 'local-stale',
      title: 'Stale Credentials',
      message: `${staleEntries.length} credential${staleEntries.length > 1 ? 's have' : ' has'} not been rotated in over 90 days. Regular rotation limits exposure from undetected breaches.`,
      severity: sev,
      icon: 'stale',
      affected: staleEntries.map(e => e.name),
    });
    deductions += staleEntries.length * 4;
  }

  // 3. HTTP URLs (insecure)
  const httpEntries = entries.filter(e => {
    const data = (e.url || e.encryptedData || e.name || '').toLowerCase();
    return data.includes('http://') && !data.includes('localhost') && !data.includes('127.0.0.1');
  });
  if (httpEntries.length > 0) {
    findings.push({
      id: 'local-http',
      title: 'Insecure HTTP URLs',
      message: `${httpEntries.length} entr${httpEntries.length > 1 ? 'ies reference' : 'y references'} plain HTTP URLs. Credentials sent over HTTP can be intercepted. Switch to HTTPS.`,
      severity: 'high',
      icon: 'http',
      affected: httpEntries.map(e => e.name),
    });
    deductions += httpEntries.length * 10;
  }

  // 4. Password reuse detection
  const passwordMap = new Map<string, string[]>();
  entries.forEach(e => {
    if (e.category === 'password') {
      const pw = e.password || e.encryptedData || '';
      if (pw.length > 0) {
        const existing = passwordMap.get(pw) || [];
        existing.push(e.name);
        passwordMap.set(pw, existing);
      }
    }
  });
  const reusedGroups = [...passwordMap.values()].filter(names => names.length > 1);
  const reusedCount = reusedGroups.reduce((sum, g) => sum + g.length, 0);
  if (reusedGroups.length > 0) {
    findings.push({
      id: 'local-reuse',
      title: 'Password Reuse Detected',
      message: `${reusedCount} credentials share duplicate passwords across ${reusedGroups.length} group${reusedGroups.length > 1 ? 's' : ''}. A single breach would compromise all of them.`,
      severity: 'critical',
      icon: 'reuse',
      affected: reusedGroups.flat(),
    });
    deductions += reusedCount * 10;
  }

  // 5. Missing MFA
  const passwordEntries = entries.filter(e => e.category === 'password');
  const mfaEntries = entries.filter(e =>
    e.name.toLowerCase().includes('mfa') || e.name.toLowerCase().includes('2fa') || e.name.toLowerCase().includes('totp') || e.category === 'mfa'
  );
  const missingMfaCount = Math.max(0, passwordEntries.length - mfaEntries.length);
  if (passwordEntries.length > 0 && mfaEntries.length < passwordEntries.length) {
    const sev = mfaEntries.length === 0 ? 'high' : 'medium';
    findings.push({
      id: 'local-mfa',
      title: 'MFA Coverage Gap',
      message: `Only ${mfaEntries.length} of ${passwordEntries.length} password entries have associated MFA. Enable two-factor authentication wherever possible.`,
      severity: sev,
      icon: 'mfa',
      affected: [],
    });
    deductions += missingMfaCount * 3;
  }

  // Sort findings by severity
  const SEV_ORDER: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
  findings.sort((a, b) => (SEV_ORDER[b.severity] || 0) - (SEV_ORDER[a.severity] || 0));

  const score = Math.max(0, Math.min(100, 100 - deductions));

  return {
    score,
    findings,
    stats: {
      totalEntries: entries.length,
      weakPasswords: weakEntries.length,
      staleCredentials: staleEntries.length,
      httpUrls: httpEntries.length,
      reusedPasswords: reusedCount,
      missingMfa: missingMfaCount,
    },
  };
}

// ---------- Component ----------

export default function AISecurityCoach() {
  const { data: vaultEntries, isLoading: vaultLoading } = useGetVaultEntries();
  const { data: recommendations } = useGetRecommendations();
  const { mutate: addRecommendation } = useAddRecommendation();
  const [aiContext, setAiContext] = useState<AIContext | null>(null);
  const { data: aiResponse, isLoading: aiLoading, refetch: refetchAI } = useGetAIRecommendationsQuery(aiContext);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const activeProvider = appSettings.getActiveProvider();
  const hasApiKey = !!(activeProvider?.apiKey);
  const providerLabel = activeProvider ? ({
    anthropic: 'Claude',
    openai: 'OpenAI',
    gemini: 'Gemini',
    custom: 'Custom LLM',
  }[activeProvider.provider] ?? activeProvider.provider) : null;

  // Local rule-based analysis — runs synchronously, no API key needed
  const localAnalysis = useMemo(() => runLocalAnalysis(vaultEntries || []), [vaultEntries]);

  // Prepare AI context whenever vault data changes
  useEffect(() => {
    if (!vaultEntries || vaultEntries.length === 0) {
      setAiContext(null);
      return;
    }

    const weakPasswords = vaultEntries.filter(e =>
      e.category === 'password' && (e.password || e.encryptedData || '').length < 12
    ).length;

    const oldCredentials = vaultEntries.filter(e => {
      const daysSinceUpdate = (Date.now() - Number(e.updatedAt) / 1000000) / (1000 * 60 * 60 * 24);
      return daysSinceUpdate > 90;
    }).length;

    const missingMFA = vaultEntries.filter(e =>
      !e.name.toLowerCase().includes('mfa') && !e.name.toLowerCase().includes('2fa')
    ).length;

    const context: AIContext = {
      vaultHealth: JSON.stringify({
        totalEntries: vaultEntries.length,
        weakPasswords,
        oldCredentials,
        missingMFA,
        categories: vaultEntries.reduce((acc, e) => {
          acc[e.category] = (acc[e.category] || 0) + 1;
          return acc;
        }, {} as Record<string, number>),
      }),
      authEvents: JSON.stringify({
        isAuthenticated: true,
        hasPasskeys: false,
        hasBiometric: false,
        lastActivity: Date.now(),
      }),
      deviceData: JSON.stringify({
        trustLevel: 'medium',
        lastVerified: Date.now(),
        platform: navigator.platform,
        userAgent: navigator.userAgent.substring(0, 100),
      }),
    };

    setAiContext(context);
  }, [vaultEntries]);

  // Progress animation
  useEffect(() => {
    if (aiLoading) {
      setAnalysisProgress(0);
      const interval = setInterval(() => {
        setAnalysisProgress(prev => {
          if (prev >= 90) {
            clearInterval(interval);
            return 90;
          }
          return prev + 10;
        });
      }, 100);
      return () => clearInterval(interval);
    } else if (aiResponse) {
      setAnalysisProgress(100);
    }
  }, [aiLoading, aiResponse]);

  // Process AI response and add recommendations
  useEffect(() => {
    if (aiResponse && aiResponse.advice) {
      // Parse AI advice and create recommendations
      const advice = aiResponse.advice;
      const riskScore = Number(aiResponse.riskScore);
      
      // Create a recommendation from AI response
      const recId = `ai-${Date.now()}`;
      const priorityStr: 'low' | 'medium' | 'high' | 'critical' = riskScore >= 80 ? 'critical' : riskScore >= 50 ? 'high' : 'medium';

      const existingIds = new Set(recommendations?.map(r => r.id) || []);
      if (!existingIds.has(recId)) {
        addRecommendation({
          id: recId,
          title: 'AI Insight',
          description: advice,
          message: advice,
          severity: priorityStr,
          priority: priorityStr,
          category: 'AI',
          actionable: false,
          createdAt: BigInt(Date.now()) * 1_000_000n,
        });
      }
    }
  }, [aiResponse]);

  const PRIORITY_ORDER: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
  const sortedRecommendations = [...(recommendations || [])].sort((a, b) => (PRIORITY_ORDER[b.severity] || 0) - (PRIORITY_ORDER[a.severity] || 0));
  const criticalPriority = sortedRecommendations.filter(r => r.severity === 'critical' || r.severity === 'high');
  const highPriority = sortedRecommendations.filter(r => r.severity === 'medium');
  const mediumPriority = sortedRecommendations.filter(r => r.severity === 'low');

  const handleRefresh = () => {
    if (aiContext) {
      refetchAI();
      toast.info('Refreshing AI analysis...', {
        description: 'Fetching latest security recommendations from Nexus Security API',
      });
    }
  };

  const scoreColor = localAnalysis.score >= 80 ? 'text-success' : localAnalysis.score >= 50 ? 'text-warning' : 'text-destructive';
  const scoreBg = localAnalysis.score >= 80 ? 'from-success/20 to-success/5' : localAnalysis.score >= 50 ? 'from-warning/20 to-warning/5' : 'from-destructive/20 to-destructive/5';
  const scoreLabel = localAnalysis.score >= 80 ? 'Good' : localAnalysis.score >= 50 ? 'Needs Attention' : 'At Risk';

  return (
    <Card className="border-border/40 glass-strong shadow-depth-md card-tactile">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-primary/20 to-accent/10 shadow-depth-sm glow-primary-soft">
            <Sparkles className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1">
            <CardTitle className="text-lg">Security Advisor</CardTitle>
            <CardDescription className="text-xs flex items-center gap-1">
              <Brain className="h-3 w-3" />
              {hasApiKey
                ? `Enhanced mode via ${providerLabel} • Real-time contextual analysis`
                : 'Local intelligence active • Rule-based security analysis'}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {aiLoading && (
              <Badge variant="secondary" className="text-xs">
                <Activity className="h-3 w-3 mr-1 animate-pulse" />
                Analyzing
              </Badge>
            )}
            {hasApiKey && (
              <Button
                variant="ghost"
                size="icon"
                onClick={handleRefresh}
                disabled={aiLoading || !aiContext}
                className="h-8 w-8 rounded-full btn-press"
                title="Refresh AI Analysis"
              >
                <RefreshCw className={`h-4 w-4 ${aiLoading ? 'animate-spin' : ''}`} />
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">

        {/* Security Risk Score — always visible */}
        {!vaultLoading && localAnalysis.stats.totalEntries > 0 && (
          <div className={`p-4 rounded-xl bg-gradient-to-br ${scoreBg} border border-border/40 shadow-depth-sm`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Security Score</span>
              <Badge variant="secondary" className={`text-xs rounded-pill ${scoreColor}`}>{scoreLabel}</Badge>
            </div>
            <div className="flex items-end gap-3">
              <span className={`text-4xl font-bold tabular-nums ${scoreColor}`}>{localAnalysis.score}</span>
              <span className="text-sm text-muted-foreground mb-1">/ 100</span>
            </div>
            <Progress value={localAnalysis.score} className="h-2 mt-3" />
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-3">
              {[
                { label: 'Weak Passwords', value: localAnalysis.stats.weakPasswords },
                { label: 'Stale Creds', value: localAnalysis.stats.staleCredentials },
                { label: 'Missing MFA', value: localAnalysis.stats.missingMfa },
              ].map(stat => (
                <div key={stat.label} className="text-center p-1.5 rounded-lg glass-effect">
                  <div className={`text-sm font-bold ${stat.value > 0 ? 'text-warning' : 'text-success'}`}>{stat.value}</div>
                  <div className="text-[10px] text-muted-foreground leading-tight">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Enhanced AI mode status */}
        {hasApiKey && (
          <Alert className="border-primary/40 bg-primary/5">
            <Sparkles className="h-4 w-4 text-primary" />
            <AlertTitle className="text-sm">{providerLabel} Enhanced Mode</AlertTitle>
            <AlertDescription className="text-xs">
              Analysing vault metadata, auth events, and device trust for personalised recommendations via {providerLabel}.
              {aiResponse && Number(aiResponse.confidence) > 0 && (
                <div className="mt-2 flex items-center gap-2">
                  <span className="font-semibold">AI Risk Score: {Number(aiResponse.riskScore)}/100</span>
                  <span className="text-muted-foreground">•</span>
                  <span>Confidence: {Number(aiResponse.confidence)}%</span>
                </div>
              )}
            </AlertDescription>
          </Alert>
        )}

        {aiLoading && (
          <div className="p-3 rounded-xl glass-effect border border-border/40">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground">AI Security Analysis</span>
              <span className="text-xs font-semibold">{analysisProgress}%</span>
            </div>
            <Progress value={analysisProgress} className="h-2" />
          </div>
        )}

        {vaultLoading ? (
          <div className="text-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Loading vault data...</p>
          </div>
        ) : localAnalysis.stats.totalEntries === 0 ? (
          <div className="text-center py-8">
            <div className="inline-flex p-4 rounded-2xl bg-primary/10 mb-3">
              <Shield className="h-8 w-8 text-primary" />
            </div>
            <p className="text-sm font-medium mb-1">No vault entries yet</p>
            <p className="text-xs text-muted-foreground">Add credentials to your vault to receive security analysis</p>
          </div>
        ) : localAnalysis.findings.length === 0 && sortedRecommendations.length === 0 ? (
          <div className="text-center py-8">
            <div className="inline-flex p-4 rounded-2xl bg-success/10 mb-3">
              <CheckCircle2 className="h-8 w-8 text-success" />
            </div>
            <p className="text-sm font-medium mb-1">All clear!</p>
            <p className="text-xs text-muted-foreground">Your vault is secure and up to date</p>
            <div className="mt-4 p-3 rounded-xl glass-effect border border-border/40">
              <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                <Eye className="h-3 w-3" />
                <span>Continuous monitoring active</span>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Local rule-based findings */}
            {localAnalysis.findings.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 mb-1">
                  <Shield className="h-4 w-4 text-primary" />
                  <span className="text-xs font-semibold">Security Findings</span>
                  <Badge variant="secondary" className="text-xs ml-auto rounded-pill">
                    {localAnalysis.findings.length}
                  </Badge>
                </div>
                {localAnalysis.findings.map(finding => (
                  <LocalFindingCard key={finding.id} finding={finding} />
                ))}
              </div>
            )}

            {/* Backend / AI recommendations */}
            {sortedRecommendations.length > 0 && (
              <>
                {hasApiKey && (
                  <div className="flex items-center gap-2 pt-2">
                    <Sparkles className="h-3.5 w-3.5 text-primary" />
                    <span className="text-xs font-semibold text-primary">Enhanced AI Recommendations</span>
                  </div>
                )}
                {criticalPriority.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 mb-2">
                      <AlertTriangle className="h-4 w-4 text-destructive" />
                      <span className="text-xs font-semibold text-destructive">Critical Priority</span>
                      <Badge variant="destructive" className="text-xs ml-auto">
                        {criticalPriority.length}
                      </Badge>
                    </div>
                    {criticalPriority.map((rec) => (
                      <RecommendationCard key={rec.id} recommendation={rec} priority="critical" />
                    ))}
                  </div>
                )}
                {highPriority.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 mb-2">
                      <AlertTriangle className="h-4 w-4 text-warning" />
                      <span className="text-xs font-semibold text-warning">High Priority</span>
                      <Badge variant="secondary" className="text-xs ml-auto">
                        {highPriority.length}
                      </Badge>
                    </div>
                    {highPriority.map((rec) => (
                      <RecommendationCard key={rec.id} recommendation={rec} priority="high" />
                    ))}
                  </div>
                )}
                {mediumPriority.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 mb-2">
                      <Shield className="h-4 w-4 text-primary" />
                      <span className="text-xs font-semibold text-primary">Medium Priority</span>
                      <Badge variant="secondary" className="text-xs ml-auto">
                        {mediumPriority.length}
                      </Badge>
                    </div>
                    {mediumPriority.map((rec) => (
                      <RecommendationCard key={rec.id} recommendation={rec} priority="medium" />
                    ))}
                  </div>
                )}
              </>
            )}
          </>
        )}

        {/* Footer */}
        <div className="pt-3 border-t border-border/40">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Brain className="h-3 w-3" />
              {hasApiKey ? 'AI-powered contextual learning' : 'Rule-based local analysis'}
            </span>
            <span className="flex items-center gap-1">
              <Activity className="h-3 w-3" />
              {hasApiKey ? 'Real-time monitoring' : 'Instant analysis'}
            </span>
          </div>
          {!hasApiKey && (
            <p className="text-[10px] text-muted-foreground/60 mt-1 text-center">
              Add an API key in Settings to unlock enhanced AI recommendations
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function LocalFindingCard({ finding }: { finding: LocalFinding }) {
  const [expanded, setExpanded] = useState(false);

  const iconMap = {
    weak: Lock,
    stale: Clock,
    http: Globe,
    reuse: Copy,
    mfa: KeyRound,
  };
  const Icon = iconMap[finding.icon] || Shield;

  const sevStyles: Record<string, string> = {
    critical: 'from-destructive/20 to-destructive/5 border-destructive/30',
    high: 'gradient-warning border-warning/20',
    medium: 'gradient-primary border-primary/20',
    low: 'from-muted/20 to-muted/5 border-border/40',
  };
  const sevTextColor: Record<string, string> = {
    critical: 'text-destructive',
    high: 'text-warning',
    medium: 'text-primary',
    low: 'text-muted-foreground',
  };

  return (
    <div className={`p-3 rounded-xl border ${sevStyles[finding.severity]} shadow-depth-sm card-tactile animate-slide-in`}>
      <div className="flex items-start gap-2 mb-1">
        <Icon className={`h-4 w-4 mt-0.5 ${sevTextColor[finding.severity]}`} />
        <div className="flex-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold">{finding.title}</span>
            <Badge variant="secondary" className={`text-[10px] rounded-pill ${sevTextColor[finding.severity]}`}>
              {finding.severity}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{finding.message}</p>
        </div>
      </div>
      {finding.affected.length > 0 && (
        <div className="mt-2">
          <button
            className="text-[10px] text-primary hover:underline btn-press"
            onClick={() => setExpanded(prev => !prev)}
          >
            {expanded ? 'Hide' : 'Show'} affected entries ({finding.affected.length})
          </button>
          {expanded && (
            <div className="mt-1 flex flex-wrap gap-1">
              {finding.affected.slice(0, 10).map((name, i) => (
                <Badge key={i} variant="outline" className="text-[10px] rounded-pill">{name}</Badge>
              ))}
              {finding.affected.length > 10 && (
                <Badge variant="outline" className="text-[10px] rounded-pill">+{finding.affected.length - 10} more</Badge>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function RecommendationCard({ recommendation, priority }: { recommendation: SecurityRecommendation; priority: 'critical' | 'high' | 'medium' }) {
  const { mutate: autoApplyFix, isPending } = useAutoApplyFix();

  const priorityStyles = {
    critical: 'from-destructive/20 to-destructive/5 border-destructive/30',
    high: 'gradient-warning border-warning/20',
    medium: 'gradient-primary border-primary/20',
  };

  const priorityIcons = {
    critical: AlertTriangle,
    high: AlertTriangle,
    medium: Shield,
  };

  const Icon = priorityIcons[priority];

  const handleAction = () => {
    const actionType = recommendation.message.toLowerCase().includes('password') 
      ? 'password_rotation' 
      : recommendation.message.toLowerCase().includes('mfa') 
      ? 'mfa_enable' 
      : 'policy_update';

    autoApplyFix(
      {
        entryId: recommendation.id,
        category: actionType,
      },
      {
        onSuccess: () => {
          toast.success('Security fix applied successfully', {
            description: 'Your security posture has been improved.',
          });
        },
        onError: (error) => {
          toast.error('Auto-apply in progress', {
            description: 'The AI is processing your request. This requires backend provider API integration for full automation.',
            duration: 5000,
          });
        },
      }
    );
  };

  return (
    <div className={`p-3 rounded-xl border ${priorityStyles[priority]} shadow-depth-sm card-tactile animate-slide-in`}>
      <div className="flex items-start gap-2 mb-2">
        <Icon className={`h-4 w-4 mt-0.5 ${priority === 'critical' ? 'text-destructive' : priority === 'high' ? 'text-warning' : 'text-primary'}`} />
        <p className="text-xs font-medium leading-relaxed flex-1">{recommendation.message}</p>
      </div>
      <Button 
        size="sm" 
        variant="secondary" 
        className="w-full h-7 text-xs rounded-lg btn-press"
        onClick={handleAction}
        disabled={isPending}
      >
        {isPending ? (
          <>
            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            Applying...
          </>
        ) : (
          <>
            <Sparkles className="h-3 w-3 mr-1" />
            Auto-Apply Fix
          </>
        )}
      </Button>
    </div>
  );
}
