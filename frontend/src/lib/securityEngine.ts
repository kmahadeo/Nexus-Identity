import type { VaultEntry, SecurityRecommendation } from '../backend';

export interface SecurityState {
  vaultEntries: VaultEntry[];
  passkeyCount: number;
  recommendations: SecurityRecommendation[];
  teamCount: number;
}

export interface SecurityInsight {
  id: string;
  message: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  category: 'password' | 'passkey' | 'vault' | 'general';
  navigateTo?: string;
  affectedEntries?: string[];
}

export interface ScoreBreakdown {
  label: string;
  points: number;
  maxPoints: number;
  positive: boolean;
}

export function computeScoreBreakdown(state: SecurityState): ScoreBreakdown[] {
  const breakdown: ScoreBreakdown[] = [];

  breakdown.push({ label: 'Base score', points: 40, maxPoints: 40, positive: true });

  const vaultPoints = Math.min(state.vaultEntries.length * 5, 20);
  breakdown.push({ label: `Vault entries (${state.vaultEntries.length})`, points: vaultPoints, maxPoints: 20, positive: true });

  const passkeyBase = state.passkeyCount > 0 ? 15 : 0;
  breakdown.push({ label: state.passkeyCount > 0 ? 'Passkey registered' : 'No passkeys', points: passkeyBase, maxPoints: 15, positive: passkeyBase > 0 });

  const passkeyExtra = Math.min(Math.max(state.passkeyCount - 1, 0) * 5, 10);
  if (state.passkeyCount > 1) {
    breakdown.push({ label: `Backup passkeys (+${state.passkeyCount - 1})`, points: passkeyExtra, maxPoints: 10, positive: true });
  }

  const recPenalty = Math.min(state.recommendations.length * 5, 30);
  if (state.recommendations.length > 0) {
    breakdown.push({ label: `Open recommendations (${state.recommendations.length})`, points: -recPenalty, maxPoints: 30, positive: false });
  }

  const teamPoints = state.teamCount > 0 ? 10 : 0;
  breakdown.push({ label: state.teamCount > 0 ? `In ${state.teamCount} team(s)` : 'No team membership', points: teamPoints, maxPoints: 10, positive: teamPoints > 0 });

  const now = Date.now();
  const oldEntries = state.vaultEntries.filter((e) => {
    const daysSinceUpdate = (now - Number(e.updatedAt) / 1000000) / (1000 * 60 * 60 * 24);
    return daysSinceUpdate > 90;
  });
  if (oldEntries.length > 0) {
    const oldPenalty = Math.min(oldEntries.length * 3, 15);
    breakdown.push({ label: `Stale credentials (${oldEntries.length})`, points: -oldPenalty, maxPoints: 15, positive: false });
  }

  return breakdown;
}

export function computeSecurityScore(state: SecurityState): number {
  let score = 40; // base score

  // +5 per vault entry, max +20
  score += Math.min(state.vaultEntries.length * 5, 20);

  // +15 for having at least one passkey
  if (state.passkeyCount > 0) score += 15;

  // +5 for each additional passkey, max +10
  score += Math.min((state.passkeyCount - 1) * 5, 10);

  // -5 per open recommendation, max -30
  score -= Math.min(state.recommendations.length * 5, 30);

  // +10 for being in a team
  if (state.teamCount > 0) score += 10;

  // Check for old vault entries (not updated in 90+ days)
  const now = Date.now();
  const oldEntries = state.vaultEntries.filter((e) => {
    const daysSinceUpdate = (now - Number(e.updatedAt) / 1000000) / (1000 * 60 * 60 * 24);
    return daysSinceUpdate > 90;
  });
  score -= Math.min(oldEntries.length * 3, 15);

  return Math.max(0, Math.min(100, score));
}

export function generateInsights(state: SecurityState): SecurityInsight[] {
  const insights: SecurityInsight[] = [];

  // No passkeys
  if (state.passkeyCount === 0) {
    insights.push({
      id: 'no-passkeys',
      message: 'No passkeys registered. Create a passkey for phishing-resistant authentication.',
      priority: 'critical',
      category: 'passkey',
      navigateTo: 'passkeys',
    });
  }

  // Empty vault
  if (state.vaultEntries.length === 0) {
    insights.push({
      id: 'empty-vault',
      message: 'Your vault is empty. Add credentials to start tracking your security posture.',
      priority: 'high',
      category: 'vault',
      navigateTo: 'vault',
    });
  }

  // Old credentials
  const now = Date.now();
  const oldEntries = state.vaultEntries.filter((e) => {
    const daysSinceUpdate = (now - Number(e.updatedAt) / 1000000) / (1000 * 60 * 60 * 24);
    return daysSinceUpdate > 90;
  });
  if (oldEntries.length > 0) {
    const oldNames = oldEntries.map((e) => e.name);
    insights.push({
      id: 'old-credentials',
      message: `${oldEntries.length} credential${oldEntries.length > 1 ? 's' : ''} not updated in 90+ days: ${oldNames.slice(0, 5).join(', ')}${oldNames.length > 5 ? ` and ${oldNames.length - 5} more` : ''}. Rotate these passwords.`,
      priority: 'high',
      category: 'password',
      navigateTo: 'vault',
      affectedEntries: oldNames,
    });
  }

  // Weak passwords (short encrypted data as proxy)
  const weakEntries = state.vaultEntries.filter(
    (e) => e.category === 'password' && e.encryptedData.length < 12,
  );
  if (weakEntries.length > 0) {
    const weakNames = weakEntries.map((e) => e.name);
    insights.push({
      id: 'weak-passwords',
      message: `${weakEntries.length} potentially weak password${weakEntries.length > 1 ? 's' : ''} detected: ${weakNames.slice(0, 5).join(', ')}${weakNames.length > 5 ? ` and ${weakNames.length - 5} more` : ''}. Use longer, unique passwords.`,
      priority: 'critical',
      category: 'password',
      navigateTo: 'vault',
      affectedEntries: weakNames,
    });
  }

  // Single passkey (no backup)
  if (state.passkeyCount === 1) {
    insights.push({
      id: 'single-passkey',
      message: 'Only one passkey registered. Add a backup passkey on another device for recovery.',
      priority: 'medium',
      category: 'passkey',
      navigateTo: 'passkeys',
    });
  }

  // No team membership
  if (state.teamCount === 0 && state.vaultEntries.length > 0) {
    insights.push({
      id: 'no-team',
      message: 'Not part of any team. Create or join a team to enable secure credential sharing.',
      priority: 'medium',
      category: 'general',
      navigateTo: 'team',
    });
  }

  // Good state acknowledgment
  if (insights.length === 0) {
    insights.push({
      id: 'all-good',
      message: 'Your security posture looks strong. Keep monitoring regularly.',
      priority: 'low',
      category: 'general',
    });
  }

  return insights;
}

export function generateContextualResponse(
  query: string,
  state: SecurityState,
  page: string,
): string {
  const lower = query.toLowerCase();
  const score = computeSecurityScore(state);
  const insights = generateInsights(state);
  const breakdown = computeScoreBreakdown(state);
  const criticalCount = insights.filter((i) => i.priority === 'critical').length;
  const highCount = insights.filter((i) => i.priority === 'high').length;

  const now = Date.now();
  const oldEntries = state.vaultEntries.filter((e) => {
    const daysSinceUpdate = (now - Number(e.updatedAt) / 1000000) / (1000 * 60 * 60 * 24);
    return daysSinceUpdate > 90;
  });
  const weakEntries = state.vaultEntries.filter(
    (e) => e.category === 'password' && e.encryptedData.length < 12,
  );
  const categories = state.vaultEntries.reduce(
    (acc, e) => { acc[e.category] = (acc[e.category] || 0) + 1; return acc; },
    {} as Record<string, number>,
  );

  // Score breakdown / overview
  if (lower.includes('score') || lower.includes('breakdown') || lower.includes('how is my')) {
    const scoreLabel = score >= 80 ? 'strong' : score >= 50 ? 'moderate' : 'needs improvement';
    const positives = breakdown.filter((b) => b.positive && b.points > 0);
    const negatives = breakdown.filter((b) => !b.positive);
    let response = `Your security score is ${score}/100 (${scoreLabel}).\n\nWhat is helping your score:\n`;
    positives.forEach((b) => { response += `  + ${b.label}: +${b.points}/${b.maxPoints}\n`; });
    if (negatives.length > 0) {
      response += `\nWhat is dragging it down:\n`;
      negatives.forEach((b) => { response += `  - ${b.label}: ${b.points} pts\n`; });
    }
    return response;
  }

  // Security status / overview
  if (lower.includes('security') || lower.includes('status') || lower.includes('overview') || lower.includes('summary')) {
    let response = `Security overview (score: ${score}/100):\n`;
    response += `- ${state.vaultEntries.length} vault entries across ${Object.keys(categories).length} categories\n`;
    response += `- ${state.passkeyCount} passkey${state.passkeyCount !== 1 ? 's' : ''} registered\n`;
    response += `- ${state.teamCount} team${state.teamCount !== 1 ? 's' : ''}\n`;
    response += `- ${state.recommendations.length} open recommendation${state.recommendations.length !== 1 ? 's' : ''}\n`;
    if (criticalCount > 0) response += `\n${criticalCount} critical issue${criticalCount !== 1 ? 's' : ''} need immediate attention.\n`;
    if (highCount > 0) response += `${highCount} high-priority issue${highCount !== 1 ? 's' : ''} should be addressed soon.\n`;
    if (criticalCount === 0 && highCount === 0) response += `\nNo critical or high-priority issues found.\n`;
    return response;
  }

  // Passkey questions
  if (lower.includes('passkey') || lower.includes('webauthn') || lower.includes('fido') || lower.includes('biometric')) {
    if (state.passkeyCount === 0) {
      return `You have no passkeys registered. This is a critical gap: passkeys provide phishing-resistant authentication using your device's secure enclave (FIDO2/WebAuthn).\n\nAction: Navigate to the Passkeys tab and register your first passkey. This alone would add +15 to your security score.`;
    }
    if (state.passkeyCount === 1) {
      return `You have 1 passkey registered (+15 to score). However, with only one passkey, you risk losing access if that device is lost or damaged.\n\nAction: Register a backup passkey on a second device. This would add another +5 to your score and provide recovery capability.`;
    }
    return `You have ${state.passkeyCount} passkeys registered (+${15 + Math.min((state.passkeyCount - 1) * 5, 10)} to score). Good coverage with backup passkeys across devices. Your authentication is phishing-resistant.`;
  }

  // Weak password questions
  if (lower.includes('weak') || lower.includes('strength') || lower.includes('strong')) {
    if (weakEntries.length === 0) {
      return `No weak passwords detected in your vault. All ${state.vaultEntries.filter((e) => e.category === 'password').length} password entries appear to have adequate length.`;
    }
    const names = weakEntries.map((e) => e.name);
    return `${weakEntries.length} potentially weak password${weakEntries.length > 1 ? 's' : ''} detected: ${names.join(', ')}.\n\nThese have short encrypted data, suggesting short or simple passwords. Rotate each one with a password of 16+ characters using mixed case, numbers, and symbols.\n\nNavigate to the Vault to update these entries.`;
  }

  // Old / stale / rotation questions
  if (lower.includes('old') || lower.includes('stale') || lower.includes('rotat') || lower.includes('expire') || lower.includes('outdated')) {
    if (oldEntries.length === 0) {
      return `All credentials in your vault have been updated within the last 90 days. No rotation needed right now.`;
    }
    const names = oldEntries.map((e) => e.name);
    const oldest = oldEntries.sort((a, b) => Number(a.updatedAt) - Number(b.updatedAt))[0];
    const oldestDays = Math.floor((now - Number(oldest.updatedAt) / 1000000) / (1000 * 60 * 60 * 24));
    return `${oldEntries.length} credential${oldEntries.length > 1 ? 's' : ''} not updated in 90+ days: ${names.slice(0, 5).join(', ')}${names.length > 5 ? ` and ${names.length - 5} more` : ''}.\n\nThe oldest is "${oldest.name}" at ~${oldestDays} days since last update. Rotate these starting with the oldest.\n\nThis is costing you -${Math.min(oldEntries.length * 3, 15)} points on your security score.`;
  }

  // Vault / password / credential questions
  if (lower.includes('vault') || lower.includes('password') || lower.includes('credential') || lower.includes('entries')) {
    if (state.vaultEntries.length === 0) {
      return `Your vault is empty. Start by adding your most critical accounts (email, cloud providers, financial services). The vault stores encrypted credential metadata on-chain.\n\nEach entry added increases your score by +5 (up to +20).`;
    }
    const catSummary = Object.entries(categories).map(([k, v]) => `${v} ${k}`).join(', ');
    let response = `Your vault has ${state.vaultEntries.length} entries: ${catSummary}.\n`;
    if (weakEntries.length > 0) response += `\n${weakEntries.length} weak password${weakEntries.length > 1 ? 's' : ''}: ${weakEntries.map((e) => e.name).join(', ')}.\n`;
    if (oldEntries.length > 0) response += `${oldEntries.length} stale credential${oldEntries.length > 1 ? 's' : ''}: ${oldEntries.map((e) => e.name).slice(0, 5).join(', ')}.\n`;
    if (weakEntries.length === 0 && oldEntries.length === 0) response += `All entries look healthy.\n`;
    return response;
  }

  // Recommendations / improve / fix
  if (lower.includes('recommend') || lower.includes('improve') || lower.includes('fix') || lower.includes('action') || lower.includes('what should')) {
    if (insights.length === 1 && insights[0].id === 'all-good') {
      return `No actionable recommendations right now. Your security posture is solid at ${score}/100. Continue monitoring and rotate credentials periodically.`;
    }
    let response = `${insights.filter((i) => i.id !== 'all-good').length} actionable items, ranked by impact:\n\n`;
    insights
      .filter((i) => i.id !== 'all-good')
      .forEach((i, idx) => {
        response += `${idx + 1}. [${i.priority.toUpperCase()}] ${i.message}`;
        if (i.navigateTo) response += ` → Go to ${i.navigateTo}`;
        response += `\n`;
      });
    return response;
  }

  // Team / sharing questions
  if (lower.includes('team') || lower.includes('sharing') || lower.includes('collaborat')) {
    if (state.teamCount === 0) {
      return `You are not part of any team. Creating or joining a team enables secure credential sharing and adds +10 to your security score.\n\nNavigate to the Team & Sharing tab to get started.`;
    }
    return `You are in ${state.teamCount} team${state.teamCount !== 1 ? 's' : ''} (+10 to score). Use the Team & Sharing tab to manage members, adjust permissions, and share vault entries securely.`;
  }

  // Risk / threat questions
  if (lower.includes('risk') || lower.includes('threat') || lower.includes('danger') || lower.includes('vulnerable')) {
    const risks: string[] = [];
    if (state.passkeyCount === 0) risks.push('No passkeys means you are vulnerable to phishing attacks');
    if (weakEntries.length > 0) risks.push(`${weakEntries.length} weak passwords are susceptible to brute-force attacks`);
    if (oldEntries.length > 0) risks.push(`${oldEntries.length} stale credentials increase exposure if any were part of a breach`);
    if (state.teamCount === 0 && state.vaultEntries.length > 5) risks.push('No team setup means no shared security oversight');
    if (risks.length === 0) {
      return `No significant risks identified. Your score is ${score}/100 with no critical findings. Stay vigilant and keep credentials rotated.`;
    }
    return `Current risk factors:\n\n${risks.map((r, i) => `${i + 1}. ${r}`).join('\n')}\n\nAddress these in priority order to reduce your attack surface.`;
  }

  // Help / what can you do
  if (lower.includes('help') || lower.includes('what can you') || lower.includes('how do you work') || lower.includes('capabilities')) {
    return `I am a rule-based security analysis engine running locally in your browser. I analyze your actual vault data, passkey status, and team configuration to provide specific recommendations.\n\nYou can ask me about:\n- Your security score and what affects it\n- Weak or stale passwords (I will name them)\n- Passkey status and recommendations\n- Team and sharing setup\n- Risk assessment\n- What to fix next\n\nAll analysis happens client-side. No data leaves your browser.`;
  }

  // Specific entry lookup
  const entryMatch = state.vaultEntries.find((e) => lower.includes(e.name.toLowerCase()));
  if (entryMatch) {
    const daysSinceUpdate = Math.floor((now - Number(entryMatch.updatedAt) / 1000000) / (1000 * 60 * 60 * 24));
    const isWeak = entryMatch.category === 'password' && entryMatch.encryptedData.length < 12;
    const isOld = daysSinceUpdate > 90;
    let response = `"${entryMatch.name}" (${entryMatch.category}):\n- Last updated: ${daysSinceUpdate} days ago\n`;
    if (isWeak) response += `- WARNING: Password appears weak (short length detected)\n`;
    if (isOld) response += `- WARNING: Not updated in 90+ days, consider rotating\n`;
    if (!isWeak && !isOld) response += `- Status: Looks healthy\n`;
    return response;
  }

  // Page-contextual fallback with actual data
  const pageHints: Record<string, string> = {
    dashboard: `You are on the dashboard. Score: ${score}/100. ${criticalCount > 0 ? `${criticalCount} critical issue${criticalCount !== 1 ? 's' : ''} need attention.` : 'No critical issues.'} Ask about your score breakdown, specific credentials, or what to fix next.`,
    passkeys: `You are on the Passkeys page. ${state.passkeyCount === 0 ? 'You have no passkeys — registering one is your highest-impact action (+15 points).' : `${state.passkeyCount} passkey${state.passkeyCount !== 1 ? 's' : ''} registered.${state.passkeyCount === 1 ? ' Add a backup for recovery.' : ''}`}`,
    vault: `You are viewing your vault (${state.vaultEntries.length} entries). ${weakEntries.length > 0 ? `${weakEntries.length} weak passwords: ${weakEntries.map((e) => e.name).join(', ')}.` : 'No weak passwords detected.'} ${oldEntries.length > 0 ? `${oldEntries.length} need rotation.` : ''}`,
    threat: `Threat analysis view. ${criticalCount + highCount > 0 ? `${criticalCount} critical and ${highCount} high-priority issues found.` : 'No significant threats detected.'} Ask about specific risks or what to address first.`,
    team: `Team management. ${state.teamCount === 0 ? 'No teams yet — creating one adds +10 to your score and enables shared security monitoring.' : `In ${state.teamCount} team${state.teamCount !== 1 ? 's' : ''}.`}`,
  };

  if (pageHints[page]) return pageHints[page];

  // Generic fallback with useful data
  return `Score: ${score}/100 | ${state.vaultEntries.length} vault entries | ${state.passkeyCount} passkeys | ${criticalCount} critical issues\n\nAsk about your score breakdown, weak passwords, stale credentials, passkey status, or what to fix next.`;
}
