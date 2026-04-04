/**
 * lib/agentIdentity.ts — AI Agent Identity management.
 *
 * Manages AI agent identities with scoped tokens, capability-based permissions,
 * human-in-the-loop approval workflows, and emergency kill switch.
 *
 * Storage: localStorage (`nexus-ai-agents`, `nexus-agent-sessions`,
 * `nexus-agent-approvals`) + audit log sync.
 */

import { sessionStorage_ } from './storage';
import { logAuditEvent, getAuditLog } from './auditLog';
import { auditDB, type AuditRecord } from './supabaseStorage';

/* ── Types ──────────────────────────────────────────────────────────────── */

export interface AgentCapability {
  action: string;                  // "vault.read", "user.create", "policy.modify"
  requiresApproval: boolean;       // true = human must approve each time
  rateLimit: number;               // max calls per hour
}

export interface AIAgent {
  id: string;
  name: string;                    // "Deploy Bot", "Security Scanner"
  description: string;
  model: string;                   // "claude-sonnet-4-6", "gpt-4o", "custom"
  provider: string;                // "anthropic", "openai", "custom"
  ownerId: string;                 // human owner principalId
  ownerEmail: string;
  status: 'active' | 'suspended' | 'expired';
  capabilities: AgentCapability[];
  tokenScopes: string[];           // what the agent can access
  humanApprovalRequired: string[]; // actions that need human approval
  maxSessionDuration: number;      // minutes
  lastActivity: number | null;
  totalActions: number;
  createdAt: number;
  expiresAt: number | null;
}

export interface AgentSession {
  id: string;
  agentId: string;
  startedAt: number;
  expiresAt: number;
  actionsPerformed: number;
  lastAction: string | null;
}

export interface AgentApprovalRequest {
  id: string;
  agentId: string;
  agentName: string;
  action: string;
  details: string;
  status: 'pending' | 'approved' | 'denied';
  requestedAt: number;
  respondedAt: number | null;
  respondedBy: string | null;
}

export interface AgentToken {
  agentId: string;
  token: string;           // nxs_agent_[hash]
  hashedToken: string;     // SHA-256 hex
  createdAt: number;
  expiresAt: number;
}

/* ── Constants ──────────────────────────────────────────────────────────── */

const AGENTS_KEY = 'nexus-ai-agents';
const SESSIONS_KEY = 'nexus-agent-sessions';
const APPROVALS_KEY = 'nexus-agent-approvals';
const TOKENS_KEY = 'nexus-agent-tokens';

/** Approval requests auto-expire after this many minutes. */
const APPROVAL_TIMEOUT_MINUTES = 10;

export const AGENT_SCOPES = [
  'vault.read',
  'vault.write',
  'user.read',
  'user.create',
  'user.delete',
  'team.read',
  'team.write',
  'policy.read',
  'policy.modify',
  'audit.read',
  'integrations.read',
  'integrations.write',
] as const;

export type AgentScope = typeof AGENT_SCOPES[number];

export const AGENT_MODELS = [
  { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6', provider: 'anthropic' },
  { value: 'claude-opus-4-6', label: 'Claude Opus 4.6', provider: 'anthropic' },
  { value: 'claude-haiku-4-5', label: 'Claude Haiku 4.5', provider: 'anthropic' },
  { value: 'gpt-4o', label: 'GPT-4o', provider: 'openai' },
  { value: 'gpt-4o-mini', label: 'GPT-4o Mini', provider: 'openai' },
  { value: 'o3', label: 'o3', provider: 'openai' },
  { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', provider: 'google' },
  { value: 'custom', label: 'Custom Model', provider: 'custom' },
] as const;

export const SESSION_DURATIONS = [
  { value: 60, label: '1 hour' },
  { value: 240, label: '4 hours' },
  { value: 1440, label: '24 hours' },
] as const;

/* ── Helpers ────────────────────────────────────────────────────────────── */

function readAgents(): AIAgent[] {
  try {
    return JSON.parse(localStorage.getItem(AGENTS_KEY) ?? '[]') as AIAgent[];
  } catch {
    return [];
  }
}

function writeAgents(agents: AIAgent[]): void {
  try {
    localStorage.setItem(AGENTS_KEY, JSON.stringify(agents));
  } catch { /* quota */ }
}

function readSessions(): AgentSession[] {
  try {
    return JSON.parse(localStorage.getItem(SESSIONS_KEY) ?? '[]') as AgentSession[];
  } catch {
    return [];
  }
}

function writeSessions(sessions: AgentSession[]): void {
  try {
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
  } catch { /* quota */ }
}

function readApprovals(): AgentApprovalRequest[] {
  try {
    return JSON.parse(localStorage.getItem(APPROVALS_KEY) ?? '[]') as AgentApprovalRequest[];
  } catch {
    return [];
  }
}

function writeApprovals(approvals: AgentApprovalRequest[]): void {
  try {
    localStorage.setItem(APPROVALS_KEY, JSON.stringify(approvals));
  } catch { /* quota */ }
}

function readTokens(): AgentToken[] {
  try {
    return JSON.parse(localStorage.getItem(TOKENS_KEY) ?? '[]') as AgentToken[];
  } catch {
    return [];
  }
}

function writeTokens(tokens: AgentToken[]): void {
  try {
    localStorage.setItem(TOKENS_KEY, JSON.stringify(tokens));
  } catch { /* quota */ }
}

/** SHA-256 hash of a string, returned as hex. */
async function sha256Hex(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Generate a crypto-random string of given byte length, hex-encoded. */
function randomHex(bytes: number): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Log to both local audit log and Supabase. */
function logAgentEvent(
  action: string,
  resource: string,
  details: string,
  result: 'success' | 'denied' | 'error' = 'success',
): void {
  logAuditEvent({
    action,
    resource,
    resourceType: 'ai_agent',
    details,
    result,
  });

  const session = sessionStorage_.get();
  const record: AuditRecord = {
    action,
    actor_id: session?.principalId ?? 'unknown',
    actor_email: session?.email ?? 'unknown',
    actor_role: session?.role ?? 'unknown',
    resource_id: resource,
    resource_type: 'ai_agent',
    details,
    ip_address: '127.0.0.1',
    result,
  };
  auditDB.log(record).catch(() => {});
}

/* ── Public API: Agents ────────────────────────────────────────────────── */

/**
 * Retrieve all AI agents. Auto-expires agents past their expiresAt date.
 */
export function getAgents(): AIAgent[] {
  const agents = readAgents();
  const now = Date.now();
  let changed = false;
  for (const agent of agents) {
    if (agent.status === 'active' && agent.expiresAt && agent.expiresAt < now) {
      agent.status = 'expired';
      changed = true;
    }
  }
  if (changed) writeAgents(agents);
  return agents;
}

/**
 * Get a single AI agent by ID.
 */
export function getAgent(id: string): AIAgent | undefined {
  return getAgents().find(a => a.id === id);
}

/**
 * Create a new AI agent.
 */
export function createAgent(agent: Omit<AIAgent, 'id' | 'createdAt' | 'lastActivity' | 'totalActions'>): AIAgent {
  const newAgent: AIAgent = {
    ...agent,
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    lastActivity: null,
    totalActions: 0,
  };

  const agents = readAgents();
  agents.push(newAgent);
  writeAgents(agents);

  logAgentEvent(
    'ai_agent.created',
    newAgent.id,
    `AI agent "${newAgent.name}" (${newAgent.model}/${newAgent.provider}) created by ${newAgent.ownerEmail}`,
  );

  return newAgent;
}

/**
 * Update an existing AI agent.
 */
export function updateAgent(id: string, updates: Partial<Omit<AIAgent, 'id' | 'createdAt'>>): AIAgent | null {
  const agents = readAgents();
  const idx = agents.findIndex(a => a.id === id);
  if (idx < 0) return null;

  agents[idx] = { ...agents[idx], ...updates };
  writeAgents(agents);

  logAgentEvent(
    'ai_agent.updated',
    id,
    `AI agent "${agents[idx].name}" updated`,
  );

  return agents[idx];
}

/**
 * Delete an AI agent permanently.
 */
export function deleteAgent(id: string): void {
  const agents = readAgents();
  const agent = agents.find(a => a.id === id);
  if (agent) {
    logAgentEvent(
      'ai_agent.deleted',
      id,
      `AI agent "${agent.name}" deleted`,
    );
  }
  writeAgents(agents.filter(a => a.id !== id));

  // Clean up associated tokens, sessions, and approvals
  writeTokens(readTokens().filter(t => t.agentId !== id));
  writeSessions(readSessions().filter(s => s.agentId !== id));
  writeApprovals(readApprovals().filter(a => a.agentId !== id));
}

/**
 * Suspend a specific agent.
 */
export function suspendAgent(id: string): void {
  const agents = readAgents();
  const agent = agents.find(a => a.id === id);
  if (agent) {
    agent.status = 'suspended';
    writeAgents(agents);
    logAgentEvent(
      'ai_agent.suspended',
      id,
      `AI agent "${agent.name}" suspended`,
    );
  }
}

/**
 * Reactivate a suspended/expired agent.
 */
export function activateAgent(id: string): void {
  const agents = readAgents();
  const agent = agents.find(a => a.id === id);
  if (agent) {
    agent.status = 'active';
    writeAgents(agents);
    logAgentEvent(
      'ai_agent.activated',
      id,
      `AI agent "${agent.name}" reactivated`,
    );
  }
}

/* ── Public API: Tokens ────────────────────────────────────────────────── */

/**
 * Generate a scoped token for an agent.
 * Returns the plaintext token -- not retrievable after this call.
 */
export async function createAgentToken(agentId: string): Promise<{ plaintext: string; token: AgentToken } | null> {
  const agent = getAgent(agentId);
  if (!agent || agent.status !== 'active') return null;

  const raw = `nxs_agent_${randomHex(20)}`;
  const hashedToken = await sha256Hex(raw);
  const now = Date.now();

  const token: AgentToken = {
    agentId,
    token: raw.slice(0, 12) + '...',  // prefix only stored
    hashedToken,
    createdAt: now,
    expiresAt: now + (agent.maxSessionDuration * 60 * 1000),
  };

  const tokens = readTokens();
  tokens.push(token);
  writeTokens(tokens);

  logAgentEvent(
    'ai_agent.token.created',
    agentId,
    `Token generated for agent "${agent.name}" (expires in ${agent.maxSessionDuration}m)`,
  );

  return { plaintext: raw, token };
}

/**
 * Validate an agent token. Returns the matching agent if valid.
 */
export async function validateAgentToken(token: string): Promise<AIAgent | null> {
  const hash = await sha256Hex(token);
  const now = Date.now();
  const tokens = readTokens();

  for (const t of tokens) {
    if (t.hashedToken === hash) {
      if (t.expiresAt < now) return null;  // expired
      const agent = getAgent(t.agentId);
      if (!agent || agent.status !== 'active') return null;
      return agent;
    }
  }
  return null;
}

/* ── Public API: Sessions ──────────────────────────────────────────────── */

/**
 * Start a new session for an agent.
 */
export function startSession(agentId: string): AgentSession | null {
  const agent = getAgent(agentId);
  if (!agent || agent.status !== 'active') return null;

  const now = Date.now();
  const session: AgentSession = {
    id: crypto.randomUUID(),
    agentId,
    startedAt: now,
    expiresAt: now + (agent.maxSessionDuration * 60 * 1000),
    actionsPerformed: 0,
    lastAction: null,
  };

  const sessions = readSessions();
  sessions.push(session);
  writeSessions(sessions);

  return session;
}

/**
 * Get all sessions for an agent.
 */
export function getAgentSessions(agentId: string): AgentSession[] {
  return readSessions().filter(s => s.agentId === agentId);
}

/**
 * Get active (non-expired) sessions.
 */
export function getActiveSessions(): AgentSession[] {
  const now = Date.now();
  return readSessions().filter(s => s.expiresAt > now);
}

/* ── Public API: Approvals ─────────────────────────────────────────────── */

/**
 * Create an approval request for an agent action.
 */
export function requestApproval(agentId: string, action: string, details: string): AgentApprovalRequest | null {
  const agent = getAgent(agentId);
  if (!agent) return null;

  const request: AgentApprovalRequest = {
    id: crypto.randomUUID(),
    agentId,
    agentName: agent.name,
    action,
    details,
    status: 'pending',
    requestedAt: Date.now(),
    respondedAt: null,
    respondedBy: null,
  };

  const approvals = readApprovals();
  approvals.unshift(request);
  writeApprovals(approvals);

  logAgentEvent(
    'ai_agent.approval.requested',
    agentId,
    `Agent "${agent.name}" requested approval for "${action}": ${details}`,
  );

  return request;
}

/**
 * Approve a pending request.
 */
export function approveRequest(requestId: string): boolean {
  const approvals = readApprovals();
  const request = approvals.find(a => a.id === requestId);
  if (!request || request.status !== 'pending') return false;

  const session = sessionStorage_.get();
  request.status = 'approved';
  request.respondedAt = Date.now();
  request.respondedBy = session?.email ?? 'unknown';
  writeApprovals(approvals);

  logAgentEvent(
    'ai_agent.approval.approved',
    request.agentId,
    `Approval for "${request.action}" on agent "${request.agentName}" approved by ${request.respondedBy}`,
  );

  return true;
}

/**
 * Deny a pending request.
 */
export function denyRequest(requestId: string): boolean {
  const approvals = readApprovals();
  const request = approvals.find(a => a.id === requestId);
  if (!request || request.status !== 'pending') return false;

  const session = sessionStorage_.get();
  request.status = 'denied';
  request.respondedAt = Date.now();
  request.respondedBy = session?.email ?? 'unknown';
  writeApprovals(approvals);

  logAgentEvent(
    'ai_agent.approval.denied',
    request.agentId,
    `Approval for "${request.action}" on agent "${request.agentName}" denied by ${request.respondedBy}`,
  );

  return true;
}

/**
 * Get all pending approval requests. Auto-denies requests that have timed out.
 */
export function getPendingApprovals(): AgentApprovalRequest[] {
  const approvals = readApprovals();
  const now = Date.now();
  const timeoutMs = APPROVAL_TIMEOUT_MINUTES * 60 * 1000;
  let changed = false;

  for (const a of approvals) {
    if (a.status === 'pending' && (now - a.requestedAt) > timeoutMs) {
      a.status = 'denied';
      a.respondedAt = now;
      a.respondedBy = 'system:timeout';
      changed = true;
    }
  }

  if (changed) writeApprovals(approvals);
  return approvals.filter(a => a.status === 'pending');
}

/**
 * Get all approval requests (all statuses).
 */
export function getAllApprovals(): AgentApprovalRequest[] {
  // Trigger timeout processing
  getPendingApprovals();
  return readApprovals();
}

/**
 * Get approval requests for a specific agent.
 */
export function getAgentApprovals(agentId: string): AgentApprovalRequest[] {
  getPendingApprovals(); // process timeouts
  return readApprovals().filter(a => a.agentId === agentId);
}

/* ── Public API: Audit Trail ───────────────────────────────────────────── */

/**
 * Get audit events for a specific agent.
 */
export function getAgentAuditTrail(agentId: string): ReturnType<typeof getAuditLog> {
  return getAuditLog({ action: 'ai_agent' }).filter(
    e => e.resource === agentId,
  );
}

/* ── Public API: Kill Switch ───────────────────────────────────────────── */

/**
 * Emergency kill switch: immediately suspends ALL agents.
 */
export function killSwitch(): number {
  const agents = readAgents();
  let count = 0;
  for (const agent of agents) {
    if (agent.status === 'active') {
      agent.status = 'suspended';
      count++;
    }
  }
  writeAgents(agents);

  // Invalidate all tokens
  writeTokens([]);

  // End all sessions
  writeSessions([]);

  // Deny all pending approvals
  const approvals = readApprovals();
  const session = sessionStorage_.get();
  for (const a of approvals) {
    if (a.status === 'pending') {
      a.status = 'denied';
      a.respondedAt = Date.now();
      a.respondedBy = session?.email ?? 'system:kill_switch';
    }
  }
  writeApprovals(approvals);

  logAgentEvent(
    'ai_agent.kill_switch',
    'all',
    `EMERGENCY: Kill switch activated by ${session?.email ?? 'unknown'}. ${count} agent(s) suspended.`,
    'success',
  );

  return count;
}

/* ── Stats helpers ─────────────────────────────────────────────────────── */

export function getAgentStats() {
  const agents = getAgents();
  const pending = getPendingApprovals();
  return {
    total: agents.length,
    active: agents.filter(a => a.status === 'active').length,
    suspended: agents.filter(a => a.status === 'suspended').length,
    expired: agents.filter(a => a.status === 'expired').length,
    pendingApprovals: pending.length,
    totalActions: agents.reduce((sum, a) => sum + a.totalActions, 0),
  };
}
