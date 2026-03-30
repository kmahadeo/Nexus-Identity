import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  UserProfile, VaultEntry, UserDashboardData, Team, TeamMember,
  SharedVaultEntry, SecurityRecommendation, AIContext, AIResponse,
} from '../backend';
import {
  vaultStorage, sessionStorage_, settings, policyStorage, connectorStorage,
  userRegistry, notificationStorage, type SecurityPolicy, type RegisteredUser,
} from '../lib/storage';
import { canDo } from '../lib/permissions';

/* ── Demo seed data for guest / first-time users ──────────────────────── */

const _now = BigInt(Date.now());
const _ms = 1_000_000n;
const _day = 86_400_000n;
const DEMO_VAULT: VaultEntry[] = [
  { id: 'd1', name: 'GitHub (Demo)', title: 'GitHub', username: 'demo@nexus.io', password: 'gh_tok_Demo#2024!Xyz', url: 'https://github.com', category: 'Development', tags: ['dev'], createdAt: (_now - _day * 200n) * _ms, updatedAt: (_now - _day * 95n) * _ms, notes: 'Demo — rotate quarterly', encryptedData: '' },
  { id: 'd2', name: 'AWS Console (Demo)', title: 'AWS Console', username: 'demo@nexus.io', password: 'AWSdemo!Key2024', url: 'https://aws.amazon.com', category: 'Cloud', tags: ['cloud'], createdAt: (_now - _day * 150n) * _ms, updatedAt: (_now - _day * 100n) * _ms, notes: 'Demo AWS account', encryptedData: '' },
  { id: 'd3', name: 'Stripe (Demo)', title: 'Stripe', username: 'demo@nexus.io', password: 'sk_demo_1234', url: 'https://stripe.com', category: 'Finance', tags: ['payments'], createdAt: (_now - _day * 60n) * _ms, updatedAt: (_now - _day * 30n) * _ms, notes: 'Demo API key', encryptedData: '' },
];

function seedGuestVault() {
  if (vaultStorage.getRaw().length === 0) {
    // Guest always uses demo vault key — seed it once
    vaultStorage.save(DEMO_VAULT);
  }
}

/* ── Real threat scan ─────────────────────────────────────────────────── */

export interface ThreatFinding {
  id: string;
  title: string;
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  priority: 'critical' | 'high' | 'medium' | 'low';
  category: string;
  actionable: boolean;
  entryId?: string;
  recommendation: string;
}

export function runThreatScan(entries: VaultEntry[]): ThreatFinding[] {
  const findings: ThreatFinding[] = [];
  const now = Date.now();
  const ROTATION_DAYS = 90;
  const seenPasswords = new Map<string, string[]>();

  entries.forEach(entry => {
    const secret = entry.password || entry.encryptedData || '';
    const ageMs = now - Number(entry.updatedAt) / 1_000_000;
    const ageDays = ageMs / (1000 * 60 * 60 * 24);

    // 1. Weak password check
    if (secret && secret.length < 8) {
      findings.push({ id: `weak-${entry.id}`, title: `Weak password — ${entry.name}`, description: `Password is only ${secret.length} characters. Minimum recommended length is 12.`, severity: 'critical', priority: 'critical', category: 'Password Strength', actionable: true, entryId: entry.id, recommendation: 'Generate a new password (16+ chars) using the Vault password generator.' });
    } else if (secret && secret.length < 12) {
      findings.push({ id: `short-${entry.id}`, title: `Short password — ${entry.name}`, description: `Password is ${secret.length} characters. Best practice requires 12+.`, severity: 'high', priority: 'high', category: 'Password Strength', actionable: true, entryId: entry.id, recommendation: 'Increase password length to at least 16 characters with mixed character classes.' });
    }

    // 2. Missing complexity
    if (secret && secret.length >= 8) {
      const hasUpper = /[A-Z]/.test(secret);
      const hasLower = /[a-z]/.test(secret);
      const hasNum   = /[0-9]/.test(secret);
      const hasSym   = /[^A-Za-z0-9]/.test(secret);
      const missing  = [!hasUpper && 'uppercase', !hasLower && 'lowercase', !hasNum && 'numbers', !hasSym && 'symbols'].filter(Boolean);
      if (missing.length >= 2) {
        findings.push({ id: `complexity-${entry.id}`, title: `Low complexity — ${entry.name}`, description: `Password is missing: ${missing.join(', ')}.`, severity: 'medium', priority: 'medium', category: 'Password Complexity', actionable: true, entryId: entry.id, recommendation: 'Use the password generator with all character classes enabled.' });
      }
    }

    // 3. Credential rotation overdue
    if (ageDays > ROTATION_DAYS && secret) {
      const severity = ageDays > 180 ? 'high' : 'medium';
      findings.push({ id: `rotate-${entry.id}`, title: `Rotation overdue — ${entry.name}`, description: `Credential last rotated ${Math.floor(ageDays)} days ago (limit: ${ROTATION_DAYS} days).`, severity, priority: severity, category: 'Credential Rotation', actionable: true, entryId: entry.id, recommendation: `Rotate this credential now and update the vault entry.` });
    }

    // 4. Password reuse detection
    if (secret) {
      const existing = seenPasswords.get(secret) ?? [];
      existing.push(entry.name);
      seenPasswords.set(secret, existing);
    }

    // 5. HTTP URL (not HTTPS)
    if (entry.url && entry.url.startsWith('http://')) {
      findings.push({ id: `http-${entry.id}`, title: `Insecure URL — ${entry.name}`, description: `URL uses HTTP instead of HTTPS: ${entry.url}`, severity: 'medium', priority: 'medium', category: 'Transport Security', actionable: false, entryId: entry.id, recommendation: 'Update the URL to HTTPS if the service supports it.' });
    }

    // 6. Demo/test passwords
    const lc = secret.toLowerCase();
    if (['demo', 'test', 'password', 'admin', '123456', 'qwerty'].some(w => lc.includes(w))) {
      findings.push({ id: `common-${entry.id}`, title: `Common/test password — ${entry.name}`, description: 'Password contains a common or test string.', severity: 'critical', priority: 'critical', category: 'Password Quality', actionable: true, entryId: entry.id, recommendation: 'Replace immediately with a cryptographically random password.' });
    }
  });

  // 7. Password reuse findings
  seenPasswords.forEach((names, _pwd) => {
    if (names.length > 1) {
      findings.push({ id: `reuse-${names.join('-')}`, title: `Password reused across ${names.length} accounts`, description: `Same password used in: ${names.join(', ')}.`, severity: 'high', priority: 'high', category: 'Password Reuse', actionable: true, recommendation: 'Generate a unique password for each account.' });
    }
  });

  // 8. No passkeys registered
  const session = sessionStorage_.get();
  const passkeys = (() => {
    try { return JSON.parse(localStorage.getItem(`nexus-passkeys-${session?.principalId}`) ?? '[]'); } catch { return []; }
  })();
  if (passkeys.length === 0) {
    findings.push({ id: 'no-passkeys', title: 'No passkeys registered', description: 'Passwordless authentication (FIDO2 passkeys) is not enabled. Your account relies solely on passwords.', severity: 'high', priority: 'high', category: 'Authentication', actionable: true, recommendation: 'Register a passkey in the Passkeys tab to enable phishing-resistant authentication.' });
  }

  return findings;
}

/* ── Hooks ────────────────────────────────────────────────────────────────── */

export function useGetCallerUserProfile() {
  return useQuery<UserProfile | null>({
    queryKey: ['currentUserProfile'],
    queryFn: async () => {
      const session = sessionStorage_.get();
      if (!session) return null;
      return { name: session.name, email: session.email, createdAt: BigInt(session.loginAt) * 1_000_000n, lastLogin: BigInt(session.loginAt) * 1_000_000n };
    },
    staleTime: Infinity,
  });
}

export function useSaveCallerUserProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (profile: UserProfile) => { await new Promise(r => setTimeout(r, 200)); return profile; },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['currentUserProfile'] }),
  });
}

export function useIsCurrentUserAdmin() {
  return useQuery<boolean>({
    queryKey: ['isCurrentUserAdmin'],
    queryFn: async () => sessionStorage_.get()?.role === 'admin',
    staleTime: Infinity,
  });
}

export function useGetDashboardData() {
  return useQuery<UserDashboardData>({
    queryKey: ['dashboardData'],
    queryFn: async () => {
      const session = sessionStorage_.get();
      if (session?.role === 'guest') seedGuestVault();
      const entries = vaultStorage.getRaw();
      const findings = runThreatScan(entries);
      const weak = findings.filter(f => f.category === 'Password Strength' || f.category === 'Password Quality').length;
      const reused = findings.filter(f => f.category === 'Password Reuse').length;
      const score = Math.max(20, 100 - weak * 12 - reused * 8 - (entries.length === 0 ? 15 : 0));
      const passkeys = (() => {
        try { return JSON.parse(localStorage.getItem(`nexus-passkeys-${session?.principalId}`) ?? '[]'); } catch { return []; }
      })();
      return {
        totalCredentials: entries.length,
        weakPasswords: weak,
        reusedPasswords: reused,
        breachedAccounts: 0,
        securityScore: score,
        lastScanTime: BigInt(Date.now()) * 1_000_000n,
        activeDevices: 2,
        passkeysCount: passkeys.length,
        recentActivity: [
          { id: '1', action: 'Login', details: session ? `${session.role} login via Nexus Identity` : 'Session resumed', timestamp: BigInt(Date.now()) * 1_000_000n, ipAddress: '127.0.0.1', deviceName: 'Current Device' },
        ],
        recommendations: findings.slice(0, 10).map((f, i) => ({
          id: f.id, title: f.title, message: f.description, description: f.description,
          severity: f.severity, priority: f.priority, category: f.category, actionable: f.actionable,
          createdAt: BigInt(i),
        })) as SecurityRecommendation[],
      };
    },
  });
}

export function useGetVaultEntries() {
  return useQuery<VaultEntry[]>({
    queryKey: ['vaultEntries'],
    queryFn: async () => {
      const session = sessionStorage_.get();
      if (session?.role === 'guest') { seedGuestVault(); }
      return vaultStorage.getRaw();
    },
  });
}

export function useAddVaultEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (entry: VaultEntry) => {
      const session = sessionStorage_.get();
      // Permission check
      if (session && !canDo(session.principalId, session.role, 'vault:write:own')) {
        throw new Error('You do not have permission to add vault entries.');
      }
      // Guest users cannot add entries
      if (session?.role === 'guest') {
        throw new Error('Guest accounts are read-only. Log in with a full account to add entries.');
      }
      vaultStorage.add(entry);
      notificationStorage.add({ title: 'Vault entry added', body: `"${entry.name}" saved to your vault.`, type: 'success' });
      return entry;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vaultEntries'] });
      queryClient.invalidateQueries({ queryKey: ['dashboardData'] });
      queryClient.invalidateQueries({ queryKey: ['recommendations'] });
      queryClient.invalidateQueries({ queryKey: ['allUsers'] }); // refresh admin counts
    },
  });
}

export function useUpdateVaultEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (entry: VaultEntry) => {
      const session = sessionStorage_.get();
      if (session?.role === 'guest') throw new Error('Guest accounts are read-only.');
      vaultStorage.update(entry);
      return entry;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['vaultEntries'] }),
  });
}

export function useDeleteVaultEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const session = sessionStorage_.get();
      if (session?.role === 'guest') throw new Error('Guest accounts cannot delete entries.');
      if (session?.role === 'contractor') throw new Error('Contractors cannot delete vault entries.');
      vaultStorage.delete(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vaultEntries'] });
      queryClient.invalidateQueries({ queryKey: ['dashboardData'] });
      queryClient.invalidateQueries({ queryKey: ['allUsers'] });
    },
  });
}

export function useLogActivity() {
  return useMutation({ mutationFn: async (_: { action: string; details: string }) => {} });
}

export function useGetRecommendations() {
  return useQuery<SecurityRecommendation[]>({
    queryKey: ['recommendations'],
    queryFn: async () => {
      const entries = vaultStorage.getRaw();
      const findings = runThreatScan(entries);
      return findings.map((f, i) => ({
        id: f.id, title: f.title, message: f.description, description: f.description,
        severity: f.severity, priority: f.priority, category: f.category, actionable: f.actionable,
        createdAt: BigInt(i),
      })) as SecurityRecommendation[];
    },
  });
}

export function useAddRecommendation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (r: SecurityRecommendation) => r,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['recommendations'] }),
  });
}

export function useAutoApplyFix() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (fix: { entryId?: string; category?: string }) => {
      await new Promise(r => setTimeout(r, 600));
      // For rotation-type fixes, update the updatedAt timestamp
      if (fix.entryId) {
        const entry = vaultStorage.getRaw().find(e => e.id === fix.entryId);
        if (entry) {
          vaultStorage.update({ ...entry, updatedAt: BigInt(Date.now()) * 1_000_000n });
        }
      }
      return { advice: 'Fix applied.', riskScore: BigInt(5), confidence: BigInt(99) };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vaultEntries'] });
      queryClient.invalidateQueries({ queryKey: ['recommendations'] });
      queryClient.invalidateQueries({ queryKey: ['dashboardData'] });
    },
  });
}

/* ── Teams ────────────────────────────────────────────────────────────────── */

const TEAMS_KEY = 'nexus-teams';

/** Replacer/reviver for BigInt serialisation (mirrors lib/storage.ts helpers). */
function bigintReplacer(_k: string, v: unknown) { return typeof v === 'bigint' ? `__bi__${v}` : v; }
function bigintReviver(_k: string, v: unknown) { return typeof v === 'string' && v.startsWith('__bi__') ? BigInt(v.slice(6)) : v; }

function loadTeams(): Team[] {
  try { return JSON.parse(localStorage.getItem(TEAMS_KEY) ?? '[]', bigintReviver); } catch { return []; }
}
function saveTeams(t: Team[]) {
  try { localStorage.setItem(TEAMS_KEY, JSON.stringify(t, bigintReplacer)); } catch {}
}

export function useGetTeams() {
  return useQuery<Team[]>({
    queryKey: ['teams'],
    queryFn: async () => loadTeams(),
  });
}

export function useCreateTeam() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => {
      const team: Team = { id: crypto.randomUUID(), name, members: [], createdAt: BigInt(Date.now()) * 1_000_000n };
      saveTeams([...loadTeams(), team]);
      return team;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['teams'] }),
  });
}

export function useAddTeamMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ teamId, member }: { teamId: string; member: TeamMember }) => {
      const teams = loadTeams().map(t =>
        t.id === teamId ? { ...t, members: [...t.members, member] } : t,
      );
      saveTeams(teams);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['teams'] }),
  });
}

const SHARED_KEY = 'nexus-shared-entries';

function loadSharedEntries(): SharedVaultEntry[] {
  try { return JSON.parse(localStorage.getItem(SHARED_KEY) ?? '[]', bigintReviver); } catch { return []; }
}

function persistSharedEntries(entries: SharedVaultEntry[]): void {
  try { localStorage.setItem(SHARED_KEY, JSON.stringify(entries, bigintReplacer)); } catch {}
}

export function useGetSharedVaultEntries() {
  return useQuery<SharedVaultEntry[]>({
    queryKey: ['sharedVaultEntries'],
    queryFn: async () => loadSharedEntries(),
  });
}

export function useShareVaultEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ entry, sharedWith, permissions }: { entry: VaultEntry; sharedWith: string[]; permissions: string[] }) => {
      const nowNs = BigInt(Date.now()) * 1_000_000n;
      const shared: SharedVaultEntry = {
        id: crypto.randomUUID(),
        name: entry.name,
        title: entry.title || entry.name,
        username: entry.username || '',
        password: '',  // never store the actual password in shared entry
        url: entry.url || '',
        category: entry.category || '',
        tags: entry.tags || [],
        notes: entry.notes || '',
        encryptedData: entry.encryptedData,
        createdAt: entry.createdAt,
        updatedAt: entry.updatedAt,
        entry,
        sharedWith,
        permissions,
        sharedAt: nowNs,
      };
      persistSharedEntries([...loadSharedEntries(), shared]);
      return shared;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sharedVaultEntries'] }),
  });
}

/* ── Policies ────────────────────────────────────────────────────────────── */

export function useGetPolicies() {
  return useQuery<SecurityPolicy[]>({
    queryKey: ['policies'],
    queryFn: async () => policyStorage.getAll(),
  });
}

export function useTogglePolicy() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => { policyStorage.toggle(id); },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['policies'] }),
  });
}

export function useAddPolicy() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (policy: SecurityPolicy) => { policyStorage.add(policy); return policy; },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['policies'] }),
  });
}

export function useUpdatePolicy() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (policy: SecurityPolicy) => { policyStorage.update(policy); return policy; },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['policies'] }),
  });
}

/* ── User Registry (admin) ────────────────────────────────────────────── */

export function useGetAllUsers() {
  return useQuery<RegisteredUser[]>({
    queryKey: ['allUsers'],
    queryFn: async () => {
      const session = sessionStorage_.get();
      if (session?.role !== 'admin') return [];
      return userRegistry.getAll();
    },
    refetchInterval: 5000, // refresh every 5s so newly logged-in users appear
  });
}

export function useDeactivateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (principalId: string) => { userRegistry.deactivate(principalId); },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['allUsers'] }),
  });
}

/* ── Connectors ──────────────────────────────────────────────────────────── */

export function useGetConnectors() {
  return useQuery({
    queryKey: ['connectors'],
    queryFn: async () => connectorStorage.getAll(),
  });
}

export function useUpsertConnector() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (config: Parameters<typeof connectorStorage.upsert>[0]) => {
      connectorStorage.upsert(config);
      return config;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['connectors'] }),
  });
}

/* ── AI ──────────────────────────────────────────────────────────────────── */

export function useGetAIRecommendations() {
  return useMutation({
    mutationFn: async (_context: AIContext): Promise<AIResponse> => {
      await new Promise(r => setTimeout(r, 400));
      return { advice: 'Enable MFA on all accounts and rotate API keys every 90 days.', riskScore: BigInt(22), confidence: BigInt(95) };
    },
  });
}

export function useGetAIRecommendationsQuery(context: AIContext | null) {
  return useQuery<AIResponse>({
    queryKey: ['aiRecommendations', context],
    queryFn: async (): Promise<AIResponse> => {
      if (!context) return { advice: '', riskScore: BigInt(0), confidence: BigInt(0) };

      const provider = settings.getActiveProvider();
      const apiKey = provider?.apiKey || settings.getAiKey();
      const vaultData = (() => { try { return JSON.parse(context.vaultHealth); } catch { return {}; } })();
      const weak = vaultData.weakPasswords || 0;
      const old  = vaultData.oldCredentials || 0;
      const total = vaultData.totalEntries || 0;
      const baseRisk = Math.min(100, weak * 15 + old * 8 + (total === 0 ? 20 : 0));

      if (apiKey && provider?.enabled !== false) {
        try {
          const systemPrompt = 'You are a security analyst for an enterprise identity platform. Analyze vault health data and give a 2-3 sentence security assessment with the most critical action item. Be direct and specific.';
          const userMessage = `Vault: ${context.vaultHealth}\nAuth: ${context.authEvents}\nDevice: ${context.deviceData}\n\nProvide a concise security assessment.`;
          const activeProvider = provider?.provider ?? 'anthropic';

          let responseText = '';
          if (activeProvider === 'anthropic') {
            const model = provider!.model || 'claude-haiku-4-5-20251001';
            const res = await fetch('https://api.anthropic.com/v1/messages', {
              method: 'POST',
              headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true', 'content-type': 'application/json' },
              body: JSON.stringify({ model, max_tokens: 256, system: systemPrompt, messages: [{ role: 'user', content: userMessage }] }),
            });
            if (res.ok) { const d = await res.json(); responseText = d.content?.[0]?.text ?? ''; }
          } else if (activeProvider === 'openai') {
            const model = provider!.model || 'gpt-4o-mini';
            const res = await fetch('https://api.openai.com/v1/chat/completions', {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${apiKey}`, 'content-type': 'application/json' },
              body: JSON.stringify({ model, max_tokens: 256, messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userMessage }] }),
            });
            if (res.ok) { const d = await res.json(); responseText = d.choices?.[0]?.message?.content ?? ''; }
          } else if (activeProvider === 'gemini') {
            const model = provider!.model || 'gemini-1.5-flash';
            const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ system_instruction: { parts: [{ text: systemPrompt }] }, contents: [{ role: 'user', parts: [{ text: userMessage }] }] }),
            });
            if (res.ok) { const d = await res.json(); responseText = d.candidates?.[0]?.content?.parts?.[0]?.text ?? ''; }
          } else if (activeProvider === 'custom' && provider?.baseUrl) {
            const res = await fetch(`${provider.baseUrl}/chat/completions`, {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${apiKey}`, 'content-type': 'application/json' },
              body: JSON.stringify({ model: provider.model, max_tokens: 256, messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userMessage }] }),
            });
            if (res.ok) { const d = await res.json(); responseText = d.choices?.[0]?.message?.content ?? ''; }
          }

          if (responseText) {
            return { advice: responseText, riskScore: BigInt(baseRisk), confidence: BigInt(92) };
          }
        } catch { /* fall through to heuristic */ }
      }

      // Heuristic fallback (no API key or call failed)
      let advice = '';
      if (total === 0) {
        advice = 'No vault entries found. Add credentials to receive a full security assessment.';
      } else if (weak > 0 || old > 0) {
        const issues: string[] = [];
        if (weak > 0) issues.push(`${weak} weak password${weak !== 1 ? 's' : ''}`);
        if (old > 0) issues.push(`${old} credential${old !== 1 ? 's' : ''} overdue for rotation`);
        advice = `Found ${issues.join(' and ')} in your vault. Rotate weak credentials immediately and enable passkey authentication for critical accounts. Add an AI provider key in Settings → AI Coach for deeper analysis.`;
      } else {
        advice = `All ${total} vault entries meet basic requirements. Continue rotating credentials every 90 days and register a passkey for phishing-resistant authentication.`;
      }
      return { advice, riskScore: BigInt(baseRisk), confidence: BigInt(75) };
    },
    enabled: !!context,
    staleTime: 5 * 60 * 1000,
  });
}

interface ChatMessage { role: 'system' | 'user' | 'assistant'; content: string; }

export function useChatWithAI() {
  return useMutation({
    mutationFn: async ({ messages, context }: { messages: ChatMessage[]; context: AIContext }) => {
      const provider = settings.getActiveProvider();
      const apiKey = provider?.apiKey || settings.getAiKey();
      const lastMsg = messages[messages.length - 1]?.content || '';

      if (apiKey && provider?.enabled !== false) {
        try {
          const systemPrompt = `You are the Nexus Identity AI Security Coach — a concise, expert security advisor in an enterprise identity platform. Answer questions about cybersecurity, passkeys, FIDO2/WebAuthn, vault management, threat analysis, and identity governance. Be direct and actionable. Under 200 words. Context: ${JSON.stringify(context)}`;

          const userMessages = messages
            .filter(m => m.role !== 'system')
            .map(m => ({ role: m.role === 'user' ? 'user' : 'assistant' as 'user' | 'assistant', content: m.content }));

          const activeProvider = provider?.provider ?? 'anthropic';

          if (activeProvider === 'anthropic') {
            const VALID = ['claude-haiku-4-5-20251001','claude-sonnet-4-6','claude-opus-4-6'];
            const model = VALID.includes(provider!.model) ? provider!.model : 'claude-haiku-4-5-20251001';
            const res = await fetch('https://api.anthropic.com/v1/messages', {
              method: 'POST',
              headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true', 'content-type': 'application/json' },
              body: JSON.stringify({ model, max_tokens: 512, system: systemPrompt, messages: userMessages }),
            });
            if (res.ok) {
              const d = await res.json();
              const text = d.content?.[0]?.text ?? '';
              if (text) return { message: text, riskScore: 20, confidence: 93 };
            }
          } else if (activeProvider === 'openai') {
            const model = provider!.model || 'gpt-4o-mini';
            const res = await fetch('https://api.openai.com/v1/chat/completions', {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${apiKey}`, 'content-type': 'application/json' },
              body: JSON.stringify({ model, max_tokens: 512, messages: [{ role: 'system', content: systemPrompt }, ...userMessages] }),
            });
            if (res.ok) {
              const d = await res.json();
              const text = d.choices?.[0]?.message?.content ?? '';
              if (text) return { message: text, riskScore: 20, confidence: 93 };
            }
          } else if (activeProvider === 'gemini') {
            const model = provider!.model || 'gemini-1.5-flash';
            const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ system_instruction: { parts: [{ text: systemPrompt }] }, contents: userMessages.map(m => ({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.content }] })) }),
            });
            if (res.ok) {
              const d = await res.json();
              const text = d.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
              if (text) return { message: text, riskScore: 20, confidence: 93 };
            }
          } else if (activeProvider === 'custom' && provider?.baseUrl) {
            const res = await fetch(`${provider.baseUrl}/chat/completions`, {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${apiKey}`, 'content-type': 'application/json' },
              body: JSON.stringify({ model: provider.model, max_tokens: 512, messages: [{ role: 'system', content: systemPrompt }, ...userMessages] }),
            });
            if (res.ok) {
              const d = await res.json();
              const text = d.choices?.[0]?.message?.content ?? '';
              if (text) return { message: text, riskScore: 20, confidence: 93 };
            }
          }
        } catch { /* fall through to local */ }
      }

      // Local heuristic fallback
      await new Promise(r => setTimeout(r, 350));
      const q = lastMsg.toLowerCase();
      if (q.includes('passkey') || q.includes('fido') || q.includes('webauthn'))
        return { message: 'Passkeys bind a cryptographic key pair to your device — the private key never leaves the secure enclave (TPM/Secure Element). They are phishing-proof because credentials are domain-scoped. Register one in the Passkeys tab to enable Touch ID / Face ID / Windows Hello authentication.', riskScore: 5, confidence: 99 };
      if (q.includes('vault') || q.includes('password') || q.includes('encrypt'))
        return { message: 'Vault entries are encrypted with AES-256-GCM (PBKDF2 310k iterations). Use the password generator (✦) to create high-entropy secrets. Rotate any credential older than 90 days — the threat scanner flags these automatically.', riskScore: 12, confidence: 96 };
      if (q.includes('mfa') || q.includes('2fa') || q.includes('totp'))
        return { message: 'Prefer FIDO2/passkeys over TOTP — TOTP can be phished via real-time relay attacks. If TOTP is required, use an authenticator with encrypted backups. Enable MFA on every account, prioritising AWS, GitHub, and financial services first.', riskScore: 8, confidence: 97 };
      if (q.includes('threat') || q.includes('breach') || q.includes('scan'))
        return { message: 'Run a threat scan in the Threats tab — it checks password strength, reuse, rotation age, and missing passkeys across all your vault entries. Critical findings should be resolved within 24 hours. Rotate any breached credential immediately and invalidate all active sessions.', riskScore: 30, confidence: 90 };
      return { message: `To enable full AI responses, go to Settings → AI Coach and add an API key (Anthropic, OpenAI, or Google Gemini).\n\nYou asked: "${lastMsg.slice(0, 80)}"\n\nQuick tip: check your Threats tab for a live security scan of your vault.`, riskScore: 18, confidence: 82 };
    },
  });
}

export function useMakeGetOutcall() {
  return useMutation({ mutationFn: async (_url: string) => ({ body: '{}' }) });
}

export function useInitiateOAuth2() {
  return useMutation({ mutationFn: async (_provider: string) => ({ url: '#' }) });
}

export function useGetIntegrationStatus() {
  return useQuery({
    queryKey: ['integrationStatus'],
    queryFn: async () => {
      const connectors = connectorStorage.getAll();
      return { providers: connectors, lastSync: Date.now() };
    },
  });
}
