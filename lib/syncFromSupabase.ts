/**
 * lib/syncFromSupabase.ts — Pull data FROM Supabase INTO localStorage.
 *
 * Called after login when localStorage is empty (e.g. after clearing cache,
 * new device, or deployed site). Restores the user's data from the database.
 */

import { getSupabase, isSupabaseConfigured } from './supabase';

export async function syncFromSupabase(principalId: string, email: string): Promise<string[]> {
  const restored: string[] = [];

  if (!isSupabaseConfigured()) return restored;
  const client = getSupabase();
  if (!client) return restored;

  // Resolve actual pid by email (might differ from local)
  let pid = principalId;
  const { data: profile } = await client.from('profiles')
    .select('principal_id').eq('email', email.toLowerCase()).maybeSingle();
  if (profile) pid = profile.principal_id;

  // ── Vault entries ──
  try {
    const { data } = await client.from('vault_entries')
      .select('*').eq('owner_id', pid);
    if (data && data.length > 0) {
      const vaultKey = `nexus-vault-${pid}`;
      const existing = (() => { try { return JSON.parse(localStorage.getItem(vaultKey) ?? '[]'); } catch { return []; } })();
      if (existing.length === 0) {
        const entries = data.map(d => ({
          id: d.id, name: d.name, title: d.title || d.name,
          username: d.username || '', password: d.encrypted_password || '',
          url: d.url || '', category: d.category || 'password',
          tags: d.tags || [], notes: d.notes || '',
          encryptedData: d.encrypted_data || '',
          createdAt: BigInt(new Date(d.created_at).getTime()) * 1000000n,
          updatedAt: BigInt(new Date(d.updated_at).getTime()) * 1000000n,
        }));
        localStorage.setItem(vaultKey, JSON.stringify(entries, (_, v) => typeof v === 'bigint' ? `__bi__${v}` : v));
        restored.push(`vault: ${entries.length}`);
      }
    }
  } catch {}

  // ── Passkeys ──
  try {
    const { data } = await client.from('passkeys')
      .select('*').eq('owner_id', pid);
    if (data && data.length > 0) {
      const pkKey = `nexus-passkeys-${pid}`;
      const existing = (() => { try { return JSON.parse(localStorage.getItem(pkKey) ?? '[]'); } catch { return []; } })();
      if (existing.length === 0) {
        const passkeys = data.map(d => ({
          id: d.id, rawId: d.raw_id, type: d.type, name: d.name,
          userHandle: d.user_handle || '', aaguid: d.aaguid || undefined,
          createdAt: new Date(d.created_at).getTime(),
          lastUsedAt: new Date(d.last_used_at).getTime(),
          signCount: d.sign_count || 0, transports: d.transports || [],
          algorithm: d.algorithm || -7, rpId: d.rp_id || 'localhost',
          ownerId: d.owner_id,
        }));
        localStorage.setItem(pkKey, JSON.stringify(passkeys));
        restored.push(`passkeys: ${passkeys.length}`);
      }
    }
  } catch {}

  // ── Security policies ──
  try {
    const { data } = await client.from('security_policies').select('*');
    if (data && data.length > 0) {
      const polKey = 'nexus-policies';
      const existing = (() => { try { return JSON.parse(localStorage.getItem(polKey) ?? '[]'); } catch { return []; } })();
      if (existing.length === 0) {
        const policies = data.map(d => ({
          id: d.id, name: d.name, description: d.description || '',
          type: d.type, severity: d.severity, enforcement: d.enforcement,
          enabled: d.enabled, config: d.config || {},
          createdBy: d.created_by, createdAt: new Date(d.created_at).getTime(),
          lastModified: new Date(d.last_modified).getTime(),
        }));
        localStorage.setItem(polKey, JSON.stringify(policies));
        restored.push(`policies: ${policies.length}`);
      }
    }
  } catch {}

  // ── Teams ──
  try {
    const { data: teams } = await client.from('teams').select('*');
    const { data: members } = await client.from('team_members').select('*');
    if (teams && teams.length > 0) {
      const teamKey = 'nexus-teams';
      const existing = (() => { try { return JSON.parse(localStorage.getItem(teamKey) ?? '[]'); } catch { return []; } })();
      if (existing.length === 0) {
        const teamData = teams.map(t => ({
          id: t.id, name: t.name,
          createdAt: `__bi__${BigInt(new Date(t.created_at).getTime()) * 1000000n}`,
          members: (members || []).filter(m => m.team_id === t.id).map(m => ({
            principalId: m.principal_id, principal: m.principal_id,
            name: m.name, email: m.email, role: m.role,
            joinedAt: `__bi__${BigInt(new Date(m.joined_at).getTime()) * 1000000n}`,
          })),
        }));
        localStorage.setItem(teamKey, JSON.stringify(teamData));
        restored.push(`teams: ${teamData.length}`);
      }
    }
  } catch {}

  // ── Hardware keys ──
  try {
    const { data } = await client.from('hardware_keys').select('*');
    if (data && data.length > 0) {
      const hwKey = 'nexus-hardware-keys';
      const existing = (() => { try { return JSON.parse(localStorage.getItem(hwKey) ?? '[]'); } catch { return []; } })();
      if (existing.length === 0) {
        const keys = data.map(d => ({
          id: d.id, model: d.model, manufacturer: d.manufacturer,
          serialNumber: d.serial_number || '', aaguid: d.aaguid,
          credentialId: d.credential_id, assignedTo: d.assigned_to,
          assignedToName: d.assigned_to_name || '', assignedToEmail: d.assigned_to_email || '',
          status: d.status, firmware: d.firmware, protocols: d.protocols || ['fido2', 'u2f'],
          enrolledAt: new Date(d.enrolled_at).getTime(),
          lastUsedAt: d.last_used_at ? new Date(d.last_used_at).getTime() : null,
        }));
        localStorage.setItem(hwKey, JSON.stringify(keys));
        restored.push(`hw_keys: ${keys.length}`);
      }
    }
  } catch {}

  // ── TOTP credentials ──
  try {
    const { data } = await client.from('totp_credentials')
      .select('*').eq('owner_id', pid);
    if (data && data.length > 0) {
      const totpKey = `nexus-totp-credentials-${pid}`;
      const existing = (() => { try { return JSON.parse(localStorage.getItem(totpKey) ?? '[]'); } catch { return []; } })();
      if (existing.length === 0) {
        const creds = data.map(d => ({
          id: d.id, label: d.label, app: d.app,
          secret: d.secret, verified: d.verified,
          createdAt: new Date(d.created_at).getTime(),
        }));
        localStorage.setItem(totpKey, JSON.stringify(creds));
        restored.push(`totp: ${creds.length}`);
      }
    }
  } catch {}

  // ── Help requests ──
  try {
    const { data } = await client.from('help_requests').select('*');
    if (data && data.length > 0) {
      const helpKey = 'nexus-help-requests';
      const existing = (() => { try { return JSON.parse(localStorage.getItem(helpKey) ?? '[]'); } catch { return []; } })();
      if (existing.length === 0) {
        const requests = data.map(d => ({
          id: d.id, subject: d.subject, message: d.message,
          category: d.category, priority: d.priority, status: d.status,
          requesterPrincipalId: d.requester_id,
          requesterEmail: d.requester_email || '',
          requesterName: d.requester_name || '',
          adminNotes: d.admin_notes, createdAt: new Date(d.created_at).getTime(),
          updatedAt: new Date(d.updated_at).getTime(),
        }));
        localStorage.setItem(helpKey, JSON.stringify(requests));
        restored.push(`help: ${requests.length}`);
      }
    }
  } catch {}

  // ── User registry ──
  try {
    const { data } = await client.from('profiles').select('*');
    if (data && data.length > 0) {
      const regKey = 'nexus-user-registry';
      const existing = (() => { try { return JSON.parse(localStorage.getItem(regKey) ?? '[]'); } catch { return []; } })();
      if (existing.length === 0) {
        const users = data.map(d => ({
          principalId: d.principal_id, name: d.name, email: d.email,
          role: d.role, tier: d.tier,
          firstLoginAt: new Date(d.created_at).getTime(),
          lastLoginAt: new Date(d.last_login_at).getTime(),
          isActive: d.is_active, mfaEnabled: d.mfa_enabled,
          passkeysCount: d.passkeys_count, vaultCount: d.vault_count,
        }));
        localStorage.setItem(regKey, JSON.stringify(users));
        restored.push(`registry: ${users.length}`);
      }
    }
  } catch {}

  if (restored.length > 0) {
    console.log('[Supabase] Restored from cloud:', restored.join(', '));
  }

  return restored;
}
