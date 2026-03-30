/**
 * lib/oauth.ts — Browser-native OAuth2 PKCE helpers.
 *
 * Implements the full Proof Key for Code Exchange (RFC 7636) flow
 * for Cisco Duo Universal Prompt, Microsoft Entra ID, and Okta —
 * no backend required for PKCE public-client flows.
 */

/* ── PKCE ─────────────────────────────────────────────────────────────────── */

/** Generate a cryptographically random code_verifier (RFC 7636 §4.1). */
export function generateCodeVerifier(): string {
  const arr = new Uint8Array(48);
  crypto.getRandomValues(arr);
  return base64url(arr);
}

/** SHA-256 hash of verifier, base64url-encoded — used as code_challenge. */
export async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return base64url(new Uint8Array(digest));
}

function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/** Generate a random state parameter to prevent CSRF. */
export function generateState(): string {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return base64url(arr);
}

/* ── Session storage for PKCE state ───────────────────────────────────────── */

const PKCE_KEY = 'nexus-oauth-pkce';

interface PKCESession {
  provider: string;
  state: string;
  codeVerifier: string;
  redirectUri: string;
  startedAt: number;
}

export const pkceStorage = {
  save(s: PKCESession) {
    sessionStorage.setItem(PKCE_KEY, JSON.stringify(s));
  },
  get(): PKCESession | null {
    try {
      return JSON.parse(sessionStorage.getItem(PKCE_KEY) ?? 'null');
    } catch { return null; }
  },
  clear() {
    sessionStorage.removeItem(PKCE_KEY);
  },
};

/* ── OAuth2 token response ────────────────────────────────────────────────── */

export interface OAuthTokenResponse {
  access_token?: string;
  id_token?: string;
  token_type?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
}

export interface ConnectorToken {
  provider: string;
  accessToken: string;
  idToken?: string;
  expiresAt: number;
  scope?: string;
  userInfo?: { name?: string; email?: string; sub?: string };
}

/* ── JWT decode (no verification — for display only) ─────────────────────── */

export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded  = payload + '='.repeat((4 - payload.length % 4) % 4);
    return JSON.parse(atob(padded));
  } catch { return null; }
}

/* ── Cisco Duo Universal Prompt ───────────────────────────────────────────── */

export interface DuoConfig {
  apiHostname: string;   // api-XXXXXXXX.duosecurity.com
  clientId: string;      // Integration Key (DI...)
  clientSecret: string;  // Secret Key
}

/**
 * Sign a JWT with HMAC-SHA512 (HS512) using browser-native crypto.subtle.
 * Duo Web SDK v4 requires the authorization request to be a signed JWT
 * passed as the `request` query parameter (JAR — RFC 9101).
 */
async function signDuoJWT(payload: Record<string, unknown>, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const toB64 = (obj: object) => base64url(encoder.encode(JSON.stringify(obj)));

  const header = toB64({ alg: 'HS512', typ: 'JWT' });
  const body   = toB64(payload);
  const signingInput = `${header}.${body}`;

  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-512' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(signingInput));
  return `${signingInput}.${base64url(new Uint8Array(sig))}`;
}

export async function duoInitiateAuth(config: DuoConfig, username?: string): Promise<void> {
  const verifier  = generateCodeVerifier();
  const challenge = await generateCodeChallenge(verifier);
  const state     = generateState();
  const redirectUri = window.location.origin + window.location.pathname;

  pkceStorage.save({ provider: 'duo', state, codeVerifier: verifier, redirectUri, startedAt: Date.now() });

  const now = Math.floor(Date.now() / 1000);
  const jwtPayload: Record<string, unknown> = {
    response_type: 'code',
    client_id: config.clientId,
    redirect_uri: redirectUri,
    scope: 'openid',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    iss: config.clientId,
    aud: `https://${config.apiHostname}`,
    exp: now + 300,
    iat: now,
    nbf: now,
  };
  if (username) jwtPayload.duo_uname = username;

  const request = await signDuoJWT(jwtPayload, config.clientSecret);

  const params = new URLSearchParams({ response_type: 'code', client_id: config.clientId, request });
  window.location.href = `https://${config.apiHostname}/oauth/v1/authorize?${params}`;
}

export async function duoExchangeCode(
  config: DuoConfig,
  code: string,
  codeVerifier: string,
  redirectUri: string,
): Promise<OAuthTokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: config.clientId,
    code_verifier: codeVerifier,
  });

  const credentials = btoa(`${config.clientId}:${config.clientSecret}`);
  const res = await fetch(`https://${config.apiHostname}/oauth/v1/token`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });

  return res.json();
}

/* ── Microsoft Entra ID (Azure AD) ───────────────────────────────────────── */

export interface EntraConfig {
  tenantId: string;  // GUID or 'common'
  clientId: string;  // Application (client) ID
}

export async function entraInitiateAuth(config: EntraConfig): Promise<void> {
  const verifier  = generateCodeVerifier();
  const challenge = await generateCodeChallenge(verifier);
  const state     = generateState();
  const redirectUri = window.location.origin + window.location.pathname;

  pkceStorage.save({ provider: 'entra', state, codeVerifier: verifier, redirectUri, startedAt: Date.now() });

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: config.clientId,
    redirect_uri: redirectUri,
    scope: 'openid profile email User.Read',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    response_mode: 'query',
  });

  window.location.href = `https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/authorize?${params}`;
}

export async function entraExchangeCode(
  config: EntraConfig,
  code: string,
  codeVerifier: string,
  redirectUri: string,
): Promise<OAuthTokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: config.clientId,
    code,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier,
    scope: 'openid profile email User.Read',
  });

  const res = await fetch(`https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  return res.json();
}

/* ── Okta ─────────────────────────────────────────────────────────────────── */

export interface OktaConfig {
  domain: string;       // your-org.okta.com
  clientId: string;
  authServerId?: string; // default: 'default'
}

export async function oktaInitiateAuth(config: OktaConfig): Promise<void> {
  const verifier  = generateCodeVerifier();
  const challenge = await generateCodeChallenge(verifier);
  const state     = generateState();
  const redirectUri = window.location.origin + window.location.pathname;
  const serverId  = config.authServerId || 'default';

  pkceStorage.save({ provider: 'okta', state, codeVerifier: verifier, redirectUri, startedAt: Date.now() });

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: config.clientId,
    redirect_uri: redirectUri,
    scope: 'openid profile email',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });

  window.location.href = `https://${config.domain}/oauth2/${serverId}/v1/authorize?${params}`;
}

export async function oktaExchangeCode(
  config: OktaConfig,
  code: string,
  codeVerifier: string,
  redirectUri: string,
): Promise<OAuthTokenResponse> {
  const serverId = config.authServerId || 'default';
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: config.clientId,
    code,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier,
  });

  const res = await fetch(`https://${config.domain}/oauth2/${serverId}/v1/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
    body: body.toString(),
  });

  return res.json();
}

/* ── Token storage ────────────────────────────────────────────────────────── */

const TOKENS_KEY = 'nexus-oauth-tokens';

export const tokenStorage = {
  getAll(): ConnectorToken[] {
    try { return JSON.parse(localStorage.getItem(TOKENS_KEY) ?? '[]'); } catch { return []; }
  },
  get(provider: string): ConnectorToken | null {
    return tokenStorage.getAll().find(t => t.provider === provider) ?? null;
  },
  save(token: ConnectorToken): void {
    const all = tokenStorage.getAll().filter(t => t.provider !== token.provider);
    try { localStorage.setItem(TOKENS_KEY, JSON.stringify([...all, token])); } catch {}
  },
  remove(provider: string): void {
    try { localStorage.setItem(TOKENS_KEY, JSON.stringify(tokenStorage.getAll().filter(t => t.provider !== provider))); } catch {}
  },
  isValid(provider: string): boolean {
    const t = tokenStorage.get(provider);
    return !!t && t.expiresAt > Date.now();
  },
};
