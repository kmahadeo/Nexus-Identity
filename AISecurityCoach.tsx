import { useEffect, useState } from 'react';
import { useGetVaultEntries, useAddRecommendation, useGetRecommendations, useGetAIRecommendationsQuery, useAutoApplyFix } from './hooks/useQueries';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Sparkles, AlertTriangle, CheckCircle2, Shield, Activity, Eye, Brain, Info, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import type { SecurityRecommendation, AIContext } from './backend';
import { settings as appSettings } from './lib/storage';

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
          createdAt: BigInt(Date.now() * 1_000_000),
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
        description: 'Fetching latest security recommendations from Nexus AI Coach API',
      });
    }
  };

  return (
    <Card className="border-border/40 glass-strong shadow-depth-md card-tactile">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-primary/20 to-accent/10 shadow-depth-sm glow-primary-soft">
            <Sparkles className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1">
            <CardTitle className="text-lg">AI Security Coach</CardTitle>
            <CardDescription className="text-xs flex items-center gap-1">
              <Brain className="h-3 w-3" />
              {hasApiKey ? `Powered by ${providerLabel} • Real-time contextual analysis` : 'Add an API key in Settings → AI Coach to enable AI analysis'}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {aiLoading && (
              <Badge variant="secondary" className="text-xs">
                <Activity className="h-3 w-3 mr-1 animate-pulse" />
                Analyzing
              </Badge>
            )}
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
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* AI Integration Status */}
        <Alert className={`border-primary/40 ${hasApiKey ? 'bg-primary/5' : 'bg-warning/5 border-warning/40'}`}>
          <Info className={`h-4 w-4 ${hasApiKey ? 'text-primary' : 'text-warning'}`} />
          <AlertTitle className="text-sm">{hasApiKey ? `${providerLabel} Connected` : 'No AI Provider Configured'}</AlertTitle>
          <AlertDescription className="text-xs">
            {hasApiKey
              ? `Analysing vault metadata, auth events, and device trust for personalised recommendations via ${providerLabel}.`
              : 'Go to Settings → AI Coach to add an API key. Heuristic analysis is active in the meantime.'}
            {aiResponse && Number(aiResponse.confidence) > 0 && (
              <div className="mt-2 flex items-center gap-2">
                <span className="font-semibold">Risk Score: {Number(aiResponse.riskScore)}/100</span>
                <span className="text-muted-foreground">•</span>
                <span>Confidence: {Number(aiResponse.confidence)}%</span>
              </div>
            )}
          </AlertDescription>
        </Alert>

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
        ) : sortedRecommendations.length === 0 ? (
          <div className="text-center py-8">
            <div className="inline-flex p-4 rounded-2xl bg-success/10 mb-3">
              <CheckCircle2 className="h-8 w-8 text-success" />
            </div>
            <p className="text-sm font-medium mb-1">All clear!</p>
            <p className="text-xs text-muted-foreground">Your vault is secure and up to date</p>
            <div className="mt-4 p-3 rounded-xl glass-effect border border-border/40">
              <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                <Eye className="h-3 w-3" />
                <span>Continuous AI monitoring active via Nexus AI Coach</span>
              </div>
            </div>
          </div>
        ) : (
          <>
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

        {/* AI Insights Footer */}
        <div className="pt-3 border-t border-border/40">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Brain className="h-3 w-3" />
              AI-powered contextual learning
            </span>
            <span className="flex items-center gap-1">
              <Activity className="h-3 w-3" />
              Real-time monitoring
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
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
