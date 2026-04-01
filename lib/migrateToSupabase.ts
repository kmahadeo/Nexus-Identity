/**
 * lib/migrateToSupabase.ts — One-time migration of all localStorage data to Supabase.
 *
 * Reads every localStorage key used by Nexus Identity and pushes
 * the data to the corresponding Supabase table. Skips rows that
 * already exist (upsert / conflict handling).
 */

import { getSupabase, isSupabaseConfigured } from './supabase';

export async function migrateAllToSupabase(): Promise<{ migrated: string[]; errors: string[] }> {
  const migrated: string[] = [];
  const errors: string[] = [];

  if (!isSupabaseConfigured()) {
    errors.push('Supabase not configured');
    return { migrated, errors };
  }

  const client = getSupabase();
  if (!client) {
    errors.push('Supabase client unavailable');
    return { migrated, errors };
  }

  console.log('[Migration] Starting localStorage → Supabase migration...');

  // ── 1. Profiles (user registry) ──
  try {
    const registry = JSON.parse(localStorage.getItem('nexus-user-registry') ?? '[]');
    for (const u of registry) {
      const nameParts = (u.name || '').split(' ');
      const { error } = await client.from('profiles').upsert({
        principal_id: u.principalId,
        email: u.email,
        name: u.name,
        first_name: nameParts[0] || '',
        last_name: nameParts.slice(1).join(' ') || '',
        alias: u.email?.split('@')[0] || '',
        role: u.role || 'individual',
        tier: u.tier || 'individual',
        is_active: u.isActive ?? true,
        mfa_enabled: u.mfaEnabled ?? false,
        passkeys_count: u.passkeysCount ?? 0,
        vault_count: u.vaultCount ?? 0,
        last_login_at: u.lastLoginAt ? new Date(u.lastLoginAt).toISOString() : new Date().toISOString(),
      }, { onConflict: 'principal_id' });
      if (error) errors.push(`profile ${u.email}: ${error.message}`);
    }
    if (registry.length > 0) migrated.push(`profiles: ${registry.length}`);
  } catch (e) { errors.push(`profiles: ${e}`); }

  // ── 2. Vault entries (check all nexus-vault-* keys) ──
  try {
    let vaultCount = 0;
    // Try the default vault key first
    const defaultVault = JSON.parse(localStorage.getItem('nexus-vault') ?? '[]');
    for (const entry of defaultVault) {
      const session = JSON.parse(localStorage.getItem('nexus-session') ?? 'null');
      const ownerId = session?.principalId || 'unknown';
      const { error } = await client.from('vault_entries').upsert({
        owner_id: ownerId,
        name: entry.name || entry.title || 'Untitled',
        title: entry.title || entry.name || '',
        username: entry.username || '',
        encrypted_password: entry.password || '',
        encrypted_data: entry.encryptedData || '',
        url: entry.url || '',
        category: entry.category || 'password',
        tags: entry.tags || [],
        notes: entry.notes || '',
        algorithm_id: 'aes-256-gcm-v1',
      }, { onConflict: 'id', ignoreDuplicates: true });
      if (error && !error.message.includes('duplicate')) errors.push(`vault ${entry.name}: ${error.message}`);
      else vaultCount++;
    }

    // Also check per-user vault keys
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith('nexus-vault-') && key !== 'nexus-vault') {
        const principalId = key.replace('nexus-vault-', '');
        const entries = JSON.parse(localStorage.getItem(key) ?? '[]');
        for (const entry of entries) {
          await client.from('vault_entries').upsert({
            owner_id: principalId,
            name: entry.name || entry.title || 'Untitled',
            title: entry.title || '',
            username: entry.username || '',
            encrypted_password: entry.password || '',
            encrypted_data: entry.encryptedData || '',
            url: entry.url || '',
            category: entry.category || 'password',
            tags: entry.tags || [],
            notes: entry.notes || '',
          }, { onConflict: 'id', ignoreDuplicates: true }).catch(() => {});
          vaultCount++;
        }
      }
    }
    if (vaultCount > 0) migrated.push(`vault_entries: ${vaultCount}`);
  } catch (e) { errors.push(`vault: ${e}`); }

  // ── 3. Passkeys (check all nexus-passkeys-* keys) ──
  try {
    let passkeyCount = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith('nexus-passkeys-')) {
        const ownerId = key.replace('nexus-passkeys-', '');
        const passkeys = JSON.parse(localStorage.getItem(key) ?? '[]');
        for (const pk of passkeys) {
          const { error } = await client.from('passkeys').upsert({
            id: pk.id,
            owner_id: pk.ownerId || ownerId,
            raw_id: pk.rawId || pk.id,
            type: pk.type || 'platform',
            name: pk.name || 'Passkey',
            user_handle: pk.userHandle || '',
            aaguid: pk.aaguid || null,
            sign_count: pk.signCount || 0,
            transports: pk.transports || [],
            algorithm: pk.algorithm || -7,
            rp_id: pk.rpId || 'localhost',
          }, { onConflict: 'id' });
          if (error) errors.push(`passkey ${pk.name}: ${error.message}`);
          else passkeyCount++;
        }
      }
    }
    if (passkeyCount > 0) migrated.push(`passkeys: ${passkeyCount}`);
  } catch (e) { errors.push(`passkeys: ${e}`); }

  // ── 4. Teams ──
  try {
    const teams = JSON.parse(localStorage.getItem('nexus-teams') ?? '[]');
    const session = JSON.parse(localStorage.getItem('nexus-session') ?? 'null');
    for (const team of teams) {
      const { error } = await client.from('teams').upsert({
        id: team.id,
        name: team.name,
        created_by: session?.principalId || 'system',
      }, { onConflict: 'id' });
      if (error) errors.push(`team ${team.name}: ${error.message}`);

      // Team members
      for (const member of (team.members || [])) {
        await client.from('team_members').upsert({
          team_id: team.id,
          principal_id: member.principalId || member.principal || 'unknown',
          name: member.name || '',
          email: member.email || '',
          role: member.role || 'view',
        }, { onConflict: 'id', ignoreDuplicates: true }).catch(() => {});
      }
    }
    if (teams.length > 0) migrated.push(`teams: ${teams.length}`);
  } catch (e) { errors.push(`teams: ${e}`); }

  // ── 5. Security policies ──
  try {
    const policies = JSON.parse(localStorage.getItem('nexus-policies') ?? '[]');
    const session = JSON.parse(localStorage.getItem('nexus-session') ?? 'null');
    for (const p of policies) {
      const { error } = await client.from('security_policies').upsert({
        name: p.name,
        description: p.description || '',
        type: p.type || 'password',
        severity: p.severity || 'medium',
        enforcement: p.enforcement || 'warn',
        enabled: p.enabled ?? true,
        config: p.config || {},
        created_by: p.createdBy || session?.principalId || 'system',
      }, { onConflict: 'id', ignoreDuplicates: true });
      if (error) errors.push(`policy ${p.name}: ${error.message}`);
    }
    if (policies.length > 0) migrated.push(`policies: ${policies.length}`);
  } catch (e) { errors.push(`policies: ${e}`); }

  // ── 6. TOTP credentials ──
  try {
    let totpCount = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith('nexus-totp-credentials-')) {
        const ownerId = key.replace('nexus-totp-credentials-', '');
        const creds = JSON.parse(localStorage.getItem(key) ?? '[]');
        for (const cred of creds) {
          await client.from('totp_credentials').upsert({
            owner_id: ownerId,
            label: cred.label || 'Authenticator',
            app: cred.app || 'google',
            secret: cred.secret,
            verified: cred.verified ?? false,
          }, { onConflict: 'id', ignoreDuplicates: true }).catch(() => {});
          totpCount++;
        }
      }
    }
    if (totpCount > 0) migrated.push(`totp: ${totpCount}`);
  } catch (e) { errors.push(`totp: ${e}`); }

  // ── 7. Hardware keys ──
  try {
    const keys = JSON.parse(localStorage.getItem('nexus-hardware-keys') ?? '[]');
    for (const k of keys) {
      await client.from('hardware_keys').upsert({
        model: k.model || 'Unknown',
        manufacturer: k.manufacturer || 'other',
        serial_number: k.serialNumber || '',
        aaguid: k.aaguid || null,
        credential_id: k.credentialId || null,
        assigned_to: k.assignedTo || null,
        assigned_to_name: k.assignedToName || '',
        assigned_to_email: k.assignedToEmail || '',
        status: k.status || 'active',
        firmware: k.firmware || null,
        protocols: k.protocols || ['fido2', 'u2f'],
      }, { onConflict: 'id', ignoreDuplicates: true }).catch(() => {});
    }
    if (keys.length > 0) migrated.push(`hardware_keys: ${keys.length}`);
  } catch (e) { errors.push(`hardware_keys: ${e}`); }

  // ── 8. Help requests ──
  try {
    const requests = JSON.parse(localStorage.getItem('nexus-help-requests') ?? '[]');
    for (const r of requests) {
      await client.from('help_requests').upsert({
        subject: r.subject,
        message: r.message,
        category: r.category || 'other',
        priority: r.priority || 'medium',
        status: r.status || 'open',
        requester_id: r.requesterPrincipalId,
        requester_email: r.requesterEmail || '',
        requester_name: r.requesterName || '',
        admin_notes: r.adminNotes || null,
      }, { onConflict: 'id', ignoreDuplicates: true }).catch(() => {});
    }
    if (requests.length > 0) migrated.push(`help_requests: ${requests.length}`);
  } catch (e) { errors.push(`help_requests: ${e}`); }

  // ── 9. Audit log ──
  try {
    const events = JSON.parse(localStorage.getItem('nexus-audit-log') ?? '[]');
    for (const e of events) {
      await client.from('audit_log').insert({
        action: e.action,
        actor_id: e.actor || e.actorId || 'unknown',
        actor_email: e.actorEmail || '',
        actor_role: e.actorRole || '',
        resource_id: e.resourceId || null,
        resource_type: e.resourceType || null,
        details: e.details || '',
        ip_address: e.ipAddress || '127.0.0.1',
        result: e.result || 'success',
      }).catch(() => {});
    }
    if (events.length > 0) migrated.push(`audit_log: ${events.length}`);
  } catch (e) { errors.push(`audit_log: ${e}`); }

  // ── 10. Directory connections ──
  try {
    const conns = JSON.parse(localStorage.getItem('nexus-directory-connections') ?? '[]');
    const session = JSON.parse(localStorage.getItem('nexus-session') ?? 'null');
    for (const c of conns) {
      await client.from('directory_connections').upsert({
        id: c.id,
        name: c.name,
        provider: c.provider,
        status: c.status || 'disconnected',
        tenant_url: c.config?.tenantUrl || '',
        client_id: c.config?.clientId || '',
        has_secret: c.config?.hasSecret || false,
        sync_interval: c.config?.syncInterval || 30,
        sync_direction: c.config?.syncDirection || 'inbound',
        attribute_mapping: c.config?.attributeMapping || [],
        total_users: c.config?.totalUsers || 0,
        total_groups: c.config?.totalGroups || 0,
        created_by: session?.principalId || 'system',
      }, { onConflict: 'id' }).catch(() => {});
    }
    if (conns.length > 0) migrated.push(`directory_connections: ${conns.length}`);
  } catch (e) { errors.push(`directory_connections: ${e}`); }

  console.log('[Migration] Complete:', migrated, errors.length > 0 ? 'Errors:' : '', errors);
  return { migrated, errors };
}
