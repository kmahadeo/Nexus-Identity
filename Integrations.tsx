import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import {
  Plug, CheckCircle2, AlertCircle, Shield, RefreshCw, Settings,
  ExternalLink, AlertTriangle, Eye, EyeOff, Loader2, LogOut, User,
  Copy, Key, Globe, Lock,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  duoInitiateAuth, duoExchangeCode,
  entraInitiateAuth, entraExchangeCode,
  oktaInitiateAuth, oktaExchangeCode,
  pkceStorage, tokenStorage, decodeJwtPayload,
  type DuoConfig, type EntraConfig, type OktaConfig, type ConnectorToken,
} from './lib/oauth';
import { connectorStorage } from './lib/storage';
import { useInternetIdentity } from './hooks/useInternetIdentity';

/* ── Config storage helpers ──────────────────────────────────────────────── */

const CFG_KEY = 'nexus-idp-configs';

interface StoredConfigs {
  duo?: DuoConfig;
  entra?: EntraConfig;
  okta?: OktaConfig;
}

function loadConfigs(): StoredConfigs {
  try { return JSON.parse(localStorage.getItem(CFG_KEY) ?? '{}'); } catch { return {}; }
}
function saveConfigs(c: StoredConfigs) {
  try { localStorage.setItem(CFG_KEY, JSON.stringify(c)); } catch {}
}

/* ── Utility ─────────────────────────────────────────────────────────────── */

function MaskedInput({ value, onChange, placeholder, label, hint }: {
  value: string; onChange: (v: string) => void;
  placeholder?: string; label: string; hint?: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="space-y-1.5">
      <Label className="text-sm">{label}</Label>
      <div className="relative">
        <Input
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className="glass-effect pr-10 font-mono text-sm"
        />
        <button type="button" onClick={() => setVisible(v => !v)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function TokenBadge({ provider }: { provider: string }) {
  const token = tokenStorage.get(provider);
  const valid = tokenStorage.isValid(provider);
  if (!token) return null;
  return (
    <div className="flex items-center gap-2">
      <div className={`h-2 w-2 rounded-full ${valid ? 'bg-success animate-pulse' : 'bg-destructive'}`} />
      <span className="text-xs text-muted-foreground">
        {valid ? `Active · expires ${new Date(token.expiresAt).toLocaleTimeString()}` : 'Token expired'}
      </span>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════ */
/*  Main component                                                           */
/* ══════════════════════════════════════════════════════════════════════════ */

export default function Integrations() {
  const { session } = useInternetIdentity();
  const [configs, setConfigs] = useState<StoredConfigs>(loadConfigs);
  const [tokens, setTokens] = useState<Record<string, ConnectorToken | null>>({});
  const [processing, setProcessing] = useState(false);
  const [callbackResult, setCallbackResult] = useState<{ provider: string; ok: boolean; user?: ConnectorToken['userInfo'] } | null>(null);

  /* ── Reload token state ── */
  const refreshTokens = useCallback(() => {
    setTokens({
      duo:   tokenStorage.get('duo'),
      entra: tokenStorage.get('entra'),
      okta:  tokenStorage.get('okta'),
    });
  }, []);

  useEffect(() => { refreshTokens(); }, [refreshTokens]);

  /* ── OAuth2 callback handler ── */
  useEffect(() => {
    const url   = new URL(window.location.href);
    const code  = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const error = url.searchParams.get('error');

    if (!code && !error) return;

    const pkce = pkceStorage.get();
    if (!pkce) return;

    // Clean URL immediately
    window.history.replaceState({}, '', window.location.pathname);
    pkceStorage.clear();

    if (error) {
      toast.error(`Authentication cancelled: ${url.searchParams.get('error_description') || error}`);
      return;
    }

    if (state !== pkce.state) {
      toast.error('OAuth2 state mismatch — possible CSRF. Try again.');
      return;
    }

    setProcessing(true);
    const cfg = loadConfigs();

    (async () => {
      try {
        let tokenResp;
        if (pkce.provider === 'duo' && cfg.duo) {
          tokenResp = await duoExchangeCode(cfg.duo, code!, pkce.codeVerifier, pkce.redirectUri);
        } else if (pkce.provider === 'entra' && cfg.entra) {
          tokenResp = await entraExchangeCode(cfg.entra, code!, pkce.codeVerifier, pkce.redirectUri);
        } else if (pkce.provider === 'okta' && cfg.okta) {
          tokenResp = await oktaExchangeCode(cfg.okta, code!, pkce.codeVerifier, pkce.redirectUri);
        } else {
          throw new Error('No matching configuration for provider: ' + pkce.provider);
        }

        if (tokenResp.error || !tokenResp.access_token) {
          throw new Error(tokenResp.error_description || tokenResp.error || 'Token exchange failed');
        }

        // Decode id_token for user info (display only — not signature-verified)
        const idPayload = tokenResp.id_token ? decodeJwtPayload(tokenResp.id_token) : null;
        const userInfo: ConnectorToken['userInfo'] = {
          sub:   String(idPayload?.sub  ?? idPayload?.oid ?? ''),
          name:  String(idPayload?.name ?? idPayload?.preferred_username ?? ''),
          email: String(idPayload?.email ?? idPayload?.upn ?? ''),
        };

        const connToken: ConnectorToken = {
          provider: pkce.provider,
          accessToken: tokenResp.access_token,
          idToken: tokenResp.id_token,
          expiresAt: Date.now() + (tokenResp.expires_in ?? 3600) * 1000,
          scope: tokenResp.scope,
          userInfo,
        };
        tokenStorage.save(connToken);

        // Update connectorStorage status
        const idMap: Record<string, string> = { duo: 'cisco_duo', entra: 'entra_id', okta: 'okta' };
        const cid = idMap[pkce.provider];
        if (cid) {
          connectorStorage.updateStatus(cid as Parameters<typeof connectorStorage.updateStatus>[0], 'connected', {
            connectedAt: Date.now(),
            lastSync: Date.now(),
            syncedUsers: 1,
          });
        }

        setCallbackResult({ provider: pkce.provider, ok: true, user: userInfo });
        refreshTokens();
        toast.success(`${pkce.provider.toUpperCase()} authentication successful`, {
          description: userInfo.email || userInfo.name || 'Authenticated',
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        setCallbackResult({ provider: pkce.provider, ok: false });
        toast.error(`Authentication failed: ${msg}`);
      } finally {
        setProcessing(false);
      }
    })();
  }, []); // run once on mount

  const persist = (updated: StoredConfigs) => { setConfigs(updated); saveConfigs(updated); };

  const disconnect = (provider: string) => {
    tokenStorage.remove(provider);
    refreshTokens();
    const idMap: Record<string, string> = { duo: 'cisco_duo', entra: 'entra_id', okta: 'okta' };
    const cid = idMap[provider];
    if (cid) connectorStorage.updateStatus(cid as Parameters<typeof connectorStorage.updateStatus>[0], 'disconnected');
    toast.success(`${provider} disconnected`);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold mb-2">Integrations</h1>
        <p className="text-muted-foreground">Configure real OAuth2/PKCE connections to Cisco Duo, Microsoft Entra ID, and Okta</p>
      </div>

      {/* Processing overlay */}
      {processing && (
        <Card className="border-primary/40 bg-primary/5 glass-strong">
          <CardContent className="p-5 flex items-center gap-4">
            <Loader2 className="h-6 w-6 text-primary animate-spin shrink-0" />
            <div>
              <p className="font-semibold text-sm">Exchanging authorisation code…</p>
              <p className="text-xs text-muted-foreground">Completing the PKCE token exchange with the identity provider.</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Callback success/failure banner */}
      {callbackResult && (
        <Card className={`border-border/40 glass-strong ${callbackResult.ok ? 'gradient-success' : 'from-destructive/15 to-destructive/5'}`}>
          <CardContent className="p-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              {callbackResult.ok
                ? <CheckCircle2 className="h-5 w-5 text-success shrink-0" />
                : <AlertCircle className="h-5 w-5 text-destructive shrink-0" />}
              <div>
                <p className="font-semibold text-sm">
                  {callbackResult.ok
                    ? `${callbackResult.provider.toUpperCase()} connected successfully`
                    : `${callbackResult.provider.toUpperCase()} authentication failed`}
                </p>
                {callbackResult.ok && callbackResult.user?.email && (
                  <p className="text-xs text-muted-foreground">{callbackResult.user.name} · {callbackResult.user.email}</p>
                )}
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setCallbackResult(null)} className="rounded-full shrink-0">✕</Button>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="duo" className="space-y-6">
        <TabsList className="glass-effect border border-border/40">
          <TabsTrigger value="duo" className="flex items-center gap-2">
            <Shield className="h-4 w-4" />Cisco Duo
            {tokenStorage.isValid('duo') && <div className="h-2 w-2 rounded-full bg-success" />}
          </TabsTrigger>
          <TabsTrigger value="entra" className="flex items-center gap-2">
            <Globe className="h-4 w-4" />Entra ID
            {tokenStorage.isValid('entra') && <div className="h-2 w-2 rounded-full bg-success" />}
          </TabsTrigger>
          <TabsTrigger value="okta" className="flex items-center gap-2">
            <Lock className="h-4 w-4" />Okta
            {tokenStorage.isValid('okta') && <div className="h-2 w-2 rounded-full bg-success" />}
          </TabsTrigger>
        </TabsList>

        {/* ── Cisco Duo ── */}
        <TabsContent value="duo">
          <DuoPanel
            config={configs.duo}
            token={tokens.duo ?? null}
            session={session}
            onSave={c => persist({ ...configs, duo: c })}
            onConnect={() => {
              if (!configs.duo?.apiHostname || !configs.duo?.clientId || !configs.duo?.clientSecret) {
                toast.error('Save your Duo configuration first'); return;
              }
              duoInitiateAuth(configs.duo, session?.email);
            }}
            onDisconnect={() => disconnect('duo')}
          />
        </TabsContent>

        {/* ── Entra ID ── */}
        <TabsContent value="entra">
          <EntraPanel
            config={configs.entra}
            token={tokens.entra ?? null}
            onSave={c => persist({ ...configs, entra: c })}
            onConnect={() => {
              if (!configs.entra?.tenantId || !configs.entra?.clientId) {
                toast.error('Save your Entra ID configuration first'); return;
              }
              entraInitiateAuth(configs.entra);
            }}
            onDisconnect={() => disconnect('entra')}
          />
        </TabsContent>

        {/* ── Okta ── */}
        <TabsContent value="okta">
          <OktaPanel
            config={configs.okta}
            token={tokens.okta ?? null}
            onSave={c => persist({ ...configs, okta: c })}
            onConnect={() => {
              if (!configs.okta?.domain || !configs.okta?.clientId) {
                toast.error('Save your Okta configuration first'); return;
              }
              oktaInitiateAuth(configs.okta);
            }}
            onDisconnect={() => disconnect('okta')}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════ */
/*  Cisco Duo Panel                                                          */
/* ══════════════════════════════════════════════════════════════════════════ */

function DuoPanel({ config, token, session, onSave, onConnect, onDisconnect }: {
  config?: DuoConfig;
  token: ConnectorToken | null;
  session: ReturnType<typeof useInternetIdentity>['session'];
  onSave: (c: DuoConfig) => void;
  onConnect: () => void;
  onDisconnect: () => void;
}) {
  const [hostname, setHostname] = useState(config?.apiHostname ?? '');
  const [clientId, setClientId] = useState(config?.clientId ?? '');
  const [secret, setSecret]     = useState(config?.clientSecret ?? '');
  const [saved, setSaved]       = useState(!!config?.clientId);
  const isConnected = tokenStorage.isValid('duo');

  const handleSave = () => {
    if (!hostname.trim() || !clientId.trim() || !secret.trim()) {
      toast.error('All three fields are required'); return;
    }
    const h = hostname.trim().replace(/^https?:\/\//i, '').replace(/\/.*/, '');
    onSave({ apiHostname: h, clientId: clientId.trim(), clientSecret: secret.trim() });
    setSaved(true);
    toast.success('Duo configuration saved — click "Authenticate with Duo" to test');
  };

  return (
    <div className="space-y-6">
      {/* Status */}
      <Card className={`border-border/40 glass-strong shadow-depth-md ${isConnected ? 'gradient-success' : ''}`}>
        <CardContent className="p-5">
          <div className="flex items-center gap-4">
            <div className={`p-3 rounded-xl shadow-depth-sm ${isConnected ? 'bg-success/20' : 'bg-primary/10'}`}>
              <Shield className={`h-6 w-6 ${isConnected ? 'text-success' : 'text-primary'}`} />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold">Cisco Duo Universal Prompt</h3>
              <p className="text-sm text-muted-foreground">
                {isConnected ? 'Connected — PKCE token active' : 'OAuth2 PKCE · Phishing-resistant MFA'}
              </p>
              <TokenBadge provider="duo" />
            </div>
            <div className="flex items-center gap-2">
              {isConnected
                ? <Badge variant="default" className="text-xs"><CheckCircle2 className="h-3 w-3 mr-1" />Connected</Badge>
                : <Badge variant="secondary" className="text-xs">{saved ? 'Configured' : 'Not configured'}</Badge>}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Connected user info */}
      {isConnected && token?.userInfo && (
        <Card className="border-border/40 glass-strong shadow-depth-md gradient-success">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-success/20"><User className="h-5 w-5 text-success" /></div>
                <div>
                  <p className="font-semibold text-sm">{token.userInfo.name || 'Authenticated User'}</p>
                  <p className="text-xs text-muted-foreground">{token.userInfo.email}</p>
                  {token.userInfo.sub && (
                    <div
                      className="text-xs font-mono text-muted-foreground/60 cursor-pointer hover:text-muted-foreground flex items-center gap-1 mt-0.5"
                      onClick={() => { navigator.clipboard.writeText(token.userInfo!.sub!); toast.success('Sub copied'); }}
                    >
                      <Copy className="h-3 w-3" />sub: {token.userInfo.sub.slice(0, 24)}…
                    </div>
                  )}
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={onDisconnect} className="rounded-full btn-press text-xs">
                <LogOut className="h-3.5 w-3.5 mr-1.5" />Disconnect
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid md:grid-cols-2 gap-6">
        {/* Config form */}
        <Card className="border-border/40 glass-strong shadow-depth-md">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Key className="h-4 w-4" />Configuration
            </CardTitle>
            <CardDescription>
              Find these in Duo Admin Panel → Applications → your Nexus application.
              <a href="https://admin.duosecurity.com" target="_blank" rel="noopener noreferrer"
                className="ml-1 text-primary hover:underline inline-flex items-center gap-1">
                Open Duo Admin <ExternalLink className="h-3 w-3" />
              </a>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>API Hostname</Label>
              <Input value={hostname} onChange={e => setHostname(e.target.value)}
                placeholder="api-XXXXXXXX.duosecurity.com"
                className="glass-effect font-mono text-sm" />
              <p className="text-xs text-muted-foreground">Do not include https://</p>
            </div>
            <div className="space-y-1.5">
              <Label>Integration Key (Client ID)</Label>
              <Input value={clientId} onChange={e => setClientId(e.target.value)}
                placeholder="DIxxxxxxxxxxxxxxxxxx"
                className="glass-effect font-mono text-sm" />
            </div>
            <MaskedInput
              label="Secret Key (Client Secret)"
              value={secret} onChange={setSecret}
              placeholder="••••••••••••••••••••••••••••••••••••••••"
              hint="Stored only in this browser's localStorage. Never sent to any server except Duo."
            />

            <div className="p-3 rounded-xl glass-effect border border-border/40 space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Required Duo Application Settings</p>
              <div className="space-y-1 text-xs text-muted-foreground">
                <p>• Application type: <span className="text-foreground font-mono">Web SDK</span></p>
                <p>• Redirect URI: <span
                  className="text-primary font-mono cursor-pointer hover:underline"
                  onClick={() => { navigator.clipboard.writeText(window.location.origin + window.location.pathname); toast.success('Redirect URI copied'); }}>
                  {window.location.origin + window.location.pathname}
                  <Copy className="h-3 w-3 inline ml-1" />
                </span></p>
                <p>• Grant type: <span className="text-foreground font-mono">Authorization Code</span></p>
                <p>• PKCE: <span className="text-success font-mono">Enabled</span></p>
              </div>
            </div>

            <Button onClick={handleSave} className="w-full rounded-full btn-press">
              Save Configuration
            </Button>
          </CardContent>
        </Card>

        {/* Auth flow */}
        <Card className="border-border/40 glass-strong shadow-depth-md">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Shield className="h-4 w-4" />Authenticate
            </CardTitle>
            <CardDescription>Test the Universal Prompt flow with your Duo instance.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3 text-sm">
              {[
                { n: '1', t: 'PKCE challenge', d: 'SHA-256 code_challenge generated in browser' },
                { n: '2', t: 'Redirect to Duo', d: `https://${hostname || '<api_hostname>'}/oauth/v1/authorize` },
                { n: '3', t: 'Duo MFA prompt', d: 'Push notification, phone call, or passcode' },
                { n: '4', t: 'Token exchange', d: 'code → access_token + id_token via PKCE' },
              ].map(({ n, t, d }) => (
                <div key={n} className="flex items-start gap-3 p-2.5 rounded-lg glass-effect border border-border/40">
                  <div className="h-5 w-5 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary shrink-0">{n}</div>
                  <div>
                    <p className="font-medium text-xs">{t}</p>
                    <p className="text-xs text-muted-foreground font-mono">{d}</p>
                  </div>
                </div>
              ))}
            </div>

            {session?.email && (
              <div className="p-2.5 rounded-lg glass-effect border border-border/40 text-xs">
                <span className="text-muted-foreground">duo_uname will be pre-filled: </span>
                <span className="font-mono text-primary">{session.email}</span>
              </div>
            )}

            {isConnected ? (
              <div className="space-y-2">
                <Button variant="outline" onClick={onConnect} className="w-full rounded-full btn-press">
                  <RefreshCw className="h-4 w-4 mr-2" />Re-authenticate
                </Button>
                <Button variant="ghost" onClick={onDisconnect} className="w-full rounded-full btn-press text-destructive hover:text-destructive">
                  <LogOut className="h-4 w-4 mr-2" />Disconnect
                </Button>
              </div>
            ) : (
              <Button
                onClick={onConnect}
                disabled={!saved}
                className="w-full rounded-full btn-press"
                style={{ background: 'linear-gradient(135deg, #00a1e0, #0066cc)' }}
              >
                <Shield className="h-4 w-4 mr-2" />
                {saved ? 'Authenticate with Duo' : 'Save configuration first'}
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════ */
/*  Microsoft Entra ID Panel                                                 */
/* ══════════════════════════════════════════════════════════════════════════ */

function EntraPanel({ config, token, onSave, onConnect, onDisconnect }: {
  config?: EntraConfig;
  token: ConnectorToken | null;
  onSave: (c: EntraConfig) => void;
  onConnect: () => void;
  onDisconnect: () => void;
}) {
  const [tenantId, setTenantId] = useState(config?.tenantId ?? '');
  const [clientId, setClientId] = useState(config?.clientId ?? '');
  const [saved, setSaved] = useState(!!config?.clientId);
  const isConnected = tokenStorage.isValid('entra');

  const handleSave = () => {
    if (!tenantId.trim() || !clientId.trim()) { toast.error('Tenant ID and Client ID are required'); return; }
    onSave({ tenantId: tenantId.trim(), clientId: clientId.trim() });
    setSaved(true);
    toast.success('Entra ID configuration saved');
  };

  return (
    <div className="space-y-6">
      <Card className={`border-border/40 glass-strong shadow-depth-md ${isConnected ? 'gradient-success' : ''}`}>
        <CardContent className="p-5">
          <div className="flex items-center gap-4">
            <div className={`p-3 rounded-xl shadow-depth-sm ${isConnected ? 'bg-success/20' : 'bg-primary/10'}`}>
              <Globe className={`h-6 w-6 ${isConnected ? 'text-success' : 'text-primary'}`} />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold">Microsoft Entra ID (Azure AD)</h3>
              <p className="text-sm text-muted-foreground">OAuth2 PKCE · No client_secret required · CORS-native</p>
              <TokenBadge provider="entra" />
            </div>
            {isConnected
              ? <Badge variant="default" className="text-xs"><CheckCircle2 className="h-3 w-3 mr-1" />Connected</Badge>
              : <Badge variant="secondary" className="text-xs">{saved ? 'Configured' : 'Not configured'}</Badge>}
          </div>
        </CardContent>
      </Card>

      {isConnected && token?.userInfo && (
        <Card className="border-border/40 glass-strong gradient-success shadow-depth-md">
          <CardContent className="p-5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-success/20"><User className="h-5 w-5 text-success" /></div>
              <div>
                <p className="font-semibold text-sm">{token.userInfo.name || token.userInfo.email}</p>
                <p className="text-xs text-muted-foreground">{token.userInfo.email}</p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={onDisconnect} className="rounded-full btn-press text-xs">
              <LogOut className="h-3.5 w-3.5 mr-1.5" />Disconnect
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="grid md:grid-cols-2 gap-6">
        <Card className="border-border/40 glass-strong shadow-depth-md">
          <CardHeader>
            <CardTitle className="text-base">App Registration</CardTitle>
            <CardDescription>
              Azure Portal → Entra ID → App registrations → your app.
              <a href="https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps" target="_blank" rel="noopener noreferrer"
                className="ml-1 text-primary hover:underline inline-flex items-center gap-1">
                Open Azure Portal <ExternalLink className="h-3 w-3" />
              </a>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Tenant ID</Label>
              <Input value={tenantId} onChange={e => setTenantId(e.target.value)}
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx or 'common'"
                className="glass-effect font-mono text-sm" />
              <p className="text-xs text-muted-foreground">Use <span className="font-mono">common</span> for multi-tenant apps</p>
            </div>
            <div className="space-y-1.5">
              <Label>Client ID (Application ID)</Label>
              <Input value={clientId} onChange={e => setClientId(e.target.value)}
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                className="glass-effect font-mono text-sm" />
            </div>
            <div className="p-3 rounded-xl glass-effect border border-border/40 space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Azure App Required Settings</p>
              <div className="space-y-1 text-xs text-muted-foreground">
                <p>• Platform: <span className="text-foreground font-mono">Single-page application (SPA)</span></p>
                <p>• Redirect URI:
                  <span className="text-primary font-mono ml-1 cursor-pointer hover:underline"
                    onClick={() => { navigator.clipboard.writeText(window.location.origin + window.location.pathname); toast.success('Copied'); }}>
                    {window.location.origin + window.location.pathname} <Copy className="h-3 w-3 inline" />
                  </span>
                </p>
                <p>• API permissions: <span className="text-foreground font-mono">openid, profile, email, User.Read</span></p>
                <p>• No client_secret needed for SPA PKCE</p>
              </div>
            </div>
            <Button onClick={handleSave} className="w-full rounded-full btn-press">Save Configuration</Button>
          </CardContent>
        </Card>

        <Card className="border-border/40 glass-strong shadow-depth-md">
          <CardHeader>
            <CardTitle className="text-base">Sign In</CardTitle>
            <CardDescription>Redirects to Microsoft login with your tenant context.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2 text-xs">
              {[
                { n: '1', t: 'PKCE challenge', d: 'S256 code_challenge in browser' },
                { n: '2', t: 'Microsoft login', d: `login.microsoftonline.com/${tenantId || '<tenantId>'}` },
                { n: '3', t: 'Consent & MFA', d: 'User authenticates with Entra MFA policy' },
                { n: '4', t: 'Token issued', d: 'access_token + id_token (JWT) returned' },
              ].map(({ n, t, d }) => (
                <div key={n} className="flex items-start gap-3 p-2 rounded-lg glass-effect border border-border/40">
                  <div className="h-5 w-5 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary shrink-0">{n}</div>
                  <div><p className="font-medium">{t}</p><p className="text-muted-foreground font-mono">{d}</p></div>
                </div>
              ))}
            </div>
            {isConnected ? (
              <div className="space-y-2">
                <Button variant="outline" onClick={onConnect} className="w-full rounded-full btn-press">
                  <RefreshCw className="h-4 w-4 mr-2" />Re-authenticate
                </Button>
                <Button variant="ghost" onClick={onDisconnect} className="w-full rounded-full btn-press text-destructive hover:text-destructive">
                  <LogOut className="h-4 w-4 mr-2" />Disconnect
                </Button>
              </div>
            ) : (
              <Button onClick={onConnect} disabled={!saved} className="w-full rounded-full btn-press"
                style={{ background: 'linear-gradient(135deg, #0078d4, #005a9e)' }}>
                <Globe className="h-4 w-4 mr-2" />
                {saved ? 'Sign in with Microsoft' : 'Save configuration first'}
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════ */
/*  Okta Panel                                                               */
/* ══════════════════════════════════════════════════════════════════════════ */

function OktaPanel({ config, token, onSave, onConnect, onDisconnect }: {
  config?: OktaConfig;
  token: ConnectorToken | null;
  onSave: (c: OktaConfig) => void;
  onConnect: () => void;
  onDisconnect: () => void;
}) {
  const [domain, setDomain]   = useState(config?.domain ?? '');
  const [clientId, setClientId] = useState(config?.clientId ?? '');
  const [serverId, setServerId] = useState(config?.authServerId ?? 'default');
  const [saved, setSaved] = useState(!!config?.clientId);
  const isConnected = tokenStorage.isValid('okta');

  const handleSave = () => {
    if (!domain.trim() || !clientId.trim()) { toast.error('Domain and Client ID are required'); return; }
    const d = domain.trim().replace(/^https?:\/\//i, '').replace(/\/.*/, '');
    onSave({ domain: d, clientId: clientId.trim(), authServerId: serverId.trim() || 'default' });
    setSaved(true);
    toast.success('Okta configuration saved');
  };

  return (
    <div className="space-y-6">
      <Card className={`border-border/40 glass-strong shadow-depth-md ${isConnected ? 'gradient-success' : ''}`}>
        <CardContent className="p-5">
          <div className="flex items-center gap-4">
            <div className={`p-3 rounded-xl shadow-depth-sm ${isConnected ? 'bg-success/20' : 'bg-primary/10'}`}>
              <Lock className={`h-6 w-6 ${isConnected ? 'text-success' : 'text-primary'}`} />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold">Okta</h3>
              <p className="text-sm text-muted-foreground">OAuth2 PKCE · Universal sign-on · Adaptive MFA</p>
              <TokenBadge provider="okta" />
            </div>
            {isConnected
              ? <Badge variant="default" className="text-xs"><CheckCircle2 className="h-3 w-3 mr-1" />Connected</Badge>
              : <Badge variant="secondary" className="text-xs">{saved ? 'Configured' : 'Not configured'}</Badge>}
          </div>
        </CardContent>
      </Card>

      {isConnected && token?.userInfo && (
        <Card className="border-border/40 glass-strong gradient-success shadow-depth-md">
          <CardContent className="p-5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-success/20"><User className="h-5 w-5 text-success" /></div>
              <div>
                <p className="font-semibold text-sm">{token.userInfo.name || token.userInfo.email}</p>
                <p className="text-xs text-muted-foreground">{token.userInfo.email}</p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={onDisconnect} className="rounded-full btn-press text-xs">
              <LogOut className="h-3.5 w-3.5 mr-1.5" />Disconnect
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="grid md:grid-cols-2 gap-6">
        <Card className="border-border/40 glass-strong shadow-depth-md">
          <CardHeader>
            <CardTitle className="text-base">Application Settings</CardTitle>
            <CardDescription>
              Okta Admin → Applications → your SPA app.
              <a href="https://developer.okta.com" target="_blank" rel="noopener noreferrer"
                className="ml-1 text-primary hover:underline inline-flex items-center gap-1">
                Open Okta Dev <ExternalLink className="h-3 w-3" />
              </a>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Okta Domain</Label>
              <Input value={domain} onChange={e => setDomain(e.target.value)}
                placeholder="your-org.okta.com"
                className="glass-effect font-mono text-sm" />
              <p className="text-xs text-muted-foreground">Do not include https://</p>
            </div>
            <div className="space-y-1.5">
              <Label>Client ID</Label>
              <Input value={clientId} onChange={e => setClientId(e.target.value)}
                placeholder="0oa..."
                className="glass-effect font-mono text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label>Authorization Server ID</Label>
              <Input value={serverId} onChange={e => setServerId(e.target.value)}
                placeholder="default"
                className="glass-effect font-mono text-sm" />
              <p className="text-xs text-muted-foreground">Usually <span className="font-mono">default</span> unless you've created a custom one</p>
            </div>
            <div className="p-3 rounded-xl glass-effect border border-border/40 space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Okta App Required Settings</p>
              <div className="space-y-1 text-xs text-muted-foreground">
                <p>• Application type: <span className="text-foreground font-mono">Single-Page App (SPA)</span></p>
                <p>• Sign-in redirect URI:
                  <span className="text-primary font-mono ml-1 cursor-pointer hover:underline"
                    onClick={() => { navigator.clipboard.writeText(window.location.origin + window.location.pathname); toast.success('Copied'); }}>
                    {window.location.origin + window.location.pathname} <Copy className="h-3 w-3 inline" />
                  </span>
                </p>
                <p>• Grant type: <span className="text-foreground font-mono">Authorization Code + PKCE</span></p>
                <p>• Trusted Origins: add <span className="text-foreground font-mono">{window.location.origin}</span></p>
              </div>
            </div>
            <Button onClick={handleSave} className="w-full rounded-full btn-press">Save Configuration</Button>
          </CardContent>
        </Card>

        <Card className="border-border/40 glass-strong shadow-depth-md">
          <CardHeader>
            <CardTitle className="text-base">Sign In</CardTitle>
            <CardDescription>Redirects to your Okta tenant's login page.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2 text-xs">
              {[
                { n: '1', t: 'PKCE challenge', d: 'S256 code_challenge in browser' },
                { n: '2', t: 'Okta login', d: `${domain || '<your-org>.okta.com'}/oauth2/${serverId}/v1/authorize` },
                { n: '3', t: 'MFA policy', d: 'Okta adaptive MFA enforces your policy' },
                { n: '4', t: 'Token issued', d: 'access_token + id_token (JWT)' },
              ].map(({ n, t, d }) => (
                <div key={n} className="flex items-start gap-3 p-2 rounded-lg glass-effect border border-border/40">
                  <div className="h-5 w-5 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary shrink-0">{n}</div>
                  <div><p className="font-medium">{t}</p><p className="text-muted-foreground font-mono">{d}</p></div>
                </div>
              ))}
            </div>
            {isConnected ? (
              <div className="space-y-2">
                <Button variant="outline" onClick={onConnect} className="w-full rounded-full btn-press">
                  <RefreshCw className="h-4 w-4 mr-2" />Re-authenticate
                </Button>
                <Button variant="ghost" onClick={onDisconnect} className="w-full rounded-full btn-press text-destructive hover:text-destructive">
                  <LogOut className="h-4 w-4 mr-2" />Disconnect
                </Button>
              </div>
            ) : (
              <Button onClick={onConnect} disabled={!saved} className="w-full rounded-full btn-press"
                style={{ background: 'linear-gradient(135deg, #007dc1, #00297a)' }}>
                <Lock className="h-4 w-4 mr-2" />
                {saved ? 'Sign in with Okta' : 'Save configuration first'}
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
