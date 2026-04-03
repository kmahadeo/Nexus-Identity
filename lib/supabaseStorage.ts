/**
 * lib/supabaseStorage.ts — Data layer that uses Supabase when available,
 * falls back to localStorage when not.
 *
 * Every function checks isSupabaseConfigured() first. If Supabase is down
 * or not configured, localStorage is used transparently.
 */

import { getSupabase, isSupabaseConfigured } from './supabase';
// Logger import removed — using console.error directly for Supabase errors
// These MUST be visible in production to debug sync failures

/* ── Helper ─────────────────────────────────────────────────────────────── */

function sb() {
  return isSupabaseConfigured() ? getSupabase() : null;
}

/**
 * Ensure the current user's profile exists in Supabase.
 * Must be called before any insert that references profiles(principal_id).
 */
async function ensureProfile(): Promise<string | null> {
  const client = sb();
  if (!client) return null;
  const session = (() => {
    try { return JSON.parse(localStorage.getItem('nexus-session') ?? 'null'); } catch { return null; }
  })();
  if (!session?.principalId) return null;

  const { data } = await client.from('profiles')
    .select('principal_id').eq('principal_id', session.principalId).maybeSingle();

  if (!data) {
    await client.from('profiles').insert({
      principal_id: session.principalId,
      email: session.email || 'unknown',
      name: session.name || 'User',
      role: session.role || 'individual',
      tier: session.tier || 'individual',
      is_active: true, mfa_enabled: false, passkeys_count: 0, vault_count: 0,
    });
  }
  return session.principalId;
}

/* ── Profiles ───────────────────────────────────────────────────────────── */

export interface ProfileRecord {
  principal_id: string;
  email: string;
  name: string;
  first_name?: string;
  last_name?: string;
  alias?: string;
  role: string;
  tier: string;
  avatar_url?: string;
  is_active: boolean;
  mfa_enabled: boolean;
  passkeys_count: number;
  vault_count: number;
}

export const profilesDB = {
  async upsert(profile: ProfileRecord): Promise<void> {
    console.error('[SB-DEBUG] profilesDB.upsert called for:', profile.email, '| configured:', isSupabaseConfigured(), '| url:', !!import.meta.env.VITE_SUPABASE_URL, '| key:', !!import.meta.env.VITE_SUPABASE_ANON_KEY);
    const client = sb();
    if (!client) {
      console.error('[SB-DEBUG] NO CLIENT RETURNED');
      return;
    }
    console.error('[SB-DEBUG] Client obtained, proceeding with upsert');
    try {
      const record = {
        ...profile,
        alias: profile.alias || profile.email.split('@')[0],
        first_name: profile.first_name || profile.name.split(' ')[0] || '',
        last_name: profile.last_name || profile.name.split(' ').slice(1).join(' ') || '',
        last_login_at: new Date().toISOString(),
      };

      // Check by principal_id first
      const { data: byPid } = await client.from('profiles')
        .select('principal_id').eq('principal_id', profile.principal_id).maybeSingle();

      if (byPid) {
        // Existing profile with this principal_id — update it
        const { error } = await client.from('profiles')
          .update(record).eq('principal_id', profile.principal_id);
        if (error) console.error('[Supabase] profile UPDATE (by pid) failed:', error.code, error.message);
        else console.log('[Supabase] profile updated:', profile.email);
      } else {
        // Check by email (might exist with a different principal_id from a previous login method)
        const { data: byEmail } = await client.from('profiles')
          .select('principal_id').eq('email', profile.email.toLowerCase()).maybeSingle();

        if (byEmail) {
          // Email exists with different principal_id — update the row to use the new principal_id
          const { error } = await client.from('profiles')
            .update(record).eq('email', profile.email.toLowerCase());
          if (error) console.error('[Supabase] profile UPDATE (by email) failed:', error.code, error.message);
          else console.log('[Supabase] profile updated (email match):', profile.email);
        } else {
          // Truly new user — insert
          const { error } = await client.from('profiles').insert(record);
          if (error) console.error('[Supabase] profile INSERT failed:', error.code, error.message);
          else console.log('[Supabase] profile created:', profile.email);
        }
      }
    } catch (e) {
      console.error('[Supabase] profile upsert exception:', e);
    }
    // Always keep localStorage in sync as fallback
    try {
      const all: ProfileRecord[] = JSON.parse(localStorage.getItem('nexus-user-registry') ?? '[]');
      const idx = all.findIndex(u => u.principal_id === profile.principal_id);
      if (idx >= 0) all[idx] = { ...all[idx], ...profile };
      else all.push(profile);
      localStorage.setItem('nexus-user-registry', JSON.stringify(all));
    } catch {}
  },

  async getAll(): Promise<ProfileRecord[]> {
    const client = sb();
    if (client) {
      const { data, error } = await client.from('profiles').select('*').order('last_login_at', { ascending: false });
      if (!error && data) return data as ProfileRecord[];
      console.error('[Supabase] profiles getAll failed:', error?.message);
    }
    // Fallback to localStorage
    try { return JSON.parse(localStorage.getItem('nexus-user-registry') ?? '[]'); } catch { return []; }
  },

  async getByEmail(email: string): Promise<ProfileRecord | null> {
    const client = sb();
    if (client) {
      const { data, error } = await client.from('profiles').select('*').eq('email', email.toLowerCase()).single();
      if (!error && data) return data as ProfileRecord;
    }
    // Fallback
    try {
      const all: ProfileRecord[] = JSON.parse(localStorage.getItem('nexus-user-registry') ?? '[]');
      return all.find(u => u.email === email.toLowerCase()) ?? null;
    } catch { return null; }
  },

  async deactivate(principalId: string): Promise<void> {
    const client = sb();
    if (client) {
      await client.from('profiles').update({ is_active: false }).eq('principal_id', principalId);
    }
    try {
      const all = JSON.parse(localStorage.getItem('nexus-user-registry') ?? '[]');
      const updated = all.map((u: any) => u.principal_id === principalId ? { ...u, is_active: false } : u);
      localStorage.setItem('nexus-user-registry', JSON.stringify(updated));
    } catch {}
  },
};

/* ── Vault Entries ──────────────────────────────────────────────────────── */

export interface VaultRecord {
  id?: string;
  owner_id: string;
  name: string;
  title?: string;
  username?: string;
  encrypted_password?: string;
  encrypted_data?: string;
  url?: string;
  category: string;
  tags?: string[];
  notes?: string;
  algorithm_id?: string;
}

export const vaultDB = {
  async getAll(ownerId: string): Promise<VaultRecord[]> {
    const client = sb();
    if (client) {
      const { data, error } = await client.from('vault_entries')
        .select('*').eq('owner_id', ownerId).order('created_at', { ascending: false });
      if (!error && data) return data as VaultRecord[];
      console.error('[Supabase] vault getAll failed:', error?.message);
    }
    return [];
  },

  async add(entry: VaultRecord): Promise<void> {
    const client = sb();
    if (client) {
      // Ensure the owner profile exists first (FK constraint)
      const { data: profileExists } = await client.from('profiles')
        .select('principal_id').eq('principal_id', entry.owner_id).maybeSingle();

      if (!profileExists) {
        // Auto-create a minimal profile so the FK doesn't fail
        const session = (() => {
          try { return JSON.parse(localStorage.getItem('nexus-session') ?? 'null'); } catch { return null; }
        })();
        if (session) {
          await client.from('profiles').insert({
            principal_id: entry.owner_id,
            email: session.email || 'unknown@nexus.io',
            name: session.name || 'User',
            role: session.role || 'individual',
            tier: session.tier || 'individual',
            is_active: true, mfa_enabled: false, passkeys_count: 0, vault_count: 0,
          });
        }
      }

      // Don't pass the id field — let Supabase auto-generate UUID
      const { id: _omit, ...record } = entry;
      console.log('[Supabase] inserting vault entry:', JSON.stringify(record));
      const { data, error } = await client.from('vault_entries').insert(record).select();
      if (error) {
        console.error('[Supabase] vault add FAILED:', error.code, error.message, error.details, error.hint);
      } else {
        console.log('[Supabase] vault add SUCCESS:', data);
      }
    }
  },

  async delete(id: string): Promise<void> {
    const client = sb();
    if (client) {
      await client.from('vault_entries').delete().eq('id', id);
    }
  },

  async update(entry: VaultRecord): Promise<void> {
    const client = sb();
    if (client && entry.id) {
      const { error } = await client.from('vault_entries').update(entry).eq('id', entry.id);
      if (error) console.error('[Supabase] vault update failed:', error.message);
    }
  },
};

/* ── Audit Log ──────────────────────────────────────────────────────────── */

export interface AuditRecord {
  action: string;
  actor_id: string;
  actor_email?: string;
  actor_role?: string;
  resource_id?: string;
  resource_type?: string;
  details?: string;
  ip_address?: string;
  result: 'success' | 'denied' | 'error';
}

export const auditDB = {
  async log(event: AuditRecord): Promise<void> {
    const client = sb();
    if (client) {
      const { error } = await client.from('audit_log').insert(event);
      if (error) console.error('[Supabase] audit log failed:', error.message);
    }
  },

  async getAll(limit = 100): Promise<any[]> {
    const client = sb();
    if (client) {
      const { data, error } = await client.from('audit_log')
        .select('*').order('created_at', { ascending: false }).limit(limit);
      if (!error && data) return data;
    }
    return [];
  },
};

/* ── Active Sessions ────────────────────────────────────────────────────── */

export const sessionsDB = {
  async add(session: {
    principal_id: string; name: string; email: string;
    device: string; ip_address: string;
  }): Promise<void> {
    const client = sb();
    if (client) {
      await ensureProfile();
      const { error } = await client.from('active_sessions').insert(session);
      if (error) console.error('[SB] session add:', error.code, error.message);
    }
  },

  async remove(principalId: string): Promise<void> {
    const client = sb();
    if (client) {
      await client.from('active_sessions').delete().eq('principal_id', principalId);
    }
  },

  async getAll(): Promise<any[]> {
    const client = sb();
    if (client) {
      const { data } = await client.from('active_sessions')
        .select('*').order('last_active', { ascending: false });
      return data ?? [];
    }
    return [];
  },

  async updateLastActive(principalId: string): Promise<void> {
    const client = sb();
    if (client) {
      await client.from('active_sessions')
        .update({ last_active: new Date().toISOString() })
        .eq('principal_id', principalId);
    }
  },
};

/* ── Security Policies ──────────────────────────────────────────────────── */

export const policiesDB = {
  async getAll(): Promise<any[]> {
    const client = sb();
    if (client) {
      const { data } = await client.from('security_policies')
        .select('*').order('created_at', { ascending: false });
      return data ?? [];
    }
    return [];
  },

  async add(policy: any): Promise<void> {
    const client = sb();
    if (client) {
      const principalId = await ensureProfile();
      const { error } = await client.from('security_policies').insert({
        name: policy.name,
        description: policy.description,
        type: policy.type,
        severity: policy.severity,
        enforcement: policy.enforcement,
        enabled: policy.enabled,
        config: policy.config || {},
        created_by: policy.created_by || policy.createdBy || principalId || 'system',
      });
      if (error) console.error('[SB] policy add:', error.code, error.message);
    }
  },

  async toggle(id: string, enabled: boolean): Promise<void> {
    const client = sb();
    if (client) {
      await client.from('security_policies').update({ enabled }).eq('id', id);
    }
  },
};

/* ── Help Requests ──────────────────────────────────────────────────────── */

export const helpDB = {
  async add(req: {
    subject: string; message: string; category: string; priority: string;
    requester_id: string; requester_email: string; requester_name: string;
  }): Promise<void> {
    const client = sb();
    if (client) {
      await ensureProfile();
      const { error } = await client.from('help_requests').insert(req);
      if (error) console.error('[SB] help add:', error.code, error.message);
    }
  },

  async getAll(): Promise<any[]> {
    const client = sb();
    if (client) {
      const { data } = await client.from('help_requests')
        .select('*').order('created_at', { ascending: false });
      return data ?? [];
    }
    return [];
  },

  async updateStatus(id: string, status: string, adminNotes?: string): Promise<void> {
    const client = sb();
    if (client) {
      const update: any = { status };
      if (adminNotes) update.admin_notes = adminNotes;
      if (status === 'resolved') update.resolved_at = new Date().toISOString();
      await client.from('help_requests').update(update).eq('id', id);
    }
  },
};
