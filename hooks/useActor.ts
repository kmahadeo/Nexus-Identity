import { useState, useEffect } from 'react';
import { HttpAgent, Actor } from '@dfinity/agent';
import { AuthClient } from '@dfinity/auth-client';
import { idlFactory } from '../src/declarations/backend/backend.did.js';
import type { _SERVICE } from '../src/declarations/backend/backend.did.d.ts';

// Canister IDs — updated by dfx deploy
const BACKEND_CANISTER_ID =
  (import.meta as any).env?.VITE_CANISTER_ID_BACKEND ??
  'bkyz2-fmaaa-aaaaa-qaaaq-cai'; // local default

const II_URL =
  (import.meta as any).env?.VITE_INTERNET_IDENTITY_URL ??
  'http://rdmx6-jaaaa-aaaaa-aaadq-cai.localhost:4943/';

const IS_LOCAL =
  window.location.hostname === 'localhost' ||
  window.location.hostname === '127.0.0.1';

let _authClient: AuthClient | null = null;
let _actor: _SERVICE | null = null;

async function getAuthClient(): Promise<AuthClient> {
  if (!_authClient) {
    _authClient = await AuthClient.create({
      idleOptions: { disableIdle: true },
    });
  }
  return _authClient;
}

async function buildActor(authClient: AuthClient): Promise<_SERVICE> {
  const identity = authClient.getIdentity();
  const agent = await HttpAgent.create({
    identity,
    host: IS_LOCAL ? 'http://127.0.0.1:4943' : 'https://icp-api.io',
  });

  if (IS_LOCAL) {
    // Fetch root key in local dev — never on mainnet
    await agent.fetchRootKey().catch(console.error);
  }

  return Actor.createActor<_SERVICE>(idlFactory, {
    agent,
    canisterId: BACKEND_CANISTER_ID,
  });
}

export interface ActorState {
  actor: _SERVICE | null;
  authClient: AuthClient | null;
  isAuthenticated: boolean;
  isFetching: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
}

export function useActor(): ActorState {
  const [actor, setActor]               = useState<_SERVICE | null>(null);
  const [authClient, setAuthClient]     = useState<AuthClient | null>(null);
  const [isAuthenticated, setIsAuth]    = useState(false);
  const [isFetching, setIsFetching]     = useState(true);

  useEffect(() => {
    (async () => {
      const client = await getAuthClient();
      setAuthClient(client);
      const authed = await client.isAuthenticated();
      if (authed) {
        const a = await buildActor(client);
        _actor = a;
        setActor(a);
        setIsAuth(true);
      }
      setIsFetching(false);
    })();
  }, []);

  const login = async () => {
    const client = await getAuthClient();
    await new Promise<void>((resolve, reject) => {
      client.login({
        identityProvider: II_URL,
        maxTimeToLive: BigInt(7 * 24 * 60 * 60 * 1_000_000_000), // 7 days in ns
        onSuccess: resolve,
        onError: reject,
      });
    });
    const a = await buildActor(client);
    _actor = a;
    setActor(a);
    setAuthClient(client);
    setIsAuth(true);
  };

  const logout = async () => {
    const client = await getAuthClient();
    await client.logout();
    _actor = null;
    setActor(null);
    setIsAuth(false);
  };

  return { actor, authClient, isAuthenticated, isFetching, login, logout };
}

/** Singleton accessor for use outside React (e.g. in mutation functions) */
export function getActor(): _SERVICE | null {
  return _actor;
}
