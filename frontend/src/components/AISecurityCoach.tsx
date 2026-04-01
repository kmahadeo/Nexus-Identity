import { useGetVaultEntries, useGetRecommendations, useGetPasskeyCount, useGetTeams } from '../hooks/useQueries';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { AlertTriangle, CheckCircle2, Shield, Brain, Eye, ArrowRight, TrendingUp, TrendingDown } from 'lucide-react';
import { computeSecurityScore, computeScoreBreakdown, generateInsights, type SecurityState, type SecurityInsight } from '../lib/securityEngine';
import type { SecurityRecommendation } from '../backend';

interface AISecurityCoachProps {
  onNavigate?: (view: string) => void;
}

export default function AISecurityCoach({ onNavigate }: AISecurityCoachProps) {
  const { data: vaultEntries = [], isLoading: vaultLoading } = useGetVaultEntries();
  const { data: recommendations = [] } = useGetRecommendations();
  const { data: passkeyCount = 0 } = useGetPasskeyCount();
  const { data: teams = [] } = useGetTeams();

  const state: SecurityState = {
    vaultEntries,
    passkeyCount,
    recommendations,
    teamCount: teams.length,
  };

  const score = computeSecurityScore(state);
  const breakdown = computeScoreBreakdown(state);
  const insights = generateInsights(state);

  const criticalInsights = insights.filter((i) => i.priority === 'critical');
  const highInsights = insights.filter((i) => i.priority === 'high');
  const mediumInsights = insights.filter((i) => i.priority === 'medium');

  const sortedRecommendations = recommendations.sort(
    (a, b) => Number(b.priority) - Number(a.priority),
  );

  const positiveBreakdown = breakdown.filter((b) => b.positive && b.points > 0);
  const negativeBreakdown = breakdown.filter((b) => !b.positive);

  return (
    <Card className="border-border/40 glass-strong shadow-depth-md card-tactile">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-primary/20 to-accent/10 shadow-depth-sm glow-primary-soft">
            <Shield className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1">
            <CardTitle className="text-lg">Security Advisor</CardTitle>
            <CardDescription className="text-xs flex items-center gap-1">
              <Brain className="h-3 w-3" />
              Rule-based analysis engine &bull; Real-time
            </CardDescription>
          </div>
          <Badge variant="secondary" className="text-xs">
            {score}/100
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Score bar */}
        <div className="p-3 rounded-xl glass-effect border border-border/40">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-muted-foreground">Security Score</span>
            <span className="text-xs font-semibold">{score}/100</span>
          </div>
          <Progress value={score} className="h-2" />
          <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
            <span>{vaultEntries.length} vault entries</span>
            <span>{passkeyCount} passkeys</span>
            <span>{teams.length} teams</span>
          </div>
        </div>

        {/* Score breakdown */}
        <div className="p-3 rounded-xl glass-effect border border-border/40 space-y-2">
          <span className="text-xs font-semibold text-muted-foreground">Score Breakdown</span>
          {positiveBreakdown.map((item) => (
            <div key={item.label} className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <TrendingUp className="h-3 w-3 text-success" />
                {item.label}
              </span>
              <span className="text-success font-medium">+{item.points}</span>
            </div>
          ))}
          {negativeBreakdown.map((item) => (
            <div key={item.label} className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <TrendingDown className="h-3 w-3 text-destructive" />
                {item.label}
              </span>
              <span className="text-destructive font-medium">{item.points}</span>
            </div>
          ))}
        </div>

        {vaultLoading ? (
          <div className="text-center py-8">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary/30 border-t-primary mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Analyzing security data...</p>
          </div>
        ) : insights.length === 1 && insights[0].id === 'all-good' ? (
          <div className="text-center py-8">
            <div className="inline-flex p-4 rounded-2xl bg-success/10 mb-3">
              <CheckCircle2 className="h-8 w-8 text-success" />
            </div>
            <p className="text-sm font-medium mb-1">All clear!</p>
            <p className="text-xs text-muted-foreground">Your security posture looks strong</p>
            <div className="mt-4 p-3 rounded-xl glass-effect border border-border/40">
              <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                <Eye className="h-3 w-3" />
                <span>Continuous local monitoring active</span>
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="space-y-1">
              <span className="text-xs font-semibold text-muted-foreground">Recommendations by Impact</span>
            </div>
            {criticalInsights.length > 0 && (
              <InsightGroup label="Critical" insights={criticalInsights} icon={AlertTriangle} color="destructive" onNavigate={onNavigate} />
            )}
            {highInsights.length > 0 && (
              <InsightGroup label="High" insights={highInsights} icon={AlertTriangle} color="warning" onNavigate={onNavigate} />
            )}
            {mediumInsights.length > 0 && (
              <InsightGroup label="Medium" insights={mediumInsights} icon={Shield} color="primary" onNavigate={onNavigate} />
            )}
          </>
        )}

        {/* Canister recommendations */}
        {sortedRecommendations.length > 0 && (
          <div className="space-y-2 pt-2 border-t border-border/40">
            <span className="text-xs font-semibold text-muted-foreground">On-Chain Recommendations</span>
            {sortedRecommendations.slice(0, 3).map((rec) => (
              <RecommendationCard key={rec.id} recommendation={rec} />
            ))}
          </div>
        )}

        <div className="pt-3 border-t border-border/40">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Brain className="h-3 w-3" />
              Local rule-based engine
            </span>
            <span className="flex items-center gap-1">
              <Eye className="h-3 w-3" />
              No data leaves your browser
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function InsightGroup({
  label,
  insights,
  icon: Icon,
  color,
  onNavigate,
}: {
  label: string;
  insights: SecurityInsight[];
  icon: typeof AlertTriangle;
  color: string;
  onNavigate?: (view: string) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 mb-2">
        <Icon className={`h-4 w-4 text-${color}`} />
        <span className={`text-xs font-semibold text-${color}`}>{label} Priority</span>
        <Badge variant="secondary" className="text-xs ml-auto">
          {insights.length}
        </Badge>
      </div>
      {insights.map((insight) => (
        <div
          key={insight.id}
          className="p-3 rounded-xl border border-border/40 glass-effect shadow-depth-sm card-tactile"
        >
          <p className="text-xs leading-relaxed">{insight.message}</p>
          {insight.affectedEntries && insight.affectedEntries.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {insight.affectedEntries.slice(0, 3).map((name) => (
                <Badge key={name} variant="outline" className="text-[10px] px-1.5 py-0">
                  {name}
                </Badge>
              ))}
              {insight.affectedEntries.length > 3 && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                  +{insight.affectedEntries.length - 3} more
                </Badge>
              )}
            </div>
          )}
          {insight.navigateTo && onNavigate && (
            <Button
              variant="ghost"
              size="sm"
              className="mt-2 h-7 text-xs px-2 hover:bg-primary/10"
              onClick={() => onNavigate(insight.navigateTo!)}
            >
              Fix Now
              <ArrowRight className="h-3 w-3 ml-1" />
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}

function RecommendationCard({ recommendation }: { recommendation: SecurityRecommendation }) {
  const priority = Number(recommendation.priority);
  return (
    <div className="p-3 rounded-xl border border-border/40 glass-effect shadow-depth-sm">
      <div className="flex items-start gap-2">
        <Shield
          className={`h-4 w-4 mt-0.5 ${
            priority >= 3 ? 'text-destructive' : priority >= 2 ? 'text-warning' : 'text-primary'
          }`}
        />
        <p className="text-xs leading-relaxed flex-1">{recommendation.message}</p>
      </div>
    </div>
  );
}
