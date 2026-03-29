import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { sessionStorage_ } from '../lib/storage';
import type { UserRole, SessionData } from '../lib/storage';

interface Identity {
  getPrincipal(): { toText(): string };
}

type LoginStatus = 'idle' | 'logging-in' | 'selecting-role' | 'logged-in' | 'error';

interface InternetIdentityContextValue {
  identity: Identity | null;
  session: SessionData | null;
  isInitializing: boolean;
  loginStatus: LoginStatus;
  login: () => void;
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

  const login = useCallback(() => {
    setLoginStatus('logging-in');
    // Simulate ICP Internet Identity handshake (1.4s)
    setTimeout(() => {
      setIdentity({ getPrincipal: () => ({ toText: () => 'demo-2vxsx-fae' }) });
      setLoginStatus('selecting-role');
    }, 1400);
  }, []);

  const selectRole = useCallback((
    role: UserRole,
    name: string,
    email: string,
    tier: SessionData['tier'] = 'individual',
  ) => {
    // Each role gets a stable, unique principalId so their data is isolated
    const principalId = `nexus-${role}-${btoa(email).replace(/[^a-z0-9]/gi, '').slice(0, 12)}`;
    const s: SessionData = {
      principalId,
      name,
      email,
      role,
      tier,
      loginAt: Date.now(),
    };
    sessionStorage_.set(s);
    // Register user in the global registry (admins can see this)
    import('../lib/storage').then(({ userRegistry }) => userRegistry.upsert(s));
    setSession(s);
    setLoginStatus('logged-in');
  }, []);

  const clear = useCallback(async () => {
    setIdentity(null);
    setSession(null);
    setLoginStatus('idle');
    sessionStorage_.clear();
  }, []);

  return (
    <InternetIdentityContext.Provider
      value={{ identity, session, isInitializing: false, loginStatus, login, selectRole, clear }}
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
