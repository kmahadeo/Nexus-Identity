import React, { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { AuthClient } from '@dfinity/auth-client';
import type { Identity } from '@dfinity/agent';
import { CANISTER_ID_INTERNET_IDENTITY, IS_LOCAL } from '../config';

type LoginStatus = 'idle' | 'logging-in' | 'logged-in' | 'error';

interface InternetIdentityContextType {
  identity: Identity | null;
  isInitializing: boolean;
  login: () => Promise<void>;
  loginStatus: LoginStatus;
  clear: () => Promise<void>;
  authClient: AuthClient | null;
}

const InternetIdentityContext = createContext<InternetIdentityContextType | null>(null);

const II_URL = IS_LOCAL
  ? `http://${CANISTER_ID_INTERNET_IDENTITY || 'rdmx6-jaaaa-aaaaa-aaadq-cai'}.localhost:4943`
  : 'https://identity.ic0.app';

export function InternetIdentityProvider({ children }: { children: ReactNode }) {
  const [authClient, setAuthClient] = useState<AuthClient | null>(null);
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [loginStatus, setLoginStatus] = useState<LoginStatus>('idle');

  useEffect(() => {
    AuthClient.create().then(async (client) => {
      setAuthClient(client);
      if (await client.isAuthenticated()) {
        const id = client.getIdentity();
        setIdentity(id);
        setLoginStatus('logged-in');
      }
      setIsInitializing(false);
    });
  }, []);

  const login = useCallback(async () => {
    if (!authClient) return;
    setLoginStatus('logging-in');
    try {
      await new Promise<void>((resolve, reject) => {
        authClient.login({
          identityProvider: II_URL,
          maxTimeToLive: BigInt(7 * 24 * 60 * 60 * 1000000000),
          onSuccess: () => {
            const id = authClient.getIdentity();
            setIdentity(id);
            setLoginStatus('logged-in');
            resolve();
          },
          onError: (err) => {
            setLoginStatus('error');
            reject(err);
          },
        });
      });
    } catch {
      setLoginStatus('error');
    }
  }, [authClient]);

  const clear = useCallback(async () => {
    if (!authClient) return;
    await authClient.logout();
    setIdentity(null);
    setLoginStatus('idle');
  }, [authClient]);

  return (
    <InternetIdentityContext.Provider value={{ identity, isInitializing, login, loginStatus, clear, authClient }}>
      {children}
    </InternetIdentityContext.Provider>
  );
}

export function useInternetIdentity() {
  const context = useContext(InternetIdentityContext);
  if (!context) throw new Error('useInternetIdentity must be used within InternetIdentityProvider');
  return context;
}
