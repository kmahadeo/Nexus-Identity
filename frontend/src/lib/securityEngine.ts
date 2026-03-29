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
    });
  }

  // Empty vault
  if (state.vaultEntries.length === 0) {
    insights.push({
      id: 'empty-vault',
      message: 'Your vault is empty. Add credentials to start tracking your security posture.',
      priority: 'high',
      category: 'vault',
    });
  }

  // Old credentials
  const now = Date.now();
  const oldEntries = state.vaultEntries.filter((e) => {
    const daysSinceUpdate = (now - Number(e.updatedAt) / 1000000) / (1000 * 60 * 60 * 24);
    return daysSinceUpdate > 90;
  });
  if (oldEntries.length > 0) {
    insights.push({
      id: 'old-credentials',
      message: `${oldEntries.length} credential${oldEntries.length > 1 ? 's' : ''} not updated in 90+ days. Consider rotating them.`,
      priority: 'high',
      category: 'password',
    });
  }

  // Weak passwords (short encrypted data as proxy)
  const weakEntries = state.vaultEntries.filter(
    (e) => e.category === 'password' && e.encryptedData.length < 12,
  );
  if (weakEntries.length > 0) {
    insights.push({
      id: 'weak-passwords',
      message: `${weakEntries.length} potentially weak password${weakEntries.length > 1 ? 's' : ''} detected. Use longer, unique passwords.`,
      priority: 'critical',
      category: 'password',
    });
  }

  // Single passkey (no backup)
  if (state.passkeyCount === 1) {
    insights.push({
      id: 'single-passkey',
      message: 'Only one passkey registered. Add a backup passkey on another device.',
      priority: 'medium',
      category: 'passkey',
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
  const criticalCount = insights.filter((i) => i.priority === 'critical').length;

  // Score / security overview
  if (lower.includes('score') || lower.includes('security') || lower.includes('status')) {
    const scoreLabel = score >= 80 ? 'strong' : score >= 50 ? 'moderate' : 'needs attention';
    return `Your security score is ${score}/100 (${scoreLabel}). You have ${state.vaultEntries.length} vault entries, ${state.passkeyCount} passkey${state.passkeyCount !== 1 ? 's' : ''}, and ${state.recommendations.length} open recommendation${state.recommendations.length !== 1 ? 's' : ''}. ${criticalCount > 0 ? `There ${criticalCount === 1 ? 'is' : 'are'} ${criticalCount} critical issue${criticalCount !== 1 ? 's' : ''} to address.` : 'No critical issues found.'}`;
  }

  // Passkey questions
  if (lower.includes('passkey') || lower.includes('webauthn') || lower.includes('fido')) {
    if (state.passkeyCount === 0) {
      return 'You have no passkeys registered. Passkeys use the FIDO2/WebAuthn standard and are stored in your device\'s secure enclave. They\'re phishing-resistant and faster than passwords. Go to the Passkeys tab to create one.';
    }
    return `You have ${state.passkeyCount} passkey${state.passkeyCount !== 1 ? 's' : ''} registered. ${state.passkeyCount === 1 ? 'Consider adding a backup passkey on another device for redundancy.' : 'You have good passkey coverage.'}`;
  }

  // Vault questions
  if (lower.includes('vault') || lower.includes('password') || lower.includes('credential')) {
    if (state.vaultEntries.length === 0) {
      return 'Your vault is empty. Start by adding your most important accounts. The vault stores encrypted credential metadata on the Internet Computer.';
    }
    const categories = state.vaultEntries.reduce(
      (acc, e) => {
        acc[e.category] = (acc[e.category] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );
    const catSummary = Object.entries(categories)
      .map(([k, v]) => `${v} ${k}`)
      .join(', ');
    return `Your vault has ${state.vaultEntries.length} entries: ${catSummary}. ${insights.find((i) => i.id === 'old-credentials')?.message || 'All credentials are up to date.'}`;
  }

  // Recommendations
  if (lower.includes('recommend') || lower.includes('improve') || lower.includes('fix')) {
    if (insights.length === 1 && insights[0].id === 'all-good') {
      return 'No actionable recommendations right now. Your security posture looks solid. Keep monitoring regularly.';
    }
    return (
      'Here are your current recommendations:\n\n' +
      insights
        .filter((i) => i.id !== 'all-good')
        .map((i, idx) => `${idx + 1}. [${i.priority.toUpperCase()}] ${i.message}`)
        .join('\n')
    );
  }

  // Team questions
  if (lower.includes('team') || lower.includes('sharing')) {
    return `You are in ${state.teamCount} team${state.teamCount !== 1 ? 's' : ''}. ${state.teamCount === 0 ? 'Create a team to share credentials securely with collaborators.' : 'Use the Team & Sharing tab to manage members and shared credentials.'}`;
  }

  // Page-contextual fallback
  const pageHints: Record<string, string> = {
    dashboard: `Your dashboard shows a security score of ${score}/100 with ${state.vaultEntries.length} vault entries and ${state.passkeyCount} passkeys. Ask me about your score, recommendations, or any security topic.`,
    passkeys: `You're on the Passkeys page. You have ${state.passkeyCount} registered. I can help with creating passkeys, understanding WebAuthn, or troubleshooting authentication.`,
    vault: `You're viewing your vault with ${state.vaultEntries.length} entries. Ask me about password strength, credential rotation, or vault organization.`,
    threat: `I analyze security based on your vault and passkey data. Ask about your risk level, recommendations, or specific threats.`,
    team: `Team security management. You're in ${state.teamCount} team${state.teamCount !== 1 ? 's' : ''}. Ask about sharing, permissions, or team setup.`,
  };

  return (
    pageHints[page] ||
    `I can help with your security posture (score: ${score}/100), vault management (${state.vaultEntries.length} entries), passkeys (${state.passkeyCount}), or recommendations. What would you like to know?`
  );
}
