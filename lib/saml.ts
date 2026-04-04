/**
 * lib/saml.ts — SAML 2.0 Service Provider (SP) Library
 *
 * Implements the SAML 2.0 SP-Initiated SSO flow for enterprise IdP integration.
 * The AuthnRequest is built in the browser (XML + DEFLATE + base64url) and sent via
 * HTTP-Redirect binding. The SAML Response is received by the Cloudflare Pages
 * Function at /saml/acs via HTTP-POST binding.
 *
 * Compatible with Okta, Microsoft Entra ID, Google Workspace, Ping Identity, OneLogin, etc.
 */

import { getSupabase } from './supabase';
import { logError, logInfo, logWarn } from './logger';

/* ── Types ───────────────────────────────────────────────────────────────── */

export interface SAMLConfig {
  /** Unique identifier for this configuration */
  id: string;
  /** Human-readable name (e.g., "Okta Production", "Entra ID") */
  name: string;
  /** Our SP entity ID (e.g., "https://nexus-identity.pages.dev") */
  entityId: string;
  /** Assertion Consumer Service URL — where the IdP POSTs the SAML Response */
  acsUrl: string;
  /** Single Logout URL */
  sloUrl: string;
  /** IdP entity ID */
  idpEntityId: string;
  /** IdP SSO endpoint (HTTP-Redirect) */
  idpSSOUrl: string;
  /** IdP X.509 certificate (PEM-encoded, for signature verification) */
  idpCertificate: string;
  /** NameID format — usually email */
  nameIdFormat: SAMLNameIdFormat;
  /** Whether to sign AuthnRequests (requires SP private key) */
  signRequests: boolean;
  /** When this config was created */
  createdAt: string;
  /** When this config was last modified */
  updatedAt: string;
}

export type SAMLNameIdFormat =
  | 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress'
  | 'urn:oasis:names:tc:SAML:1.1:nameid-format:unspecified'
  | 'urn:oasis:names:tc:SAML:2.0:nameid-format:persistent'
  | 'urn:oasis:names:tc:SAML:2.0:nameid-format:transient';

export interface SAMLUser {
  nameId: string;
  email: string;
  name: string;
  attributes: Record<string, string>;
  sessionIndex: string;
  configId: string;
}

/* ── Constants ───────────────────────────────────────────────────────────── */

const SAML_STORAGE_KEY = 'nexus-saml-configs';
const SAML_PENDING_KEY = 'nexus-saml-pending';

const SAML_NS = 'urn:oasis:names:tc:SAML:2.0:assertion';
const SAMLP_NS = 'urn:oasis:names:tc:SAML:2.0:protocol';

/* ── CRUD — localStorage + optional Supabase sync ────────────────────── */

/** Get all stored SAML configurations. */
export function getSAMLConfigs(): SAMLConfig[] {
  try {
    const raw = localStorage.getItem(SAML_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/** Get a single SAML config by ID. */
export function getSAMLConfig(id: string): SAMLConfig | undefined {
  return getSAMLConfigs().find(c => c.id === id);
}

/** Save (create or update) a SAML configuration. */
export function saveSAMLConfig(config: SAMLConfig): void {
  const configs = getSAMLConfigs();
  const idx = configs.findIndex(c => c.id === config.id);
  const now = new Date().toISOString();

  if (idx >= 0) {
    configs[idx] = { ...config, updatedAt: now };
  } else {
    configs.push({ ...config, createdAt: config.createdAt || now, updatedAt: now });
  }

  localStorage.setItem(SAML_STORAGE_KEY, JSON.stringify(configs));

  // Async sync to Supabase (fire-and-forget)
  syncToSupabase(configs);
}

/** Delete a SAML configuration by ID. */
export function deleteSAMLConfig(id: string): void {
  const configs = getSAMLConfigs().filter(c => c.id !== id);
  localStorage.setItem(SAML_STORAGE_KEY, JSON.stringify(configs));
  syncToSupabase(configs);
}

/** Generate a new config ID. */
export function generateConfigId(): string {
  return `saml_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Create a blank config with sensible defaults. */
export function createDefaultConfig(): SAMLConfig {
  const origin = window.location.origin;
  return {
    id: generateConfigId(),
    name: '',
    entityId: origin,
    acsUrl: `${origin}/saml/acs`,
    sloUrl: `${origin}/saml/slo`,
    idpEntityId: '',
    idpSSOUrl: '',
    idpCertificate: '',
    nameIdFormat: 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
    signRequests: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/* ── Supabase Sync (optional) ────────────────────────────────────────── */

async function syncToSupabase(configs: SAMLConfig[]): Promise<void> {
  try {
    const sb = getSupabase();
    if (!sb) return;
    // Store as a JSON blob under the user's tenant
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return;
    await sb.from('saml_configs').upsert({
      user_id: user.id,
      configs: JSON.stringify(configs),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });
  } catch (err) {
    logWarn('[SAML] Supabase sync failed (non-critical):', String(err));
  }
}

/* ── SP Metadata XML Generation ──────────────────────────────────────── */

/**
 * Generate the SAML 2.0 SP metadata XML document.
 * Admins download this and upload it to their IdP (Okta, Entra ID, etc.).
 */
export function generateSPMetadataXML(config: SAMLConfig): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata"
                     entityID="${escapeXml(config.entityId)}">
  <md:SPSSODescriptor AuthnRequestsSigned="${config.signRequests}"
                      WantAssertionsSigned="true"
                      protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <md:NameIDFormat>${escapeXml(config.nameIdFormat)}</md:NameIDFormat>
    <md:AssertionConsumerService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"
                                Location="${escapeXml(config.acsUrl)}"
                                index="0"
                                isDefault="true" />
    <md:SingleLogoutService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect"
                            Location="${escapeXml(config.sloUrl)}" />
  </md:SPSSODescriptor>
  <md:Organization>
    <md:OrganizationName xml:lang="en">Nexus Identity</md:OrganizationName>
    <md:OrganizationDisplayName xml:lang="en">Nexus Identity Platform</md:OrganizationDisplayName>
    <md:OrganizationURL xml:lang="en">${escapeXml(config.entityId)}</md:OrganizationURL>
  </md:Organization>
</md:EntityDescriptor>`;
}

/** Download SP metadata as an XML file. */
export function downloadSPMetadata(config: SAMLConfig): void {
  const xml = generateSPMetadataXML(config);
  const blob = new Blob([xml], { type: 'application/xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `sp-metadata-${config.name.replace(/\s+/g, '-').toLowerCase() || 'nexus'}.xml`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* ── AuthnRequest Builder ────────────────────────────────────────────── */

/**
 * Build a SAML 2.0 AuthnRequest XML document.
 * This is the request we send to the IdP via HTTP-Redirect binding.
 */
export function buildAuthnRequest(config: SAMLConfig): string {
  const id = `_${generateRequestId()}`;
  const issueInstant = new Date().toISOString();

  return `<samlp:AuthnRequest xmlns:samlp="${SAMLP_NS}"
                    xmlns:saml="${SAML_NS}"
                    ID="${id}"
                    Version="2.0"
                    IssueInstant="${issueInstant}"
                    Destination="${escapeXml(config.idpSSOUrl)}"
                    AssertionConsumerServiceURL="${escapeXml(config.acsUrl)}"
                    ProtocolBinding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST">
  <saml:Issuer>${escapeXml(config.entityId)}</saml:Issuer>
  <samlp:NameIDPolicy Format="${escapeXml(config.nameIdFormat)}"
                      AllowCreate="true" />
</samlp:AuthnRequest>`;
}

/* ── DEFLATE + Base64url encoding ────────────────────────────────────── */

/**
 * DEFLATE compress and base64url-encode an XML string.
 * Uses the raw DEFLATE algorithm (no zlib/gzip headers) as required by SAML HTTP-Redirect binding.
 * Falls back to base64-only if CompressionStream is unavailable.
 */
export async function deflateAndEncode(xml: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(xml);

  // Use the Web Compression API (available in modern browsers + Cloudflare Workers)
  if (typeof CompressionStream !== 'undefined') {
    try {
      const cs = new CompressionStream('deflate-raw');
      const writer = cs.writable.getWriter();
      writer.write(data);
      writer.close();

      const reader = cs.readable.getReader();
      const chunks: Uint8Array[] = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }

      const totalLength = chunks.reduce((acc, c) => acc + c.length, 0);
      const compressed = new Uint8Array(totalLength);
      let offset = 0;
      for (const chunk of chunks) {
        compressed.set(chunk, offset);
        offset += chunk.length;
      }

      return base64UrlEncode(compressed);
    } catch (err) {
      logWarn('[SAML] CompressionStream failed, falling back to uncompressed:', String(err));
    }
  }

  // Fallback: base64-encode without compression (some IdPs accept this)
  logWarn('[SAML] CompressionStream not available — sending uncompressed AuthnRequest');
  return base64UrlEncode(data);
}

/* ── Initiate SAML Login ─────────────────────────────────────────────── */

/**
 * Initiate a SAML SSO login flow.
 * Builds the AuthnRequest, DEFLATE-encodes it, and redirects to the IdP.
 */
export async function initiateSAMLLogin(configId: string): Promise<void> {
  const config = getSAMLConfig(configId);
  if (!config) {
    logError('[SAML] Config not found:', configId);
    throw new Error('SAML configuration not found');
  }

  if (!config.idpSSOUrl) {
    throw new Error('IdP SSO URL is not configured');
  }

  // Save pending state for validation on response
  const requestId = `_${generateRequestId()}`;
  localStorage.setItem(SAML_PENDING_KEY, JSON.stringify({
    configId,
    requestId,
    startedAt: Date.now(),
  }));

  logInfo('[SAML] Initiating SSO login via', config.name, '→', config.idpSSOUrl);

  // Build and encode the AuthnRequest
  const authnRequest = buildAuthnRequest(config);
  const encoded = await deflateAndEncode(authnRequest);

  // Build the redirect URL with the SAMLRequest query parameter
  const url = new URL(config.idpSSOUrl);
  url.searchParams.set('SAMLRequest', encoded);
  // RelayState can carry the return URL
  url.searchParams.set('RelayState', window.location.origin);

  // Redirect to the IdP
  window.location.href = url.toString();
}

/** Get and clear the pending SAML request state. */
export function consumeSAMLPending(): { configId: string; requestId: string; startedAt: number } | null {
  try {
    const raw = localStorage.getItem(SAML_PENDING_KEY);
    if (!raw) return null;
    localStorage.removeItem(SAML_PENDING_KEY);
    const pending = JSON.parse(raw);
    // Expire after 10 minutes
    if (Date.now() - pending.startedAt > 10 * 60 * 1000) {
      logWarn('[SAML] Pending request expired');
      return null;
    }
    return pending;
  } catch {
    return null;
  }
}

/** Parse a SAML user from the URL fragment (set by the ACS worker). */
export function parseSAMLUserFromFragment(): SAMLUser | null {
  try {
    const hash = window.location.hash;
    if (!hash || !hash.includes('saml_user=')) return null;

    const params = new URLSearchParams(hash.slice(1));
    const encoded = params.get('saml_user');
    if (!encoded) return null;

    const json = atob(encoded);
    const user = JSON.parse(json) as SAMLUser;

    // Clean up the fragment
    const otherParams = new URLSearchParams();
    params.forEach((v, k) => { if (k !== 'saml_user') otherParams.set(k, v); });
    const newHash = otherParams.toString();
    window.location.hash = newHash ? `#${newHash}` : '';

    logInfo('[SAML] Parsed user from fragment:', user.email);
    return user;
  } catch (err) {
    logError('[SAML] Failed to parse SAML user from fragment:', String(err));
    return null;
  }
}

/* ── Utilities ───────────────────────────────────────────────────────── */

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function generateRequestId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

function base64UrlEncode(data: Uint8Array): string {
  // Standard base64 encode then URL-encode for query string
  let binary = '';
  for (let i = 0; i < data.length; i++) {
    binary += String.fromCharCode(data[i]);
  }
  return btoa(binary);
}

/**
 * Validate that a SAML config has all required fields for SSO initiation.
 */
export function validateSAMLConfig(config: Partial<SAMLConfig>): string[] {
  const errors: string[] = [];
  if (!config.name?.trim()) errors.push('Connection name is required');
  if (!config.idpEntityId?.trim()) errors.push('IdP Entity ID is required');
  if (!config.idpSSOUrl?.trim()) errors.push('IdP SSO URL is required');
  if (config.idpSSOUrl && !isValidUrl(config.idpSSOUrl)) errors.push('IdP SSO URL must be a valid HTTPS URL');
  if (!config.idpCertificate?.trim()) errors.push('IdP X.509 certificate is required');
  return errors;
}

function isValidUrl(str: string): boolean {
  try {
    const url = new URL(str);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}
