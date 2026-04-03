/**
 * lib/migrateToSupabase.ts — Sync all localStorage data to Supabase.
 *
 * Runs on every login. Checks if data already exists before inserting
 * to avoid duplicates. Uses owner_id + name/email as dedup keys
 * (not localStorage IDs which don't map to Supabase UUIDs).
 */

import { getSupabase, isSupabaseConfigured } from './supabase';

export async function migrateAllToSupabase(): Promise<{ migrated: string[]; errors: string[] }> {
  const migrated: string[] = [];
  const errors: string[] = [];

  if (!isSupabaseConfigured()) return { migrated, errors };

  const client = getSupabase();
  if (!client) return { migrated, errors };

  const session = (() => {
    try { return JSON.parse(localStorage.getItem('nexus-session') ?? 'null'); } catch { return null; }
  })();
  if (!session?.principalId) return { migrated, errors };

  const pid = session.principalId;

  // ── 1. Profile ──
  try {
    const { data: existing } = await client.from('profiles')
      .select('principal_id').eq('principal_id', pid).maybeSingle();
    if (!existing) {
      const nameParts = (session.name || '').split(' ');
      const { error } = await client.from('profiles').insert({
        principal_id: pid, email: session.email, name: session.name,
        first_name: nameParts[0] || '', last_name: nameParts.slice(1).join(' ') || '',
        alias: session.email?.split('@')[0] || '', role: session.role || 'individual',
        tier: session.tier || 'individual', is_active: true, mfa_enabled: false,
        passkeys_count: 0, vault_count: 0,
      });
      if (error) errors.push(`profile: ${error.message}`);
      else migrated.push('profile');
    }

    // Also sync other users from registry
    const registry = JSON.parse(localStorage.getItem('nexus-user-registry') ?? '[]');
    let regCount = 0;
    for (const u of registry) {
      const { data: exists } = await client.from('profiles')
        .select('principal_id').eq('principal_id', u.principalId || u.principal_id).maybeSingle();
      if (!exists && (u.principalId || u.principal_id)) {
        const np = (u.name || '').split(' ');
        await client.from('profiles').insert({
          principal_id: u.principalId || u.principal_id, email: u.email,
          name: u.name, first_name: np[0] || '', last_name: np.slice(1).join(' ') || '',
          alias: u.email?.split('@')[0] || '', role: u.role || 'individual',
          tier: u.tier || 'individual', is_active: u.isActive ?? true,
          mfa_enabled: u.mfaEnabled ?? false, passkeys_count: u.passkeysCount ?? 0,
          vault_count: u.vaultCount ?? 0,
        });
        regCount++;
      }
    }
    if (regCount > 0) migrated.push(`registry: ${regCount}`);
  } catch (e) { errors.push(`profile: ${e}`); }

  // ── 2. Vault entries ──
  try {
    // Get existing vault entries in Supabase for this user
    const { data: existingVault } = await client.from('vault_entries')
      .select('name, owner_id').eq('owner_id', pid);
    const existingNames = new Set((existingVault || []).map((v: any) => `${v.owner_id}:${v.name}`));

    let vaultCount = 0;
    // Check all vault storage keys
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith('nexus-vault')) continue;
      const ownerId = key === 'nexus-vault' ? pid : key.replace('nexus-vault-', '');
      const entries = (() => { try { return JSON.parse(localStorage.getItem(key) ?? '[]'); } catch { return []; } })();

      for (const entry of entries) {
        const dedupKey = `${ownerId}:${entry.name || entry.title || 'Untitled'}`;
        if (existingNames.has(dedupKey)) continue;

        const { error } = await client.from('vault_entries').insert({
          owner_id: ownerId, name: entry.name || entry.title || 'Untitled',
          title: entry.title || '', username: entry.username || '',
          encrypted_password: entry.password || '', encrypted_data: entry.encryptedData || '',
          url: entry.url || '', category: entry.category || 'password',
          tags: entry.tags || [], notes: entry.notes || '',
        });
        if (error) errors.push(`vault ${entry.name}: ${error.message}`);
        else { vaultCount++; existingNames.add(dedupKey); }
      }
    }
    if (vaultCount > 0) migrated.push(`vault: ${vaultCount}`);
  } catch (e) { errors.push(`vault: ${e}`); }

  // ── 3. Passkeys ──
  try {
    const { data: existingPk } = await client.from('passkeys').select('id');
    const existingPkIds = new Set((existingPk || []).map((p: any) => p.id));

    let pkCount = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith('nexus-passkeys-')) continue;
      const ownerId = key.replace('nexus-passkeys-', '');
      const passkeys = (() => { try { return JSON.parse(localStorage.getItem(key) ?? '[]'); } catch { return []; } })();

      for (const pk of passkeys) {
        if (existingPkIds.has(pk.id)) continue;
        const { error } = await client.from('passkeys').insert({
          id: pk.id, owner_id: pk.ownerId || ownerId, raw_id: pk.rawId || pk.id,
          type: pk.type || 'platform', name: pk.name || 'Passkey',
          user_handle: pk.userHandle || '', aaguid: pk.aaguid || null,
          sign_count: pk.signCount || 0, transports: pk.transports || [],
          algorithm: pk.algorithm || -7, rp_id: pk.rpId || 'localhost',
        });
        if (error) errors.push(`passkey ${pk.name}: ${error.message}`);
        else { pkCount++; existingPkIds.add(pk.id); }
      }
    }
    if (pkCount > 0) migrated.push(`passkeys: ${pkCount}`);
  } catch (e) { errors.push(`passkeys: ${e}`); }

  // ── 4. Teams ──
  try {
    const teams = (() => { try { return JSON.parse(localStorage.getItem('nexus-teams') ?? '[]'); } catch { return []; } })();
    const { data: existingTeams } = await client.from('teams').select('id');
    const existingTeamIds = new Set((existingTeams || []).map((t: any) => t.id));

    let teamCount = 0;
    for (const team of teams) {
      if (existingTeamIds.has(team.id)) continue;
      const { error } = await client.from('teams').insert({
        id: team.id, name: team.name, created_by: pid,
      });
      if (error) { errors.push(`team ${team.name}: ${error.message}`); continue; }
      teamCount++;

      for (const member of (team.members || [])) {
        await client.from('team_members').insert({
          team_id: team.id, principal_id: member.principalId || member.principal || 'unknown',
          name: member.name || '', email: member.email || '', role: member.role || 'view',
        });
      }
    }
    if (teamCount > 0) migrated.push(`teams: ${teamCount}`);
  } catch (e) { errors.push(`teams: ${e}`); }

  // ── 5. Policies ──
  try {
    const policies = (() => { try { return JSON.parse(localStorage.getItem('nexus-policies') ?? '[]'); } catch { return []; } })();
    const { data: existingPolicies } = await client.from('security_policies').select('name');
    const existingPolicyNames = new Set((existingPolicies || []).map((p: any) => p.name));

    let polCount = 0;
    for (const p of policies) {
      if (existingPolicyNames.has(p.name)) continue;
      const { error } = await client.from('security_policies').insert({
        name: p.name, description: p.description || '', type: p.type || 'password',
        severity: p.severity || 'medium', enforcement: p.enforcement || 'warn',
        enabled: p.enabled ?? true, config: p.config || {},
        created_by: p.createdBy || pid,
      });
      if (error) errors.push(`policy ${p.name}: ${error.message}`);
      else { polCount++; existingPolicyNames.add(p.name); }
    }
    if (polCount > 0) migrated.push(`policies: ${polCount}`);
  } catch (e) { errors.push(`policies: ${e}`); }

  // ── 6. TOTP ──
  try {
    let totpCount = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith('nexus-totp-credentials-')) continue;
      const ownerId = key.replace('nexus-totp-credentials-', '');
      const creds = (() => { try { return JSON.parse(localStorage.getItem(key) ?? '[]'); } catch { return []; } })();

      const { data: existing } = await client.from('totp_credentials')
        .select('secret').eq('owner_id', ownerId);
      const existingSecrets = new Set((existing || []).map((c: any) => c.secret));

      for (const cred of creds) {
        if (existingSecrets.has(cred.secret)) continue;
        await client.from('totp_credentials').insert({
          owner_id: ownerId, label: cred.label || 'Authenticator',
          app: cred.app || 'google', secret: cred.secret, verified: cred.verified ?? false,
        });
        totpCount++;
      }
    }
    if (totpCount > 0) migrated.push(`totp: ${totpCount}`);
  } catch (e) { errors.push(`totp: ${e}`); }

  // ── 7. Hardware keys ──
  try {
    const keys = (() => { try { return JSON.parse(localStorage.getItem('nexus-hardware-keys') ?? '[]'); } catch { return []; } })();
    const { data: existingHw } = await client.from('hardware_keys').select('serial_number');
    const existingSerials = new Set((existingHw || []).map((k: any) => k.serial_number));

    let hwCount = 0;
    for (const k of keys) {
      if (existingSerials.has(k.serialNumber)) continue;
      await client.from('hardware_keys').insert({
        model: k.model || 'Unknown', manufacturer: k.manufacturer || 'other',
        serial_number: k.serialNumber || '', aaguid: k.aaguid || null,
        credential_id: k.credentialId || null, assigned_to: k.assignedTo || null,
        assigned_to_name: k.assignedToName || '', assigned_to_email: k.assignedToEmail || '',
        status: k.status || 'active', firmware: k.firmware || null,
        protocols: k.protocols || ['fido2', 'u2f'],
      });
      hwCount++;
    }
    if (hwCount > 0) migrated.push(`hw_keys: ${hwCount}`);
  } catch (e) { errors.push(`hw_keys: ${e}`); }

  // ── 8. Help requests ──
  try {
    const requests = (() => { try { return JSON.parse(localStorage.getItem('nexus-help-requests') ?? '[]'); } catch { return []; } })();
    const { data: existingHelp } = await client.from('help_requests')
      .select('subject, requester_id');
    const existingHelpKeys = new Set((existingHelp || []).map((h: any) => `${h.requester_id}:${h.subject}`));

    let helpCount = 0;
    for (const r of requests) {
      const dedupKey = `${r.requesterPrincipalId}:${r.subject}`;
      if (existingHelpKeys.has(dedupKey)) continue;
      await client.from('help_requests').insert({
        subject: r.subject, message: r.message, category: r.category || 'other',
        priority: r.priority || 'medium', status: r.status || 'open',
        requester_id: r.requesterPrincipalId, requester_email: r.requesterEmail || '',
        requester_name: r.requesterName || '', admin_notes: r.adminNotes || null,
      });
      helpCount++;
    }
    if (helpCount > 0) migrated.push(`help: ${helpCount}`);
  } catch (e) { errors.push(`help: ${e}`); }

  // ── 9. Audit log ──
  try {
    const events = (() => { try { return JSON.parse(localStorage.getItem('nexus-audit-log') ?? '[]'); } catch { return []; } })();
    // Only sync recent events (last 50) to avoid flooding
    const recent = events.slice(0, 50);
    let auditCount = 0;
    for (const e of recent) {
      await client.from('audit_log').insert({
        action: e.action, actor_id: e.actor || e.actorId || pid,
        actor_email: e.actorEmail || '', actor_role: e.actorRole || '',
        resource_id: e.resourceId || null, resource_type: e.resourceType || null,
        details: e.details || '', ip_address: e.ipAddress || '127.0.0.1',
        result: e.result || 'success',
      });
      auditCount++;
    }
    if (auditCount > 0) migrated.push(`audit: ${auditCount}`);
  } catch (e) { errors.push(`audit: ${e}`); }

  // ── 10. Directory connections ──
  try {
    const conns = (() => { try { return JSON.parse(localStorage.getItem('nexus-directory-connections') ?? '[]'); } catch { return []; } })();
    const { data: existingConns } = await client.from('directory_connections').select('id');
    const existingConnIds = new Set((existingConns || []).map((c: any) => c.id));

    let connCount = 0;
    for (const c of conns) {
      if (existingConnIds.has(c.id)) continue;
      await client.from('directory_connections').insert({
        id: c.id, name: c.name, provider: c.provider,
        status: c.status || 'disconnected',
        tenant_url: c.config?.tenantUrl || '', client_id: c.config?.clientId || '',
        has_secret: c.config?.hasSecret || false, sync_interval: c.config?.syncInterval || 30,
        sync_direction: c.config?.syncDirection || 'inbound',
        attribute_mapping: c.config?.attributeMapping || [],
        total_users: c.config?.totalUsers || 0, total_groups: c.config?.totalGroups || 0,
        created_by: pid,
      });
      connCount++;
    }
    if (connCount > 0) migrated.push(`directories: ${connCount}`);
  } catch (e) { errors.push(`directories: ${e}`); }

  return { migrated, errors };
}
