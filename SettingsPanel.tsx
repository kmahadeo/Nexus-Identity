import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Settings, Bell, Shield, Smartphone, Key, Plug, Sparkles,
  CheckCircle2, Trash2, Eye, EyeOff, Copy, ExternalLink,
  RefreshCw, AlertCircle, Lock,
} from 'lucide-react';
import { toast } from 'sonner';
import { settings as appSettings, type AppSettings } from './lib/storage';
import { loadPasskeys, deletePasskey } from './lib/webauthn';
import { useInternetIdentity } from './hooks/useInternetIdentity';
import { useQueryClient } from '@tanstack/react-query';

export default function SettingsPanel() {
  const { session } = useInternetIdentity();
  const queryClient = useQueryClient();

  const [cfg, setCfg] = useState<AppSettings>(() => appSettings.get());
  const [apiKeyVisible, setApiKeyVisible] = useState(false);
  const [apiKeyDraft, setApiKeyDraft] = useState('');
  const [testingApi, setTestingApi] = useState(false);
  const [apiTestResult, setApiTestResult] = useState<'ok' | 'fail' | null>(null);
  const [passkeys, setPasskeys] = useState(() => loadPasskeys());
  const [linkedDevices] = useState([
    { id: '1', name: 'MacBook Pro', type: 'macOS', lastActive: '2 hours ago',  trusted: true },
    { id: '2', name: 'iPhone 15 Pro', type: 'iOS',   lastActive: '1 day ago',   trusted: true },
    { id: '3', name: 'iPad Air',    type: 'iOS',   lastActive: '3 days ago',  trusted: false },
  ]);

  // Persist whenever cfg changes
  useEffect(() => { appSettings.set(cfg); }, [cfg]);

  // Load the ACTIVE provider's key draft on mount
  useEffect(() => {
    const s = appSettings.get();
    const active = s.ai.providers?.find(p => p.provider === (s.ai.activeProvider ?? 'anthropic'));
    const key = active?.apiKey || s.ai.anthropicApiKey || '';
    setApiKeyDraft(key ? '••••••••' + key.slice(-4) : '');
  }, []);

  const patchNotif = (k: keyof AppSettings['notifications'], v: boolean) => {
    setCfg(prev => ({ ...prev, notifications: { ...prev.notifications, [k]: v } }));
    toast.success('Notification preference saved');
  };

  const patchSec = (k: keyof AppSettings['security'], v: boolean | number) => {
    setCfg(prev => ({ ...prev, security: { ...prev.security, [k]: v } }));
    toast.success('Security setting saved');
  };

  const saveApiKey = () => {
    // Only save if the draft looks like a real key (not the masked version)
    if (apiKeyDraft.includes('•')) {
      toast.info('No changes to API key');
      return;
    }
    const key = apiKeyDraft.trim();
    if (!key.startsWith('sk-ant-')) {
      toast.error('Invalid Anthropic API key — must start with sk-ant-');
      return;
    }
    // Write directly to localStorage immediately (don't wait for useEffect)
    const updated = { ...appSettings.get(), ai: { ...appSettings.get().ai, anthropicApiKey: key, enabled: true } };
    appSettings.set(updated);
    setCfg(updated);
    setApiKeyDraft('••••••••' + key.slice(-4));
    toast.success('API key saved — AI Coach is now powered by Claude');
    queryClient.invalidateQueries();
  };

  const clearApiKey = () => {
    setCfg(prev => ({ ...prev, ai: { ...prev.ai, anthropicApiKey: '', enabled: true } }));
    setApiKeyDraft('');
    setApiTestResult(null);
    toast.success('API key removed — AI Coach will use local responses');
  };

  const testApiKey = async () => {
    const s = appSettings.get();
    const activeProviderName = s.ai.activeProvider ?? 'anthropic';
    const provider = s.ai.providers?.find(p => p.provider === activeProviderName);
    const key = provider?.apiKey || s.ai.anthropicApiKey || '';
    if (!key) { toast.error('Save an API key first'); return; }
    setTestingApi(true);
    setApiTestResult(null);
    try {
      let res: Response;
      if (activeProviderName === 'anthropic') {
        res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true', 'content-type': 'application/json' },
          body: JSON.stringify({ model: provider?.model || 'claude-haiku-4-5-20251001', max_tokens: 32, messages: [{ role: 'user', content: 'Reply with: ok' }] }),
        });
      } else if (activeProviderName === 'openai') {
        res = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${key}`, 'content-type': 'application/json' },
          body: JSON.stringify({ model: provider?.model || 'gpt-4o-mini', max_tokens: 16, messages: [{ role: 'user', content: 'Reply with: ok' }] }),
        });
      } else if (activeProviderName === 'gemini') {
        const model = provider?.model || 'gemini-1.5-flash';
        res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'Reply with: ok' }] }] }),
        });
      } else if (activeProviderName === 'custom' && provider?.baseUrl) {
        res = await fetch(`${provider.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${key}`, 'content-type': 'application/json' },
          body: JSON.stringify({ model: provider.model, max_tokens: 16, messages: [{ role: 'user', content: 'Reply with: ok' }] }),
        });
      } else {
        toast.error('Configure a base URL for custom provider'); setTestingApi(false); return;
      }
      if (res.ok) {
        setApiTestResult('ok');
        const providerLabel = { anthropic: 'Claude', openai: 'OpenAI', gemini: 'Gemini', custom: 'Custom LLM' }[activeProviderName];
        toast.success(`${providerLabel} API key is valid`);
      } else {
        setApiTestResult('fail');
        let errDetail = '';
        try { const body = await res.json(); errDetail = body?.error?.message || body?.error?.status || ''; } catch {}
        toast.error(`API ${res.status}${errDetail ? ': ' + errDetail : ' — check your key'}`);
      }
    } catch (e: unknown) {
      setApiTestResult('fail');
      const msg = e instanceof Error ? e.message : 'Unknown error';
      toast.error(`Network error: ${msg}`);
    } finally {
      setTestingApi(false);
    }
  };

  const revokePasskey = (id: string, name: string) => {
    deletePasskey(id);
    setPasskeys(loadPasskeys());
    toast.success(`Passkey "${name}" revoked`);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold mb-2">Settings</h1>
        <p className="text-muted-foreground">Manage your account, security, AI configuration and preferences</p>
      </div>

      {session && (
        <Card className="border-border/40 glass-strong shadow-depth-md gradient-primary">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-primary/20">
              <Shield className="h-6 w-6 text-primary" />
            </div>
            <div className="flex-1">
              <p className="font-semibold">{session.name}</p>
              <p className="text-sm text-muted-foreground font-mono">{session.email} · Role: <span className="capitalize">{session.role}</span> · Tier: <span className="capitalize">{session.tier}</span></p>
            </div>
            <Badge variant="secondary" className="capitalize font-mono text-xs">{session.role}</Badge>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="notifications" className="space-y-6">
        <TabsList className="glass-effect border border-border/40 flex-wrap gap-1">
          <TabsTrigger value="notifications"><Bell className="h-4 w-4 mr-2" />Notifications</TabsTrigger>
          <TabsTrigger value="security"><Shield className="h-4 w-4 mr-2" />Security</TabsTrigger>
          <TabsTrigger value="ai"><Sparkles className="h-4 w-4 mr-2" />AI Coach</TabsTrigger>
          <TabsTrigger value="devices"><Smartphone className="h-4 w-4 mr-2" />Devices</TabsTrigger>
          <TabsTrigger value="passkeys"><Key className="h-4 w-4 mr-2" />Passkeys</TabsTrigger>
          <TabsTrigger value="integrations"><Plug className="h-4 w-4 mr-2" />Integrations</TabsTrigger>
        </TabsList>

        {/* ── Notifications ── */}
        <TabsContent value="notifications" className="space-y-6">
          <Card className="border-border/40 glass-strong shadow-depth-md">
            <CardHeader>
              <CardTitle>Notification Preferences</CardTitle>
              <CardDescription>All preferences are saved automatically</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Categories</h3>
                <SettingRow label="Security Alerts" desc="Critical security issues and threats" checked={cfg.notifications.security} onChange={v => patchNotif('security', v)} />
                <SettingRow label="Account Activity" desc="Login attempts and profile changes" checked={cfg.notifications.account} onChange={v => patchNotif('account', v)} />
                <SettingRow label="AI Insights" desc="Security recommendations from the AI Coach" checked={cfg.notifications.aiInsights} onChange={v => patchNotif('aiInsights', v)} />
                <SettingRow label="Billing Updates" desc="Payment and subscription notifications" checked={cfg.notifications.billing} onChange={v => patchNotif('billing', v)} />
              </div>
              <Separator />
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Delivery Methods</h3>
                <SettingRow label="Email Notifications" desc="Receive alerts via email" checked={cfg.notifications.email} onChange={v => patchNotif('email', v)} />
                <SettingRow label="Push Notifications" desc="Browser push notifications" checked={cfg.notifications.push} onChange={v => patchNotif('push', v)} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Security ── */}
        <TabsContent value="security" className="space-y-6">
          <Card className="border-border/40 glass-strong shadow-depth-md">
            <CardHeader>
              <CardTitle>Security Settings</CardTitle>
              <CardDescription>All changes are saved instantly to local storage</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <SettingRow label="Two-Factor Authentication" desc="Require a second factor for sensitive actions" checked={cfg.security.twoFactor} onChange={v => patchSec('twoFactor', v)} />
              <SettingRow label="Biometric Unlock" desc="Use fingerprint or face recognition to unlock vault" checked={cfg.security.biometric} onChange={v => patchSec('biometric', v)} />
              <SettingRow label="Auto-Lock" desc="Lock vault automatically after inactivity" checked={cfg.security.autoLock} onChange={v => patchSec('autoLock', v)} />
              <SettingRow label="Require password to view secrets" desc="Extra confirmation before revealing stored passwords" checked={cfg.security.requirePasswordOnView} onChange={v => patchSec('requirePasswordOnView', v)} />

              <Separator />

              <div className="space-y-2">
                <Label className="text-sm font-medium">Session timeout</Label>
                <Select
                  value={String(cfg.security.sessionTimeoutMinutes)}
                  onValueChange={v => patchSec('sessionTimeoutMinutes', Number(v))}
                >
                  <SelectTrigger className="glass-effect w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[5, 15, 30, 60, 120].map(m => (
                      <SelectItem key={m} value={String(m)}>{m} minutes</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Vault auto-locks after this period of inactivity</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── AI Coach ── */}
        <TabsContent value="ai" className="space-y-6">
          <Card className="border-border/40 glass-strong shadow-depth-md gradient-primary">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-xl bg-primary/20"><Sparkles className="h-6 w-6 text-primary" /></div>
                <div>
                  <CardTitle>AI Provider Configuration</CardTitle>
                  <CardDescription>Connect Claude, ChatGPT, Gemini, or any OpenAI-compatible model</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="p-3 rounded-xl glass-effect border border-border/40">
                <div className="flex items-center gap-2 text-xs text-warning mb-1">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  <span>API keys are stored in localStorage on this device only — never sent to Nexus servers. Use a low-privilege key for demos.</span>
                </div>
              </div>

              {/* Active Provider Selector */}
              <div className="space-y-2">
                <Label>Active AI Provider</Label>
                <Select
                  value={cfg.ai.activeProvider ?? 'anthropic'}
                  onValueChange={v => {
                    const updated = { ...cfg, ai: { ...cfg.ai, activeProvider: v as typeof cfg.ai.activeProvider } };
                    appSettings.set(updated);
                    setCfg(updated);
                    setApiTestResult(null);
                    // Update the key draft to show the selected provider's key
                    const newActive = updated.ai.providers?.find(p => p.provider === v);
                    const newKey = newActive?.apiKey || '';
                    setApiKeyDraft(newKey ? '••••••••' + newKey.slice(-4) : '');
                    toast.success(`Active provider: ${v}`);
                  }}
                >
                  <SelectTrigger className="glass-effect">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="anthropic">🟣 Anthropic Claude</SelectItem>
                    <SelectItem value="openai">🟢 OpenAI ChatGPT</SelectItem>
                    <SelectItem value="gemini">🔵 Google Gemini</SelectItem>
                    <SelectItem value="custom">⚙️ Custom / Self-hosted</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Per-provider config */}
              {(cfg.ai.providers ?? []).map((provider, idx) => {
                const isActive = (cfg.ai.activeProvider ?? 'anthropic') === provider.provider;
                if (!isActive) return null;
                const providerLabels: Record<string, { name: string; placeholder: string; keyUrl: string; models: string[] }> = {
                  anthropic: { name: 'Anthropic Claude', placeholder: 'sk-ant-api03-…', keyUrl: 'https://console.anthropic.com/account/keys', models: ['claude-haiku-4-5-20251001', 'claude-sonnet-4-6', 'claude-opus-4-6'] },
                  openai:    { name: 'OpenAI ChatGPT',   placeholder: 'sk-…',            keyUrl: 'https://platform.openai.com/api-keys',            models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4-turbo'] },
                  gemini:    { name: 'Google Gemini',    placeholder: 'AIza…',            keyUrl: 'https://aistudio.google.com/app/apikey',          models: ['gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-2.0-flash'] },
                  custom:    { name: 'Custom / OpenAI-compatible', placeholder: 'your-api-key', keyUrl: '', models: [] },
                };
                const meta = providerLabels[provider.provider];

                const updateProvider = (updates: Partial<typeof provider>) => {
                  const currentProvider = cfg.ai.providers?.[idx] ?? provider;
                  const newProviders = (cfg.ai.providers ?? []).map((pr, i) => i === idx ? { ...pr, ...updates } : pr);
                  const updatedFinal = { ...cfg, ai: { ...cfg.ai, providers: newProviders, anthropicApiKey: provider.provider === 'anthropic' ? (updates.apiKey ?? currentProvider.apiKey) : cfg.ai.anthropicApiKey } };
                  appSettings.set(updatedFinal);
                  setCfg(updatedFinal);
                };

                return (
                  <div key={provider.provider} className="space-y-4">
                    {provider.provider === 'custom' && (
                      <div className="space-y-2">
                        <Label>Base URL (OpenAI-compatible endpoint)</Label>
                        <Input
                          placeholder="https://your-llm.example.com/v1"
                          value={provider.baseUrl ?? ''}
                          onChange={e => updateProvider({ baseUrl: e.target.value })}
                          className="glass-effect font-mono text-sm"
                        />
                      </div>
                    )}
                    <div className="space-y-2">
                      <Label>{meta.name} API Key</Label>
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <Input
                            type={apiKeyVisible ? 'text' : 'password'}
                            placeholder={meta.placeholder}
                            value={apiKeyDraft}
                            onChange={e => setApiKeyDraft(e.target.value)}
                            className="glass-effect pr-10 font-mono text-sm"
                          />
                          <button type="button" onClick={() => setApiKeyVisible(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                            {apiKeyVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                        <Button onClick={() => {
                          if (apiKeyDraft.includes('•')) { toast.info('No changes'); return; }
                          const key = apiKeyDraft.trim();
                          if (!key) { toast.error('Enter an API key'); return; }
                          updateProvider({ apiKey: key, enabled: true });
                          setApiKeyDraft('••••••••' + key.slice(-4));
                          toast.success(`${meta.name} key saved`);
                          queryClient.invalidateQueries();
                        }} className="rounded-full btn-press shrink-0">Save</Button>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <Button variant="outline" size="sm" onClick={testApiKey} disabled={testingApi} className="rounded-full btn-press">
                          {testingApi ? <><RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" />Testing…</> : 'Test connection'}
                        </Button>
                        {provider.apiKey && (
                          <Button variant="ghost" size="sm" onClick={() => { updateProvider({ apiKey: '', enabled: false }); setApiKeyDraft(''); setApiTestResult(null); toast.success('Key cleared'); }} className="rounded-full btn-press text-destructive hover:text-destructive">
                            Clear key
                          </Button>
                        )}
                        {apiTestResult === 'ok'   && <Badge variant="secondary" className="text-success text-xs"><CheckCircle2 className="h-3 w-3 mr-1" />Connected</Badge>}
                        {apiTestResult === 'fail' && <Badge variant="secondary" className="text-destructive text-xs"><AlertCircle className="h-3 w-3 mr-1" />Failed</Badge>}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Model</Label>
                      {meta.models.length > 0 ? (
                        <Select value={provider.model} onValueChange={v => updateProvider({ model: v })}>
                          <SelectTrigger className="glass-effect"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {meta.models.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input placeholder="model-name (e.g. llama3)" value={provider.model} onChange={e => updateProvider({ model: e.target.value })} className="glass-effect font-mono text-sm" />
                      )}
                    </div>

                    {meta.keyUrl && (
                      <div className="p-3 rounded-xl glass-effect border border-border/40">
                        <a href={meta.keyUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-primary hover:underline">
                          <ExternalLink className="h-4 w-4" />Get {meta.name} API key
                        </a>
                      </div>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Devices ── */}
        <TabsContent value="devices" className="space-y-6">
          <Card className="border-border/40 glass-strong shadow-depth-md">
            <CardHeader>
              <CardTitle>Linked Devices</CardTitle>
              <CardDescription>Devices with access to your Nexus Identity account</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[400px]">
                <div className="space-y-3">
                  {linkedDevices.map(d => (
                    <div key={d.id} className="p-4 rounded-xl border border-border/40 glass-effect shadow-depth-sm card-tactile">
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3">
                          <div className="p-2.5 rounded-xl bg-primary/10 shadow-depth-sm"><Smartphone className="h-5 w-5 text-primary" /></div>
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <h4 className="font-semibold text-sm">{d.name}</h4>
                              {d.trusted && <Badge variant="secondary" className="text-xs"><CheckCircle2 className="h-3 w-3 mr-1" />Trusted</Badge>}
                            </div>
                            <p className="text-xs text-muted-foreground">{d.type} · Last active: {d.lastActive}</p>
                          </div>
                        </div>
                        <Button variant="ghost" size="sm" onClick={() => toast.success('Device removed')} className="rounded-full btn-press hover:text-destructive">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Passkeys ── */}
        <TabsContent value="passkeys" className="space-y-6">
          <Card className="border-border/40 glass-strong shadow-depth-md">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Registered Passkeys</CardTitle>
                  <CardDescription>Manage your FIDO2 credentials across devices</CardDescription>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setPasskeys(loadPasskeys())} className="rounded-full btn-press">
                  <RefreshCw className="h-4 w-4 mr-1.5" />Refresh
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {passkeys.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <Lock className="h-10 w-10 text-muted-foreground mb-3" />
                  <p className="text-sm text-muted-foreground">No passkeys registered. Go to the Passkeys view to create one.</p>
                </div>
              ) : (
                <ScrollArea className="h-[400px]">
                  <div className="space-y-3">
                    {passkeys.map(pk => (
                      <div key={pk.id} className="p-4 rounded-xl border border-border/40 glass-effect shadow-depth-sm card-tactile">
                        <div className="flex items-start justify-between">
                          <div className="flex items-start gap-3">
                            <div className="p-2.5 rounded-xl bg-primary/10 shadow-depth-sm"><Key className="h-5 w-5 text-primary" /></div>
                            <div>
                              <h4 className="font-semibold text-sm mb-1">{pk.name}</h4>
                              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                <span>Created: {new Date(pk.createdAt).toLocaleDateString()}</span>
                                <span>Used: {pk.signCount}×</span>
                              </div>
                              <div
                                className="mt-1.5 font-mono text-[10px] text-white/20 cursor-pointer hover:text-white/40"
                                onClick={() => { navigator.clipboard.writeText(pk.id); toast.success('ID copied'); }}
                              >
                                <Copy className="h-3 w-3 inline mr-1" />{pk.id.slice(0, 24)}…
                              </div>
                            </div>
                          </div>
                          <Button variant="ghost" size="sm" onClick={() => revokePasskey(pk.id, pk.name)} className="rounded-full btn-press hover:text-destructive">
                            Revoke
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Integrations ── */}
        <TabsContent value="integrations" className="space-y-6">
          <Card className="border-border/40 glass-strong shadow-depth-md">
            <CardHeader>
              <CardTitle>Identity Provider Connections</CardTitle>
              <CardDescription>SSO integrations and federated identity providers</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {[
                  { name: 'Okta',               status: 'connected',     lastSync: '5 minutes ago' },
                  { name: 'Microsoft Entra ID', status: 'connected',     lastSync: '1 hour ago'    },
                  { name: 'Auth0',              status: 'disconnected',  lastSync: 'Never'         },
                  { name: 'Ping Identity',      status: 'disconnected',  lastSync: 'Never'         },
                ].map(p => (
                  <div key={p.name} className="p-4 rounded-xl border border-border/40 glass-effect shadow-depth-sm card-tactile">
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 rounded-xl bg-primary/10 shadow-depth-sm"><Plug className="h-5 w-5 text-primary" /></div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <h4 className="font-semibold text-sm">{p.name}</h4>
                          <Badge variant={p.status === 'connected' ? 'default' : 'secondary'} className="text-xs">{p.status}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">Last sync: {p.lastSync}</p>
                      </div>
                      <Button
                        variant="ghost" size="sm"
                        onClick={() => toast.info(p.status === 'connected' ? `${p.name} disconnected` : `${p.name} OAuth flow would open here`)}
                        className="rounded-full btn-press shrink-0 text-xs"
                      >
                        {p.status === 'connected' ? 'Disconnect' : 'Connect'}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SettingRow({ label, desc, checked, onChange }: { label: string; desc: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between p-3 rounded-xl glass-effect border border-border/40">
      <div className="flex-1 mr-4">
        <Label className="text-sm font-medium cursor-pointer">{label}</Label>
        <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
