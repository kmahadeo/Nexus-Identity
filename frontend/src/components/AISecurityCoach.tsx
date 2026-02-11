import { useGetVaultEntries, useGetRecommendations, useGetPasskeyCount, useGetTeams } from '../hooks/useQueries';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Sparkles, AlertTriangle, CheckCircle2, Shield, Brain, Eye } from 'lucide-react';
import { computeSecurityScore, generateInsights, type SecurityState } from '../lib/securityEngine';
import type { SecurityRecommendation } from '../backend';

export default function AISecurityCoach() {
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
  const insights = generateInsights(state);

  const criticalInsights = insights.filter((i) => i.priority === 'critical');
  const highInsights = insights.filter((i) => i.priority === 'high');
  const mediumInsights = insights.filter((i) => i.priority === 'medium');

  const sortedRecommendations = recommendations.sort(
    (a, b) => Number(b.priority) - Number(a.priority),
  );

  return (
    <Card className="border-border/40 glass-strong shadow-depth-md card-tactile">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-primary/20 to-accent/10 shadow-depth-sm glow-primary-soft">
            <Sparkles className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1">
            <CardTitle className="text-lg">Security Coach</CardTitle>
            <CardDescription className="text-xs flex items-center gap-1">
              <Brain className="h-3 w-3" />
              Client-side rule engine &bull; Real-time analysis
            </CardDescription>
          </div>
          <Badge variant="secondary" className="text-xs">
            Score: {score}
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

        {vaultLoading ? (
          <div className="text-center py-8">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary/30 border-t-primary mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Loading data...</p>
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
            {criticalInsights.length > 0 && (
              <InsightGroup label="Critical" insights={criticalInsights} icon={AlertTriangle} color="destructive" />
            )}
            {highInsights.length > 0 && (
              <InsightGroup label="High" insights={highInsights} icon={AlertTriangle} color="warning" />
            )}
            {mediumInsights.length > 0 && (
              <InsightGroup label="Medium" insights={mediumInsights} icon={Shield} color="primary" />
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
              Client-side rule engine
            </span>
            <span className="flex items-center gap-1">
              <Eye className="h-3 w-3" />
              No external API calls
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
}: {
  label: string;
  insights: { id: string; message: string }[];
  icon: typeof AlertTriangle;
  color: string;
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
