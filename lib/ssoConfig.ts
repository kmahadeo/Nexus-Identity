/**
 * lib/ssoConfig.ts — SSO Configuration Hub for Google and Apple OAuth.
 *
 * Central config for social SSO providers (Google, Apple) with PKCE support.
 * Stores configuration in localStorage under `nexus-sso-config`.
 * In DEMO mode, simulates the OAuth flow with a 1.5s delay and returns a mock user profile.
 */

import { generateCodeVerifier, generateCodeChallenge, generateState, pkceStorage } from './oauth';
import { logError, logWarn } from './logger';

/* ── Types ───────────────────────────────────────────────────────────────── */

export interface SSOConfig {
  google: { clientId: string };
  apple: { clientId: string };
  stripe: { publishableKey: string };
}

export interface SSOUserProfile {
  email: string;
  name: string;
  avatar?: string;
  provider: 'google' | 'apple';
  sub: string;
}

// Note: Client IDs are semi-public by design (visible in OAuth redirect URLs).
// OAuth tokens/secrets should be stored server-side when backend is available.

/* ── Storage ─────────────────────────────────────────────────────────────── */

const SSO_CONFIG_KEY = 'nexus-sso-config';

function getConfig(): SSOConfig {
  try {
    return JSON.parse(localStorage.getItem(SSO_CONFIG_KEY) ?? 'null') ?? defaultConfig();
  } catch {
    return defaultConfig();
  }
}

function setConfig(config: SSOConfig): void {
  localStorage.setItem(SSO_CONFIG_KEY, JSON.stringify(config));
}

function defaultConfig(): SSOConfig {
  return {
    google: { clientId: '' },
    apple: { clientId: '' },
    stripe: { publishableKey: '' },
  };
}

/* ── Google ───────────────────────────────────────────────────────────────── */

/** Get the Google OAuth Client ID — checks env var first, then localStorage. */
export function getGoogleConfig(): string {
  // Env var takes priority (baked into build, always available)
  const envClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  if (envClientId) return envClientId;
  // Fall back to localStorage (configured in Settings)
  return getConfig().google.clientId;
}

/** Set the Google OAuth Client ID. */
export function setGoogleConfig(clientId: string): void {
  const cfg = getConfig();
  cfg.google.clientId = clientId.trim();
  setConfig(cfg);
}

/**
 * Initiate Google login using Google Identity Services (GIS).
 *
 * Uses the implicit flow (response_type=token id_token) which works
 * entirely client-side — no client_secret or backend needed.
 *
 * Returns a Promise that resolves with the user profile when the
 * popup/redirect flow completes, or null if cancelled.
 */
export function initiateGoogleLogin(): Promise<SSOUserProfile | null> {
  const clientId = getGoogleConfig();

  if (!clientId) {
    // DEMO mode — no client ID configured
    return Promise.resolve(null);
  }

  // Use the implicit flow — returns id_token directly in the URL fragment
  const state = generateState();
  const nonce = generateState(); // reuse helper for random nonce
  const redirectUri = window.location.origin + window.location.pathname;

  // Save state for verification on callback
  pkceStorage.save({ provider: 'google', state, codeVerifier: nonce, redirectUri, startedAt: Date.now() });

  const params = new URLSearchParams({
    response_type: 'id_token',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: 'openid profile email',
    state,
    nonce,
    prompt: 'select_account',
  });

  window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  return new Promise(() => {}); // page will redirect
}

/* ── Apple ────────────────────────────────────────────────────────────────── */

/** Get the stored Apple Sign In Client ID (Services ID). */
export function getAppleConfig(): string {
  return getConfig().apple.clientId;
}

/** Set the Apple Sign In Client ID. */
export function setAppleConfig(clientId: string): void {
  const cfg = getConfig();
  cfg.apple.clientId = clientId.trim();
  setConfig(cfg);
}

/**
 * Initiate Apple Sign In with PKCE.
 * Redirects to appleid.apple.com/auth/authorize.
 *
 * TODO: Replace placeholder client ID with your Apple Developer Services ID.
 */
export async function initiateAppleLogin(): Promise<void> {
  const clientId = getAppleConfig();

  if (!clientId) {
    // DEMO mode — no client ID configured
    return;
  }

  const verifier = generateCodeVerifier();
  const challenge = await generateCodeChallenge(verifier);
  const state = generateState();
  const redirectUri = window.location.origin + window.location.pathname;

  pkceStorage.save({ provider: 'apple', state, codeVerifier: verifier, redirectUri, startedAt: Date.now() });

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: 'name email',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    response_mode: 'query',
  });

  window.location.href = `https://appleid.apple.com/auth/authorize?${params}`;
}

/* ── OAuth Callback Handler ──────────────────────────────────────────────── */

/**
 * Process the OAuth callback — exchange the authorization code for a token.
 *
 * TODO: This requires a backend endpoint to exchange the code for tokens
 * (Google and Apple both require a server-side token exchange with client_secret).
 * For now this is stubbed — implement `/api/auth/callback` on your backend.
 */
export async function handleOAuthCallback(
  code: string,
  state: string,
): Promise<SSOUserProfile | null> {
  const session = pkceStorage.get();
  if (!session || session.state !== state) {
    logError('[SSO] State mismatch — possible CSRF attack');
    return null;
  }

  const provider = session.provider as 'google' | 'apple';

  // TODO: Send code + codeVerifier to your backend for token exchange:
  // const res = await fetch('/api/auth/callback', {
  //   method: 'POST',
  //   headers: { 'Content-Type': 'application/json' },
  //   body: JSON.stringify({
  //     provider,
  //     code,
  //     codeVerifier: session.codeVerifier,
  //     redirectUri: session.redirectUri,
  //   }),
  // });
  // const { user } = await res.json();
  // pkceStorage.clear();
  // return user;

  // For Google with PKCE public-client flow, we can exchange the code directly
  // from the browser using the token endpoint (no client_secret needed for PKCE).
  if (provider === 'google') {
    const clientId = getGoogleConfig();
    if (clientId) {
      try {
        const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            grant_type: 'authorization_code',
            code,
            redirect_uri: session.redirectUri,
            client_id: clientId,
            code_verifier: session.codeVerifier,
          }),
        });
        const tokenData = await tokenRes.json();
        if (tokenData.error) {
          logError('[SSO] Google token exchange error:', tokenData.error, tokenData.error_description);
          pkceStorage.clear();
          return null;
        }
        // Decode the id_token JWT to get user info (no need to verify sig on client)
        if (tokenData.id_token) {
          const payload = JSON.parse(atob(tokenData.id_token.split('.')[1]));
          pkceStorage.clear();
          return {
            email: payload.email ?? '',
            name: payload.name ?? payload.email?.split('@')[0] ?? 'User',
            avatar: payload.picture,
            provider: 'google',
            sub: payload.sub ?? '',
          };
        }
        // Fallback: use userinfo endpoint
        if (tokenData.access_token) {
          const userRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: { Authorization: `Bearer ${tokenData.access_token}` },
          });
          const user = await userRes.json();
          pkceStorage.clear();
          return {
            email: user.email ?? '',
            name: user.name ?? user.email?.split('@')[0] ?? 'User',
            avatar: user.picture,
            provider: 'google',
            sub: user.sub ?? '',
          };
        }
      } catch (err) {
        logError('[SSO] Google token exchange failed:', err);
      }
    }
  }

  logWarn(`[SSO] Token exchange for ${provider} requires backend configuration`);
  pkceStorage.clear();
  return null;
}

/* ── Stripe Config ───────────────────────────────────────────────────────── */

/** Get the stored Stripe publishable key. */
export function getStripeKey(): string {
  return getConfig().stripe.publishableKey;
}

/** Set the Stripe publishable key. */
export function setStripeKey(publishableKey: string): void {
  const cfg = getConfig();
  cfg.stripe.publishableKey = publishableKey.trim();
  setConfig(cfg);
}

/* ── DEMO Mode Helpers ───────────────────────────────────────────────────── */

/**
 * Simulate Google OAuth login with a 1.5s delay.
 * Returns a mock user profile for demo purposes.
 */
export async function simulateGoogleLogin(): Promise<SSOUserProfile> {
  await new Promise(r => setTimeout(r, 1500));
  return {
    email: 'demo.user@gmail.com',
    name: 'Demo User',
    avatar: undefined,
    provider: 'google',
    sub: 'google-mock-sub-109234871234',
  };
}

/**
 * Simulate Apple Sign In with a 1.5s delay.
 * Returns a mock user profile for demo purposes.
 */
export async function simulateAppleLogin(): Promise<SSOUserProfile> {
  await new Promise(r => setTimeout(r, 1500));
  return {
    email: 'demo.user@icloud.com',
    name: 'Demo User',
    avatar: undefined,
    provider: 'apple',
    sub: 'apple-mock-sub-001234.abcdef.5678',
  };
}

/**
 * Check whether SSO is in demo mode (no real client IDs configured).
 */
export function isDemoMode(): boolean {
  return !getGoogleConfig() && !getAppleConfig();
}
