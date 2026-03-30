import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { sessionStorage_, userRegistry, roleRegistry } from '../lib/storage';
import type { UserRole, SessionData } from '../lib/storage';
import { authenticatePasskey } from '../lib/webauthn';

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
    setIdentity({ getPrincipal: () => ({ toText: () => principalId }) });
    setSession(s);
    setLoginStatus('logged-in');
  }, []);

  /**
   * Primary login function — checks if email is a returning user.
   * If yes: auto-login with saved role (optionally via passkey).
   * If no:  shows role selection for new-user onboarding.
   */
  const loginWithEmail = useCallback(async (email: string, usePasskey = false) => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) return;
    setLoginStatus('logging-in');

    const existing = roleRegistry.get(trimmed);

    if (existing) {
      // Returning user — attempt passkey authentication if requested
      if (usePasskey) {
        const passkeyKey = `nexus-passkeys-${existing.principalId}`;
        const passkeys = (() => {
          try { return JSON.parse(localStorage.getItem(passkeyKey) ?? '[]'); } catch { return []; }
        })();

        if (passkeys.length > 0) {
          try {
            const result = await authenticatePasskey(undefined, existing.principalId);
            if (result) {
              selectRole(existing.role, existing.name, trimmed, existing.tier);
              return;
            }
          } catch {
            // WebAuthn cancelled or hardware not available — fall through to password-less auto-login
          }
        }
      }

      // Auto-restore session with saved role (no role selection screen)
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
    setIdentity(null);
    setSession(null);
    setPendingEmail('');
    setLoginStatus('idle');
    sessionStorage_.clear();
  }, []);

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
