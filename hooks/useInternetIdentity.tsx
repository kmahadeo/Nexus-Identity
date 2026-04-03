import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from 'react';
import { sessionStorage_, userRegistry, roleRegistry } from '../lib/storage';
import type { UserRole, SessionData } from '../lib/storage';
import { authenticatePasskey } from '../lib/webauthn';
import { activeSessionStorage, type ActiveSession } from '../lib/permissions';
import { profilesDB, sessionsDB, auditDB } from '../lib/supabaseStorage';
import { markVaultVerified } from '../lib/vaultCrypto';
import { migrateAllToSupabase } from '../lib/migrateToSupabase';
import { syncFromSupabase } from '../lib/syncFromSupabase';

interface Identity {
  getPrincipal(): { toText(): string };
}

type LoginStatus = 'idle' | 'logging-in' | 'selecting-role' | 'logged-in' | 'error';

interface InternetIdentityContextValue {
  identity: Identity | null;
  session: SessionData | null;
  isInitializing: boolean;
  loginStatus: LoginStatus;
  pendingEmail: string;
  login: () => void;
  loginWithEmail: (email: string, usePasskey?: boolean) => Promise<void>;
  selectRole: (role: UserRole, name: string, email: string, tier?: SessionData['tier']) => void;
  clear: () => Promise<void>;
}

const InternetIdentityContext = createContext<InternetIdentityContextValue | null>(null);

export function InternetIdentityProvider({ children }: { children: ReactNode }) {
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [loginStatus, setLoginStatus] = useState<LoginStatus>(() =>
    sessionStorage_.get() ? 'logged-in' : 'idle',
  );
  const [session, setSession] = useState<SessionData | null>(() => sessionStorage_.get());
  const [pendingEmail, setPendingEmail] = useState('');

  const selectRole = useCallback((
    role: UserRole,
    name: string,
    email: string,
    tier: SessionData['tier'] = 'individual',
  ) => {
    const principalId = `nexus-${role}-${btoa(email).replace(/[^a-z0-9]/gi, '').slice(0, 12)}`;
    const s: SessionData = { principalId, name, email, role, tier, loginAt: Date.now() };
    sessionStorage_.set(s);
    userRegistry.upsert(s);
    roleRegistry.save({ email, name, role, tier, principalId });

    // Record active session for Session Management Dashboard
    const activeSession: ActiveSession = {
      id: crypto.randomUUID(),
      principalId,
      name,
      email,
      device: navigator.userAgent,
      loginAt: Date.now(),
      lastActive: Date.now(),
      ipAddress: '127.0.0.1',
    };
    activeSessionStorage.add(activeSession);

    // Sync to Supabase — profile must complete before session (FK constraint)
    profilesDB.upsert({
      principal_id: principalId, email, name, role, tier,
      is_active: true, mfa_enabled: false, passkeys_count: 0, vault_count: 0,
    }).then(() => {
      console.log('[Supabase] profile synced, now adding session + audit');
      sessionsDB.add({
        principal_id: principalId, name, email,
        device: navigator.userAgent, ip_address: '127.0.0.1',
      }).catch((e) => console.error('[Supabase] session add failed:', e));
      auditDB.log({
        action: 'auth.login', actor_id: principalId, actor_email: email,
        actor_role: role, details: `Logged in as ${role} (${tier})`, result: 'success',
      }).catch((e) => console.error('[Supabase] audit log failed:', e));
    }).catch((e) => console.error('[Supabase] profile upsert failed:', e));

    // Mark vault as verified for 30 minutes — login IS the verification
    markVaultVerified();

    setIdentity({ getPrincipal: () => ({ toText: () => principalId }) });
    setSession(s);
    setLoginStatus('logged-in');

    // Step 1: Restore data FROM Supabase if localStorage is empty (new device / cache cleared)
    syncFromSupabase(principalId, email).then((restored) => {
      if (restored.length > 0) {
        console.log('[Supabase] Restored from cloud:', restored.join(', '));
      }
    }).catch(() => {});

    // Step 2: Sync localStorage data TO Supabase (pushes any new local data)
    migrateAllToSupabase().then(({ migrated, errors }) => {
      if (migrated.length > 0) console.log('[Supabase] Synced to cloud:', migrated.join(', '));
      if (errors.length > 0) console.error('[Supabase] Sync errors:', errors.join('; '));
    }).catch((e) => console.error('[Supabase] Migration failed:', e));
  }, []);

  /**
   * Primary login function.
   *
   * Returning users:
   *   - If passkeys exist → MUST authenticate with passkey
   *   - If no passkeys → allowed to continue (they'll set up passkeys during onboarding)
   * New users:
   *   - Shown role selection for onboarding
   */
  const loginWithEmail = useCallback(async (email: string, usePasskey = false) => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) return;
    setLoginStatus('logging-in');

    const existing = roleRegistry.get(trimmed);

    if (existing) {
      const passkeyKey = `nexus-passkeys-${existing.principalId}`;
      const passkeys = (() => {
        try { return JSON.parse(localStorage.getItem(passkeyKey) ?? '[]'); } catch { return []; }
      })();

      // If user has passkeys, authenticate with passkey (auto-trigger the prompt)
      if (passkeys.length > 0) {
        try {
          const result = await authenticatePasskey(undefined, existing.principalId);
          if (result) {
            selectRole(existing.role, existing.name, trimmed, existing.tier);
            return;
          }
        } catch {
          // Passkey cancelled or failed — return to idle
          setLoginStatus('idle');
          setPendingEmail(trimmed);
          return;
        }
      }

      // No passkeys registered — allow email-only login for now
      // (they'll be prompted to register passkeys during onboarding)
      setTimeout(() => selectRole(existing.role, existing.name, trimmed, existing.tier), 500);
    } else {
      // New user — present role selection
      setPendingEmail(trimmed);
      setTimeout(() => setLoginStatus('selecting-role'), 500);
    }
  }, [selectRole]);

  /** Legacy login (no email) — goes straight to role selection */
  const login = useCallback(() => {
    setLoginStatus('logging-in');
    setTimeout(() => setLoginStatus('selecting-role'), 1400);
  }, []);

  const clear = useCallback(async () => {
    // Remove active session on logout
    const currentSession = sessionStorage_.get();
    if (currentSession) {
      activeSessionStorage.remove(currentSession.principalId);
      // Sync to Supabase
      sessionsDB.remove(currentSession.principalId).catch(() => {});
      auditDB.log({
        action: 'auth.logout', actor_id: currentSession.principalId,
        actor_email: currentSession.email, actor_role: currentSession.role,
        details: 'User logged out', result: 'success',
      }).catch(() => {});
    }
    setIdentity(null);
    setSession(null);
    setPendingEmail('');
    setLoginStatus('idle');
    sessionStorage_.clear();
  }, []);

  // Periodically update lastActive for the current session (every 60s)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (session) {
      activeSessionStorage.updateLastActive(session.principalId);
      intervalRef.current = setInterval(() => {
        activeSessionStorage.updateLastActive(session.principalId);
      }, 60_000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [session]);

  return (
    <InternetIdentityContext.Provider
      value={{ identity, session, isInitializing: false, loginStatus, pendingEmail, login, loginWithEmail, selectRole, clear }}
    >
      {children}
    </InternetIdentityContext.Provider>
  );
}

export function useInternetIdentity() {
  const ctx = useContext(InternetIdentityContext);
  if (!ctx) throw new Error('useInternetIdentity must be used within InternetIdentityProvider');
  return ctx;
}

export type { UserRole, SessionData };
