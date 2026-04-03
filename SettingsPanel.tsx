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
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Settings, Bell, Shield, Smartphone, Key, Plug, Sparkles,
  CheckCircle2, Trash2, Eye, EyeOff, Copy, ExternalLink,
  RefreshCw, AlertCircle, Lock, User, Save, HelpCircle,
  Globe, CreditCard, Camera, Upload, Link2, X,
} from 'lucide-react';
import MFASetup from './MFASetup';
import { resetOnboarding } from './OnboardingFlow';
import { toast } from 'sonner';
import { settings as appSettings, type AppSettings, sessionStorage_, userRegistry, roleRegistry } from './lib/storage';
import { loadPasskeys, deletePasskey } from './lib/webauthn';
import { useInternetIdentity } from './hooks/useInternetIdentity';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGoogleConfig, setGoogleConfig,
  getAppleConfig, setAppleConfig,
  getStripeKey, setStripeKey,
} from './lib/ssoConfig';

/* ── Avatar localStorage helpers ──────────────────────────────────────── */
const AVATAR_KEY = 'nexus-avatar';
function getAvatar(principalId: string): string | null {
  return localStorage.getItem(`${AVATAR_KEY}-${principalId}`);
}
function setAvatarStorage(principalId: string, dataUrl: string): void {
  localStorage.setItem(`${AVATAR_KEY}-${principalId}`, dataUrl);
}
function removeAvatarStorage(principalId: string): void {
  localStorage.removeItem(`${AVATAR_KEY}-${principalId}`);
}

const AVATAR_MAX_BYTES = 500 * 1024; // 500 KB
const AVATAR_ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export default function SettingsPanel() {
  const { session } = useInternetIdentity();
  const queryClient = useQueryClient();

  const [cfg, setCfg] = useState<AppSettings>(() => appSettings.get());
  const [apiKeyVisible, setApiKeyVisible] = useState(false);
  const [apiKeyDraft, setApiKeyDraft] = useState('');
  const [testingApi, setTestingApi] = useState(false);
  const [apiTestResult, setApiTestResult] = useState<'ok' | 'fail' | null>(null);
  const [passkeys, setPasskeys] = useState(() => loadPasskeys());
  const [profileName, setProfileName] = useState(() => sessionStorage_.get()?.name ?? '');

  // Avatar state
  const [avatarSrc, setAvatarSrc] = useState<string | null>(() =>
    session?.principalId ? getAvatar(session.principalId) : null
  );
  const [avatarUrlDraft, setAvatarUrlDraft] = useState('');
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  const getInitials = (name: string) =>
    name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

  const handleAvatarFile = (file: File) => {
    if (!session?.principalId) return;
    if (!AVATAR_ACCEPTED_TYPES.includes(file.type)) {
      toast.error('Invalid file type. Use JPG, PNG, or WebP.');
      return;
    }
    if (file.size > AVATAR_MAX_BYTES) {
      toast.error(`File too large (${(file.size / 1024).toFixed(0)}KB). Max 500KB.`);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setAvatarStorage(session.principalId, dataUrl);
      setAvatarSrc(dataUrl);
      toast.success('Profile photo updated');
    };
    reader.onerror = () => toast.error('Failed to read file');
    reader.readAsDataURL(file);
  };

  const handleAvatarUrl = () => {
    if (!session?.principalId) return;
    const url = avatarUrlDraft.trim();
    if (!url) { toast.error('Enter a URL'); return; }
    try { new URL(url); } catch { toast.error('Invalid URL'); return; }
    setAvatarStorage(session.principalId, url);
    setAvatarSrc(url);
    setAvatarUrlDraft('');
    setShowUrlInput(false);
    toast.success('Profile photo updated from URL');
  };

  const removeAvatar = () => {
    if (!session?.principalId) return;
    removeAvatarStorage(session.principalId);
    setAvatarSrc(null);
    toast.success('Profile photo removed');
  };

  const [linkedDevices] = useState([
    { id: '1', name: 'MacBook Pro', type: 'macOS', lastActive: '2 hours ago',  trusted: true },
    { id: '2', name: 'iPhone 15 Pro', type: 'iOS',   lastActive: '1 day ago',   trusted: true },
    { id: '3', name: 'iPad Air',    type: 'iOS',   lastActive: '3 days ago',  trusted: false },
  ]);

  // SSO / Stripe config state
  const [googleClientId, setGoogleClientIdState] = useState(() => getGoogleConfig());
  const [appleClientId, setAppleClientIdState] = useState(() => getAppleConfig());
  const [stripeKeyDraft, setStripeKeyDraft] = useState(() => getStripeKey());

  const saveGoogleConfig = () => {
    setGoogleConfig(googleClientId);
    toast.success(googleClientId ? 'Google OAuth Client ID saved' : 'Google OAuth Client ID cleared');
  };
  const saveAppleConfig = () => {
    setAppleConfig(appleClientId);
    toast.success(appleClientId ? 'Apple Sign In Client ID saved' : 'Apple Sign In Client ID cleared');
  };
  const saveStripeConfig = () => {
    setStripeKey(stripeKeyDraft);
    toast.success(stripeKeyDraft ? 'Stripe publishable key saved' : 'Stripe key cleared');
  };

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
    toast.success('API key saved — Security Advisor is now powered by Claude');
    queryClient.invalidateQueries();
  };

  const clearApiKey = () => {
    setCfg(prev => ({ ...prev, ai: { ...prev.ai, anthropicApiKey: '', enabled: true } }));
    setApiKeyDraft('');
    setApiTestResult(null);
    toast.success('API key removed — Security Advisor will use local responses');
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

  const saveProfile = () => {
    const trimmed = profileName.trim();
    if (!trimmed) { toast.error('Name cannot be empty'); return; }
    const s = sessionStorage_.get();
    if (!s) return;
    const updated = { ...s, name: trimmed };
    sessionStorage_.set(updated);
    userRegistry.updateUser(s.principalId, { name: trimmed });
    const reg = roleRegistry.get(s.email);
    if (reg) roleRegistry.save({ ...reg, name: trimmed });
    queryClient.invalidateQueries({ queryKey: ['currentUserProfile'] });
    toast.success('Profile updated');
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

      <Tabs defaultValue="profile" className="space-y-6">
        <TabsList className="glass-effect border border-border/40 flex-wrap gap-1">
          <TabsTrigger value="profile"><User className="h-4 w-4 mr-2" />Profile</TabsTrigger>
          <TabsTrigger value="notifications"><Bell className="h-4 w-4 mr-2" />Notifications</TabsTrigger>
          <TabsTrigger value="security"><Shield className="h-4 w-4 mr-2" />Security</TabsTrigger>
          <TabsTrigger value="ai"><Sparkles className="h-4 w-4 mr-2" />Security Advisor</TabsTrigger>
          <TabsTrigger value="devices"><Smartphone className="h-4 w-4 mr-2" />Devices</TabsTrigger>
          <TabsTrigger value="passkeys"><Key className="h-4 w-4 mr-2" />Passkeys</TabsTrigger>
          <TabsTrigger value="mfa"><Smartphone className="h-4 w-4 mr-2" />MFA</TabsTrigger>
          <TabsTrigger value="integrations"><Plug className="h-4 w-4 mr-2" />Integrations</TabsTrigger>
        </TabsList>

        {/* ── Profile ── */}
        <TabsContent value="profile" className="space-y-6">
          <Card className="border-border/40 glass-strong shadow-depth-md">
            <CardHeader>
              <CardTitle>Profile</CardTitle>
              <CardDescription>Update your display name. Email cannot be changed as it is tied to your identity.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* ── Avatar Section ── */}
              <div className="space-y-3">
                <Label>Profile Photo</Label>
                <div className="flex items-start gap-5">
                  {/* Avatar preview with camera overlay */}
                  <div
                    className={`relative group shrink-0 cursor-pointer rounded-full ${isDraggingOver ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : ''}`}
                    onDragOver={e => { e.preventDefault(); setIsDraggingOver(true); }}
                    onDragLeave={() => setIsDraggingOver(false)}
                    onDrop={e => {
                      e.preventDefault();
                      setIsDraggingOver(false);
                      const file = e.dataTransfer.files?.[0];
                      if (file) handleAvatarFile(file);
                    }}
                    onClick={() => {
                      const input = document.createElement('input');
                      input.type = 'file';
                      input.accept = '.jpg,.jpeg,.png,.webp';
                      input.onchange = () => {
                        const file = input.files?.[0];
                        if (file) handleAvatarFile(file);
                      };
                      input.click();
                    }}
                  >
                    <Avatar className="h-20 w-20" style={{ border: '2px solid rgba(255,255,255,0.1)' }}>
                      {avatarSrc ? (
                        <AvatarImage src={avatarSrc} alt="Profile" className="object-cover" />
                      ) : null}
                      <AvatarFallback className="bg-white/5 text-white/70 text-lg font-semibold font-mono">
                        {session ? getInitials(session.name) : 'U'}
                      </AvatarFallback>
                    </Avatar>
                    {/* Camera icon overlay on hover */}
                    <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Camera className="h-5 w-5 text-white/80" />
                    </div>
                  </div>

                  {/* Controls */}
                  <div className="flex-1 space-y-2.5 pt-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-full btn-press text-xs"
                        onClick={() => {
                          const input = document.createElement('input');
                          input.type = 'file';
                          input.accept = '.jpg,.jpeg,.png,.webp';
                          input.onchange = () => {
                            const file = input.files?.[0];
                            if (file) handleAvatarFile(file);
                          };
                          input.click();
                        }}
                      >
                        <Upload className="h-3.5 w-3.5 mr-1.5" />Upload Photo
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-full btn-press text-xs"
                        onClick={() => setShowUrlInput(!showUrlInput)}
                      >
                        <Link2 className="h-3.5 w-3.5 mr-1.5" />Use URL
                      </Button>
                      {avatarSrc && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="rounded-full btn-press text-xs text-destructive hover:text-destructive"
                          onClick={removeAvatar}
                        >
                          <X className="h-3.5 w-3.5 mr-1.5" />Remove
                        </Button>
                      )}
                    </div>

                    {/* URL input */}
                    {showUrlInput && (
                      <div className="flex gap-2">
                        <Input
                          placeholder="https://gravatar.com/avatar/... or any image URL"
                          value={avatarUrlDraft}
                          onChange={e => setAvatarUrlDraft(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && handleAvatarUrl()}
                          className="glass-effect text-xs"
                        />
                        <Button onClick={handleAvatarUrl} size="sm" className="rounded-full btn-press shrink-0">
                          <Save className="h-3.5 w-3.5 mr-1.5" />Set
                        </Button>
                      </div>
                    )}

                    <p className="text-[11px] text-muted-foreground">
                      Max 500KB, JPG/PNG/WebP. Drag and drop or click the avatar to upload.
                    </p>
                  </div>
                </div>
              </div>

              <Separator />

              <div className="space-y-2">
                <Label htmlFor="display-name">Display Name</Label>
                <div className="flex gap-2">
                  <Input
                    id="display-name"
                    value={profileName}
                    onChange={e => setProfileName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && saveProfile()}
                    placeholder="Your name"
                    className="glass-effect"
                  />
                  <Button onClick={saveProfile} className="rounded-full btn-press shrink-0">
                    <Save className="h-4 w-4 mr-2" />Save
                  </Button>
                </div>
              </div>
              {session && (
                <>
                  <div className="space-y-2">
                    <Label>Email</Label>
                    <Input value={session.email} disabled className="glass-effect opacity-60 cursor-not-allowed" />
                    <p className="text-xs text-muted-foreground">Email is used as your identity key and cannot be changed.</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Role</Label>
                      <p className="text-sm font-medium capitalize">{session.role}</p>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Tier</Label>
                      <p className="text-sm font-medium capitalize">{session.tier}</p>
                    </div>
                    <div className="space-y-1 col-span-2">
                      <Label className="text-xs text-muted-foreground">Principal ID</Label>
                      <div
                        className="font-mono text-xs text-muted-foreground cursor-pointer hover:text-foreground flex items-center gap-1"
                        onClick={() => { navigator.clipboard.writeText(session.principalId); toast.success('Principal ID copied'); }}
                      >
                        <Copy className="h-3 w-3" />{session.principalId}
                      </div>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

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
                <SettingRow label="AI Insights" desc="Security recommendations from the Security Advisor" checked={cfg.notifications.aiInsights} onChange={v => patchNotif('aiInsights', v)} />
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

          {/* Post-Quantum Cryptography Readiness */}
          <Card className="border-border/40 glass-strong shadow-depth-md">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-violet-400/10"><Shield className="h-5 w-5 text-violet-400" /></div>
                <div>
                  <CardTitle className="text-base">Post-Quantum Cryptography</CardTitle>
                  <CardDescription>Crypto-agile architecture ready for NIST PQC standards</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Data at Rest', algo: 'AES-256-GCM', standard: 'FIPS 197', safe: true, note: 'Quantum-safe (256-bit symmetric)' },
                  { label: 'Key Derivation', algo: 'PBKDF2-SHA-256', standard: 'SP 800-132', safe: true, note: '310k iterations, quantum-safe' },
                  { label: 'HMAC (TOTP)', algo: 'HMAC-SHA-1', standard: 'RFC 2104', safe: true, note: '~80-bit post-quantum (acceptable)' },
                  { label: 'Passkey Signatures', algo: 'ECDSA P-256', standard: 'FIDO2', safe: false, note: 'PQC migration pending (FIDO Alliance)' },
                  { label: 'TLS Transport', algo: 'X25519MLKEM768', standard: 'Hybrid PQC', safe: true, note: 'Active in Chrome 131+ / Firefox 132+' },
                  { label: 'Architecture', algo: 'Crypto-Agile', standard: 'Internal', safe: true, note: 'Algorithm-tagged payloads, hot-swappable' },
                ].map(item => (
                  <div key={item.label} className="p-3 rounded-lg glass-effect border border-border/40">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-white/50">{item.label}</span>
                      <Badge variant="secondary" className={`text-[10px] ${item.safe ? 'text-emerald-400' : 'text-amber-400'}`}>
                        {item.safe ? 'Quantum Safe' : 'Migration Pending'}
                      </Badge>
                    </div>
                    <p className="text-sm font-medium text-white/80 font-mono">{item.algo}</p>
                    <p className="text-[10px] text-white/30 mt-0.5">{item.standard} · {item.note}</p>
                  </div>
                ))}
              </div>
              <div className="p-3 rounded-lg glass-effect text-xs text-white/30 space-y-1">
                <p className="flex items-center gap-1.5"><CheckCircle2 className="h-3 w-3 text-emerald-400" /> All symmetric encryption is quantum-resistant (AES-256)</p>
                <p className="flex items-center gap-1.5"><CheckCircle2 className="h-3 w-3 text-emerald-400" /> Algorithm metadata stored with every encrypted payload for seamless migration</p>
                <p className="flex items-center gap-1.5"><CheckCircle2 className="h-3 w-3 text-emerald-400" /> Ready for FIPS 203 (ML-KEM) hybrid encryption when browser support arrives</p>
                <p className="flex items-center gap-1.5"><AlertCircle className="h-3 w-3 text-amber-400" /> FIDO2 passkeys use ECDSA — PQC signatures expected 2028+ per FIDO Alliance roadmap</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Security Advisor ── */}
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

        {/* ── MFA ── */}
        <TabsContent value="mfa" className="space-y-6">
          <MFASetup />
          {/* Restart onboarding */}
          <div className="flex justify-end">
            <button
              onClick={() => { resetOnboarding(); window.location.reload(); }}
              className="text-xs text-white/25 hover:text-white/50 transition-colors flex items-center gap-1.5"
            >
              <HelpCircle className="h-3.5 w-3.5" />Restart onboarding walkthrough
            </button>
          </div>
        </TabsContent>

        {/* ── Integrations ── */}
        <TabsContent value="integrations" className="space-y-6">
          {/* SSO Configuration */}
          <Card className="border-border/40 glass-strong shadow-depth-md">
            <CardHeader>
              <CardTitle>SSO & Billing Configuration</CardTitle>
              <CardDescription>Configure Google, Apple SSO and Stripe billing. These keys are stored locally in your browser.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Google OAuth */}
              <div className="p-4 rounded-xl border border-border/40 glass-effect shadow-depth-sm space-y-3">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-blue-500/10 shadow-depth-sm">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="shrink-0">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 001 12c0 1.77.42 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <h4 className="font-semibold text-sm">Google OAuth</h4>
                      <Badge
                        variant={googleClientId ? 'default' : 'secondary'}
                        className="text-xs"
                      >
                        {googleClientId ? 'Configured' : 'Not configured'}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">Enable "Continue with Google" on the login page</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Input
                    placeholder="Google OAuth Client ID (e.g., 123456.apps.googleusercontent.com)"
                    value={googleClientId}
                    onChange={e => setGoogleClientIdState(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && saveGoogleConfig()}
                    className="glass-effect text-xs font-mono"
                  />
                  <Button onClick={saveGoogleConfig} size="sm" className="rounded-full btn-press shrink-0">
                    <Save className="h-3.5 w-3.5 mr-1.5" />Save
                  </Button>
                </div>
              </div>

              {/* Apple Sign In */}
              <div className="p-4 rounded-xl border border-border/40 glass-effect shadow-depth-sm space-y-3">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-white/10 shadow-depth-sm">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" className="text-white/80 shrink-0">
                      <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <h4 className="font-semibold text-sm">Apple Sign In</h4>
                      <Badge
                        variant={appleClientId ? 'default' : 'secondary'}
                        className="text-xs"
                      >
                        {appleClientId ? 'Configured' : 'Not configured'}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">Enable "Continue with Apple" on the login page</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Input
                    placeholder="Apple Services ID (e.g., com.example.signin)"
                    value={appleClientId}
                    onChange={e => setAppleClientIdState(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && saveAppleConfig()}
                    className="glass-effect text-xs font-mono"
                  />
                  <Button onClick={saveAppleConfig} size="sm" className="rounded-full btn-press shrink-0">
                    <Save className="h-3.5 w-3.5 mr-1.5" />Save
                  </Button>
                </div>
              </div>

              {/* Stripe */}
              <div className="p-4 rounded-xl border border-border/40 glass-effect shadow-depth-sm space-y-3">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-violet-500/10 shadow-depth-sm">
                    <CreditCard className="h-5 w-5 text-violet-400 shrink-0" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <h4 className="font-semibold text-sm">Stripe Billing</h4>
                      <Badge
                        variant={stripeKeyDraft ? 'default' : 'secondary'}
                        className="text-xs"
                      >
                        {stripeKeyDraft ? 'Configured' : 'Not configured'}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">Enable real payment processing on the Billing page</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Input
                    placeholder="Stripe Publishable Key (pk_test_... or pk_live_...)"
                    value={stripeKeyDraft}
                    onChange={e => setStripeKeyDraft(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && saveStripeConfig()}
                    className="glass-effect text-xs font-mono"
                  />
                  <Button onClick={saveStripeConfig} size="sm" className="rounded-full btn-press shrink-0">
                    <Save className="h-3.5 w-3.5 mr-1.5" />Save
                  </Button>
                </div>
              </div>

              <Separator />

              <div>
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Identity Provider Connections</h3>
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
              </div>
            </CardContent>
          </Card>

          {/* Email Service Configuration */}
          <Card className="border-border/40 glass-strong shadow-depth-md">
            <CardHeader>
              <CardTitle>Email Service</CardTitle>
              <CardDescription>Configure email for invites and notifications</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label className="text-sm">Provider</Label>
                <Select
                  defaultValue={(() => { try { return JSON.parse(localStorage.getItem('nexus-email-config') ?? '{}').provider || 'none'; } catch { return 'none'; } })()}
                  onValueChange={(v) => {
                    const existing = (() => { try { return JSON.parse(localStorage.getItem('nexus-email-config') ?? '{}'); } catch { return {}; } })();
                    localStorage.setItem('nexus-email-config', JSON.stringify({ ...existing, provider: v, fromEmail: existing.fromEmail || 'noreply@nexus-identity.io', fromName: existing.fromName || 'Nexus Identity' }));
                  }}
                >
                  <SelectTrigger className="glass-effect w-48"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Not configured</SelectItem>
                    <SelectItem value="brevo">Brevo (300/day free)</SelectItem>
                    <SelectItem value="resend">Resend (100/day free)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-sm">API Key</Label>
                <div className="flex gap-2">
                  <Input
                    type="password"
                    placeholder="Enter your API key"
                    className="glass-effect flex-1"
                    defaultValue={(() => { try { return JSON.parse(localStorage.getItem('nexus-email-config') ?? '{}').apiKey || ''; } catch { return ''; } })()}
                    onChange={(e) => {
                      const existing = (() => { try { return JSON.parse(localStorage.getItem('nexus-email-config') ?? '{}'); } catch { return {}; } })();
                      const key = e.target.value.trim();
                      const provider = existing.provider || (key.startsWith('xkeysib-') ? 'brevo' : key.startsWith('re_') ? 'resend' : existing.provider || 'none');
                      localStorage.setItem('nexus-email-config', JSON.stringify({ ...existing, provider: key ? provider : 'none', apiKey: key }));
                    }}
                  />
                  <Button variant="outline" size="sm" className="rounded-full btn-press" onClick={() => {
                    const cfg = (() => { try { return JSON.parse(localStorage.getItem('nexus-email-config') ?? '{}'); } catch { return {}; } })();
                    toast.success(cfg.apiKey ? `Email configured with ${cfg.provider} (${cfg.provider === 'brevo' ? '300' : '100'}/day free)` : 'Email service not configured');
                  }}>
                    Save
                  </Button>
                </div>
                <p className="text-xs text-white/30">
                  Brevo: get key at brevo.com → SMTP & API → API Keys. Resend: get key at resend.com → API Keys.
                </p>
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
