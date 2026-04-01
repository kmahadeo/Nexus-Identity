-- Nexus Identity — Supabase Database Schema
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New Query)
--
-- This creates all tables with Row-Level Security (RLS) policies
-- so each user can only access their own data.

-- ============================================================
-- 1. USERS / PROFILES
-- ============================================================

CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  principal_id TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  first_name TEXT DEFAULT '',
  last_name TEXT DEFAULT '',
  alias TEXT DEFAULT '',
  role TEXT NOT NULL DEFAULT 'individual' CHECK (role IN ('admin', 'individual', 'team', 'contractor', 'guest')),
  tier TEXT NOT NULL DEFAULT 'individual' CHECK (tier IN ('individual', 'smb', 'enterprise')),
  avatar_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  mfa_enabled BOOLEAN NOT NULL DEFAULT false,
  passkeys_count INTEGER NOT NULL DEFAULT 0,
  vault_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Users can read their own profile; admins can read all
CREATE POLICY "Users read own profile" ON public.profiles
  FOR SELECT USING (
    principal_id = current_setting('app.current_principal_id', true)
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.principal_id = current_setting('app.current_principal_id', true)
      AND p.role = 'admin'
    )
  );

-- Users can update their own profile
CREATE POLICY "Users update own profile" ON public.profiles
  FOR UPDATE USING (principal_id = current_setting('app.current_principal_id', true));

-- Any authenticated user can insert (registration)
CREATE POLICY "Users can register" ON public.profiles
  FOR INSERT WITH CHECK (true);

-- ============================================================
-- 2. VAULT ENTRIES
-- ============================================================

CREATE TABLE IF NOT EXISTS public.vault_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id TEXT NOT NULL REFERENCES public.profiles(principal_id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  title TEXT DEFAULT '',
  username TEXT DEFAULT '',
  encrypted_password TEXT DEFAULT '',  -- AES-256-GCM encrypted
  encrypted_data TEXT DEFAULT '',      -- PQC-tagged encrypted payload
  url TEXT DEFAULT '',
  category TEXT NOT NULL DEFAULT 'password',
  tags TEXT[] DEFAULT '{}',
  notes TEXT DEFAULT '',
  algorithm_id TEXT DEFAULT 'aes-256-gcm-v1',  -- crypto agility
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.vault_entries ENABLE ROW LEVEL SECURITY;

-- Users can only access their own vault entries
CREATE POLICY "Users access own vault" ON public.vault_entries
  FOR ALL USING (owner_id = current_setting('app.current_principal_id', true));

-- ============================================================
-- 3. PASSKEYS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.passkeys (
  id TEXT PRIMARY KEY,  -- credential ID (base64url)
  owner_id TEXT NOT NULL REFERENCES public.profiles(principal_id) ON DELETE CASCADE,
  raw_id TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'platform' CHECK (type IN ('platform', 'cross-platform')),
  name TEXT NOT NULL DEFAULT 'Passkey',
  user_handle TEXT DEFAULT '',
  aaguid TEXT,
  sign_count INTEGER NOT NULL DEFAULT 0,
  transports TEXT[] DEFAULT '{}',
  algorithm INTEGER NOT NULL DEFAULT -7,
  rp_id TEXT NOT NULL DEFAULT 'localhost',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.passkeys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users access own passkeys" ON public.passkeys
  FOR ALL USING (owner_id = current_setting('app.current_principal_id', true));

-- ============================================================
-- 4. TEAMS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES public.profiles(principal_id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  principal_id TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'view' CHECK (role IN ('view', 'edit', 'owner')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

-- Team members can see their own teams
CREATE POLICY "Team members see own teams" ON public.teams
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.team_id = teams.id
      AND tm.principal_id = current_setting('app.current_principal_id', true)
    )
    OR created_by = current_setting('app.current_principal_id', true)
  );

CREATE POLICY "Users create teams" ON public.teams
  FOR INSERT WITH CHECK (created_by = current_setting('app.current_principal_id', true));

CREATE POLICY "Team owners manage teams" ON public.teams
  FOR UPDATE USING (created_by = current_setting('app.current_principal_id', true));

CREATE POLICY "Team owners delete teams" ON public.teams
  FOR DELETE USING (created_by = current_setting('app.current_principal_id', true));

CREATE POLICY "Team members access" ON public.team_members
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.teams t
      WHERE t.id = team_members.team_id
      AND (t.created_by = current_setting('app.current_principal_id', true)
           OR team_members.principal_id = current_setting('app.current_principal_id', true))
    )
  );

-- ============================================================
-- 5. SHARED VAULT ENTRIES
-- ============================================================

CREATE TABLE IF NOT EXISTS public.shared_vault_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id UUID NOT NULL REFERENCES public.vault_entries(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  shared_by TEXT NOT NULL REFERENCES public.profiles(principal_id),
  permissions TEXT[] NOT NULL DEFAULT '{view}',
  shared_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.shared_vault_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Shared entries visible to team" ON public.shared_vault_entries
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.team_id = shared_vault_entries.team_id
      AND tm.principal_id = current_setting('app.current_principal_id', true)
    )
  );

-- ============================================================
-- 6. SECURITY POLICIES
-- ============================================================

CREATE TABLE IF NOT EXISTS public.security_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  type TEXT NOT NULL DEFAULT 'password' CHECK (type IN ('password', 'mfa', 'session', 'vault', 'access', 'compliance')),
  severity TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  enforcement TEXT NOT NULL DEFAULT 'warn' CHECK (enforcement IN ('advisory', 'warn', 'block')),
  enabled BOOLEAN NOT NULL DEFAULT true,
  config JSONB DEFAULT '{}',
  created_by TEXT NOT NULL REFERENCES public.profiles(principal_id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_modified TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.security_policies ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read policies; only admins can write
CREATE POLICY "All users read policies" ON public.security_policies
  FOR SELECT USING (true);

CREATE POLICY "Admins manage policies" ON public.security_policies
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.principal_id = current_setting('app.current_principal_id', true)
      AND p.role = 'admin'
    )
  );

-- ============================================================
-- 7. AUDIT LOG
-- ============================================================

CREATE TABLE IF NOT EXISTS public.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  actor_email TEXT DEFAULT '',
  actor_role TEXT DEFAULT '',
  resource_id TEXT,
  resource_type TEXT,
  details TEXT DEFAULT '',
  ip_address TEXT DEFAULT '0.0.0.0',
  result TEXT NOT NULL DEFAULT 'success' CHECK (result IN ('success', 'denied', 'error')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- Admins can read all audit logs; users can read their own actions
CREATE POLICY "Audit log read access" ON public.audit_log
  FOR SELECT USING (
    actor_id = current_setting('app.current_principal_id', true)
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.principal_id = current_setting('app.current_principal_id', true)
      AND p.role = 'admin'
    )
  );

-- Anyone can insert audit events (the system logs actions)
CREATE POLICY "Audit log insert" ON public.audit_log
  FOR INSERT WITH CHECK (true);

-- ============================================================
-- 8. HARDWARE KEYS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.hardware_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model TEXT NOT NULL DEFAULT 'Hardware Security Key',
  manufacturer TEXT NOT NULL DEFAULT 'other',
  serial_number TEXT DEFAULT '',
  aaguid TEXT,
  credential_id TEXT,
  assigned_to TEXT REFERENCES public.profiles(principal_id),
  assigned_to_name TEXT DEFAULT '',
  assigned_to_email TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'lost', 'revoked')),
  firmware TEXT,
  protocols TEXT[] DEFAULT '{fido2,u2f}',
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ,
  status_changed_at TIMESTAMPTZ
);

ALTER TABLE public.hardware_keys ENABLE ROW LEVEL SECURITY;

-- Admins manage hardware keys; users see their own
CREATE POLICY "Hardware key access" ON public.hardware_keys
  FOR ALL USING (
    assigned_to = current_setting('app.current_principal_id', true)
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.principal_id = current_setting('app.current_principal_id', true)
      AND p.role = 'admin'
    )
  );

-- ============================================================
-- 9. TOTP CREDENTIALS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.totp_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id TEXT NOT NULL REFERENCES public.profiles(principal_id) ON DELETE CASCADE,
  label TEXT NOT NULL DEFAULT 'Authenticator',
  app TEXT NOT NULL DEFAULT 'google',
  secret TEXT NOT NULL,  -- base32 encoded
  verified BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.totp_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users access own TOTP" ON public.totp_credentials
  FOR ALL USING (owner_id = current_setting('app.current_principal_id', true));

-- ============================================================
-- 10. HELP REQUESTS / SUPPORT TICKETS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.help_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'other',
  priority TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  requester_id TEXT NOT NULL REFERENCES public.profiles(principal_id),
  requester_email TEXT DEFAULT '',
  requester_name TEXT DEFAULT '',
  admin_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

ALTER TABLE public.help_requests ENABLE ROW LEVEL SECURITY;

-- Users see own tickets; admins see all
CREATE POLICY "Help request access" ON public.help_requests
  FOR SELECT USING (
    requester_id = current_setting('app.current_principal_id', true)
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.principal_id = current_setting('app.current_principal_id', true)
      AND p.role = 'admin'
    )
  );

CREATE POLICY "Users create tickets" ON public.help_requests
  FOR INSERT WITH CHECK (requester_id = current_setting('app.current_principal_id', true));

CREATE POLICY "Admins manage tickets" ON public.help_requests
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.principal_id = current_setting('app.current_principal_id', true)
      AND p.role = 'admin'
    )
  );

-- ============================================================
-- 11. DIRECTORY CONNECTIONS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.directory_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('entra_id', 'okta', 'duo', 'workday', 'google_workspace', 'custom_scim')),
  status TEXT NOT NULL DEFAULT 'disconnected',
  tenant_url TEXT DEFAULT '',
  client_id TEXT DEFAULT '',
  has_secret BOOLEAN NOT NULL DEFAULT false,
  sync_interval INTEGER NOT NULL DEFAULT 30,
  sync_direction TEXT NOT NULL DEFAULT 'inbound',
  attribute_mapping JSONB DEFAULT '[]',
  last_sync_at TIMESTAMPTZ,
  last_sync_result TEXT,
  last_sync_count INTEGER DEFAULT 0,
  total_users INTEGER DEFAULT 0,
  total_groups INTEGER DEFAULT 0,
  created_by TEXT NOT NULL REFERENCES public.profiles(principal_id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.directory_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage directories" ON public.directory_connections
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.principal_id = current_setting('app.current_principal_id', true)
      AND p.role = 'admin'
    )
  );

-- ============================================================
-- 12. ACTIVE SESSIONS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.active_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  principal_id TEXT NOT NULL REFERENCES public.profiles(principal_id) ON DELETE CASCADE,
  name TEXT DEFAULT '',
  email TEXT DEFAULT '',
  device TEXT DEFAULT '',
  ip_address TEXT DEFAULT '0.0.0.0',
  login_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_active TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.active_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Session access" ON public.active_sessions
  FOR ALL USING (
    principal_id = current_setting('app.current_principal_id', true)
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.principal_id = current_setting('app.current_principal_id', true)
      AND p.role = 'admin'
    )
  );

-- ============================================================
-- INDEXES for performance
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_vault_owner ON public.vault_entries(owner_id);
CREATE INDEX IF NOT EXISTS idx_passkeys_owner ON public.passkeys(owner_id);
CREATE INDEX IF NOT EXISTS idx_team_members_principal ON public.team_members(principal_id);
CREATE INDEX IF NOT EXISTS idx_team_members_team ON public.team_members(team_id);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON public.audit_log(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON public.audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_hw_keys_assigned ON public.hardware_keys(assigned_to);
CREATE INDEX IF NOT EXISTS idx_totp_owner ON public.totp_credentials(owner_id);
CREATE INDEX IF NOT EXISTS idx_sessions_principal ON public.active_sessions(principal_id);
CREATE INDEX IF NOT EXISTS idx_help_requester ON public.help_requests(requester_id);
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);

-- ============================================================
-- Updated_at trigger function
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER vault_entries_updated_at BEFORE UPDATE ON public.vault_entries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER teams_updated_at BEFORE UPDATE ON public.teams
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER policies_last_modified BEFORE UPDATE ON public.security_policies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER help_requests_updated_at BEFORE UPDATE ON public.help_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
