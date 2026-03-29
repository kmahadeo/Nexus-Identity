import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Key, Fingerprint, Shield, CheckCircle2, Smartphone, Laptop, AlertCircle,
  Zap, Lock, Globe, Trash2, RefreshCw, Copy, Clock, Cpu,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  loadPasskeys, deletePasskey, registerPasskey, authenticatePasskey,
  isWebAuthnAvailable, isPlatformAuthenticatorAvailable,
  type StoredPasskey,
} from './lib/webauthn';
import { useInternetIdentity } from './hooks/useInternetIdentity';
import { useGetDashboardData } from './hooks/useQueries';

export default function PasskeysView() {
  const { session } = useInternetIdentity();
  const { refetch: refetchDash } = useGetDashboardData();

  const [passkeys, setPasskeys]           = useState<StoredPasskey[]>([]);
  const [platformAvail, setPlatformAvail] = useState<boolean | null>(null);
  const [webAuthnAvail, setWebAuthnAvail] = useState(false);
  const [isCreating, setIsCreating]       = useState(false);
  const [isAuthing, setIsAuthing]         = useState(false);
  const [lastAuthResult, setLastAuthResult] = useState<'success' | 'fail' | null>(null);

  useEffect(() => {
    setPasskeys(loadPasskeys());
    setWebAuthnAvail(isWebAuthnAvailable());
    isPlatformAuthenticatorAvailable().then(setPlatformAvail);
  }, []);

  const reload = () => setPasskeys(loadPasskeys());

  /* ── Register new passkey ── */
  const handleCreate = async (attachment: AuthenticatorAttachment = 'platform') => {
    if (!webAuthnAvail) { toast.error('WebAuthn is not supported in this browser.'); return; }
    setIsCreating(true);
    try {
      const stored = await registerPasskey(
        session?.principalId ?? crypto.randomUUID(),
        session?.email       ?? 'user@nexus.io',
        session?.name        ?? 'Nexus User',
        attachment,
      );
      reload();
      refetchDash();
      toast.success(`Passkey "${stored.name}" registered successfully`);
    } catch (err: any) {
      const msg = err?.message ?? 'Passkey creation failed.';
      if (msg.includes('cancel') || msg.includes('abort')) {
        toast.info('Passkey creation was cancelled.');
      } else {
        toast.error(msg);
      }
    } finally {
      setIsCreating(false);
    }
  };

  /* ── Authenticate with existing passkey ── */
  const handleAuthenticate = async () => {
    if (!webAuthnAvail) { toast.error('WebAuthn is not supported in this browser.'); return; }
    if (passkeys.length === 0) { toast.error('No passkeys registered — create one first.'); return; }
    setIsAuthing(true);
    setLastAuthResult(null);
    try {
      const credId = await authenticatePasskey(passkeys.map(k => k.id));
      reload();
      setLastAuthResult('success');
      toast.success('Authentication successful', { description: `Credential: ${credId.slice(0, 12)}…` });
    } catch (err: any) {
      const msg = err?.message ?? 'Authentication failed.';
      if (msg.includes('cancel') || msg.includes('abort')) {
        toast.info('Authentication was cancelled.');
      } else {
        setLastAuthResult('fail');
        toast.error(msg);
      }
    } finally {
      setIsAuthing(false);
    }
  };

  /* ── Revoke passkey ── */
  const handleRevoke = (id: string, name: string) => {
    deletePasskey(id);
    reload();
    refetchDash();
    toast.success(`Passkey "${name}" revoked`);
  };

  /* ── Copy credential ID ── */
  const copyId = (id: string) => {
    navigator.clipboard.writeText(id).then(() => toast.success('Credential ID copied'));
  };

  const strengthPct = passkeys.length === 0 ? 0 : Math.min(100, passkeys.length * 33);

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold mb-2">Passkeys & WebAuthn</h1>
        <p className="text-muted-foreground">FIDO2 passwordless authentication bound to your device's secure enclave</p>
      </div>

      {/* Status banner */}
      <Card className={`border-border/40 glass-strong shadow-depth-md ${webAuthnAvail ? (passkeys.length > 0 ? 'gradient-success' : 'gradient-primary') : 'from-destructive/15 to-destructive/5'}`}>
        <CardContent className="p-5">
          <div className="flex items-center gap-4">
            <div className={`p-3 rounded-xl shadow-depth-sm ${webAuthnAvail ? 'bg-success/20' : 'bg-destructive/20'}`}>
              {webAuthnAvail
                ? <CheckCircle2 className="h-6 w-6 text-success" />
                : <AlertCircle className="h-6 w-6 text-destructive" />}
            </div>
            <div className="flex-1">
              <h3 className="font-semibold mb-0.5">
                {!webAuthnAvail
                  ? 'WebAuthn not supported in this browser'
                  : passkeys.length === 0
                    ? 'WebAuthn ready — no passkeys registered yet'
                    : `${passkeys.length} passkey${passkeys.length !== 1 ? 's' : ''} registered`}
              </h3>
              <p className="text-sm text-muted-foreground">
                {!webAuthnAvail
                  ? 'Use Chrome, Firefox, Safari or Edge to register passkeys.'
                  : platformAvail === true
                    ? 'Platform authenticator available (Touch ID / Face ID / Windows Hello)'
                    : platformAvail === false
                      ? 'No platform authenticator — use a hardware security key'
                      : 'Checking for platform authenticator…'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {webAuthnAvail && (
                <Badge variant="secondary" className="font-mono text-xs">
                  <Zap className="h-3 w-3 mr-1" />
                  FIDO2
                </Badge>
              )}
              {platformAvail && (
                <Badge variant="secondary" className="font-mono text-xs">
                  <Cpu className="h-3 w-3 mr-1" />
                  Platform
                </Badge>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="passkeys" className="space-y-6">
        <TabsList className="glass-effect border border-border/40">
          <TabsTrigger value="passkeys">Passkeys</TabsTrigger>
          <TabsTrigger value="authenticate">Authenticate</TabsTrigger>
          <TabsTrigger value="devices">Devices</TabsTrigger>
          <TabsTrigger value="about">About FIDO2</TabsTrigger>
        </TabsList>

        {/* ── Passkeys tab ── */}
        <TabsContent value="passkeys" className="space-y-6">
          <div className="grid md:grid-cols-2 gap-6">
            {/* Create */}
            <Card className="border-border/40 glass-strong shadow-depth-md card-tactile gradient-primary">
              <CardHeader>
                <div className="flex items-center gap-3 mb-1">
                  <div className="p-3 rounded-xl bg-primary/20 shadow-depth-sm"><Key className="h-6 w-6 text-primary" /></div>
                  <div>
                    <CardTitle>Register Passkey</CardTitle>
                    <CardDescription>Add a new FIDO2 credential to this device</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Security coverage</span>
                    <span className="font-mono text-xs">{strengthPct}%</span>
                  </div>
                  <Progress value={strengthPct} className="h-2" />
                </div>
                <div className="space-y-2">
                  <Button
                    onClick={() => handleCreate('platform')}
                    disabled={isCreating || !webAuthnAvail}
                    className="w-full rounded-full bg-primary hover:bg-primary/90 btn-press"
                  >
                    {isCreating ? (
                      <><div className="h-4 w-4 mr-2 animate-spin rounded-full border-2 border-white border-t-transparent" />Creating…</>
                    ) : (
                      <><Fingerprint className="h-4 w-4 mr-2" />Platform Authenticator (Touch ID / Face ID)</>
                    )}
                  </Button>
                  <Button
                    onClick={() => handleCreate('cross-platform')}
                    disabled={isCreating || !webAuthnAvail}
                    variant="outline"
                    className="w-full rounded-full btn-press"
                  >
                    <Key className="h-4 w-4 mr-2" />Hardware Security Key (YubiKey etc.)
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Your browser will show a native prompt. The private key is generated inside your device's secure enclave and never transmitted.
                </p>
              </CardContent>
            </Card>

            {/* Revocation list */}
            <Card className="border-border/40 glass-strong shadow-depth-md">
              <CardHeader>
                <CardTitle>Credential Health</CardTitle>
                <CardDescription>{passkeys.length} credential{passkeys.length !== 1 ? 's' : ''} registered</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {[
                    { label: 'Passkeys registered', value: passkeys.length, ok: passkeys.length > 0 },
                    { label: 'Platform authenticator', value: platformAvail ? 'Available' : 'Not found', ok: !!platformAvail },
                    { label: 'Phishing resistance', value: 'Full', ok: true },
                    { label: 'Attestation', value: 'None (demo)', ok: true },
                  ].map(({ label, value, ok }) => (
                    <div key={label} className="flex items-center justify-between p-2.5 rounded-xl glass-effect border border-border/40">
                      <div className="flex items-center gap-2">
                        <div className={`h-2 w-2 rounded-full ${ok ? 'bg-success' : 'bg-warning'}`} />
                        <span className="text-sm">{label}</span>
                      </div>
                      <span className="text-xs font-mono text-muted-foreground">{String(value)}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Registered passkeys list */}
          <Card className="border-border/40 glass-strong shadow-depth-md">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Registered Passkeys</CardTitle>
                  <CardDescription>Manage your FIDO2 credentials</CardDescription>
                </div>
                <Button variant="ghost" size="sm" onClick={reload} className="rounded-full btn-press">
                  <RefreshCw className="h-4 w-4 mr-1.5" />Refresh
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {passkeys.length > 0 ? (
                <ScrollArea className="h-[320px]">
                  <div className="space-y-3 pr-2">
                    {passkeys.map(pk => (
                      <div key={pk.id} className="p-4 rounded-xl border border-border/40 glass-effect shadow-depth-sm card-tactile animate-slide-in">
                        <div className="flex items-start gap-3">
                          <div className="p-2.5 rounded-xl bg-primary/10 shadow-depth-sm mt-0.5">
                            {pk.type === 'platform' ? <Smartphone className="h-5 w-5 text-primary" /> : <Key className="h-5 w-5 text-primary" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <h4 className="font-semibold text-sm">{pk.name}</h4>
                              <Badge variant="secondary" className="text-xs capitalize">{pk.type}</Badge>
                            </div>
                            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                              <span className="flex items-center gap-1"><Clock className="h-3 w-3" />Created {new Date(pk.createdAt).toLocaleDateString()}</span>
                              <span className="flex items-center gap-1"><RefreshCw className="h-3 w-3" />Used {new Date(pk.lastUsedAt).toLocaleDateString()}</span>
                              <span className="flex items-center gap-1"><Shield className="h-3 w-3" />Count: {pk.signCount}</span>
                            </div>
                            <div className="mt-1.5 font-mono text-[10px] text-white/20 truncate">{pk.id.slice(0, 32)}…</div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full btn-press" onClick={() => copyId(pk.id)} title="Copy credential ID">
                              <Copy className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full btn-press hover:text-destructive" onClick={() => handleRevoke(pk.id, pk.name)} title="Revoke passkey">
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="p-6 rounded-2xl bg-primary/10 mb-4"><Key className="h-12 w-12 text-primary" /></div>
                  <h3 className="text-lg font-semibold mb-2">No passkeys yet</h3>
                  <p className="text-sm text-muted-foreground mb-4 max-w-xs">Register a passkey above to enable passwordless, phishing-proof authentication.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Authenticate tab ── */}
        <TabsContent value="authenticate" className="space-y-6">
          <Card className="border-border/40 glass-strong shadow-depth-md">
            <CardHeader>
              <div className="flex items-center gap-3 mb-1">
                <div className="p-3 rounded-xl bg-success/20 shadow-depth-sm"><Shield className="h-6 w-6 text-success" /></div>
                <div>
                  <CardTitle>Authenticate Now</CardTitle>
                  <CardDescription>Test passkey authentication using your registered credentials</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="p-4 rounded-xl glass-effect border border-border/40 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Available passkeys</span>
                  <Badge variant="secondary">{passkeys.length}</Badge>
                </div>
                <Progress value={passkeys.length > 0 ? 100 : 0} className="h-2" />
              </div>

              <Button
                onClick={handleAuthenticate}
                disabled={isAuthing || passkeys.length === 0 || !webAuthnAvail}
                className="w-full rounded-full btn-press shadow-lg"
                style={{ background: 'linear-gradient(135deg, rgba(34,197,94,0.8), rgba(16,185,129,0.8))' }}
              >
                {isAuthing ? (
                  <><div className="h-4 w-4 mr-2 animate-spin rounded-full border-2 border-white border-t-transparent" />Waiting for authenticator…</>
                ) : (
                  <><Shield className="h-4 w-4 mr-2" />Authenticate with Passkey</>
                )}
              </Button>

              {lastAuthResult === 'success' && (
                <div className="p-4 rounded-xl bg-success/10 border border-success/30 flex items-center gap-3">
                  <CheckCircle2 className="h-5 w-5 text-success shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-success">Authentication successful</p>
                    <p className="text-xs text-muted-foreground">Identity verified via FIDO2 assertion</p>
                  </div>
                </div>
              )}
              {lastAuthResult === 'fail' && (
                <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/30 flex items-center gap-3">
                  <AlertCircle className="h-5 w-5 text-destructive shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-destructive">Authentication failed</p>
                    <p className="text-xs text-muted-foreground">Biometric verification was unsuccessful</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Devices tab ── */}
        <TabsContent value="devices" className="space-y-6">
          <Card className="border-border/40 glass-strong shadow-depth-md">
            <CardHeader>
              <CardTitle>Registered Devices</CardTitle>
              <CardDescription>Devices with active FIDO2 credentials</CardDescription>
            </CardHeader>
            <CardContent>
              {passkeys.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">No devices registered yet. Create a passkey to add this device.</p>
              ) : (
                <div className="space-y-3">
                  {passkeys.map(pk => (
                    <div key={pk.id} className="p-4 rounded-xl border border-border/40 glass-effect shadow-depth-sm flex items-center gap-3">
                      <div className="p-2.5 rounded-xl bg-primary/10">
                        {pk.type === 'platform' ? <Laptop className="h-5 w-5 text-primary" /> : <Key className="h-5 w-5 text-primary" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm">{pk.name}</p>
                        <p className="text-xs text-muted-foreground font-mono">{pk.rpId} · alg {pk.algorithm}</p>
                      </div>
                      <Badge variant={pk.type === 'platform' ? 'default' : 'secondary'} className="text-xs shrink-0">
                        {pk.type}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid md:grid-cols-4 gap-4">
            {['Web', 'iOS', 'Android', 'Desktop'].map(p => (
              <Card key={p} className="border-border/40 glass-effect shadow-depth-sm card-tactile text-center">
                <CardContent className="p-4">
                  <Globe className="h-7 w-7 mx-auto mb-2 text-success" />
                  <h4 className="font-semibold text-sm mb-1">{p}</h4>
                  <Badge variant="default" className="text-xs">Supported</Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* ── About FIDO2 tab ── */}
        <TabsContent value="about" className="space-y-6">
          <Card className="border-border/40 glass-strong shadow-depth-md">
            <CardHeader>
              <CardTitle>How FIDO2 / WebAuthn Works</CardTitle>
              <CardDescription>The cryptographic protocol behind passkeys</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-2 gap-6">
                {[
                  { step: '1', title: 'Registration', desc: 'Your device generates a public/private key pair. The private key is stored in the secure enclave (TPM / Secure Element). The public key is sent to the server. Your biometric or PIN unlocks the private key locally — it never leaves your device.' },
                  { step: '2', title: 'Authentication', desc: 'The server sends a random challenge. Your device signs it with the private key (after biometric verification). The server verifies the signature using the stored public key. No password is transmitted — ever.' },
                  { step: '3', title: 'Phishing resistance', desc: 'The key pair is scoped to the exact origin (domain + scheme + port). A fake site cannot use your passkey for the real site. This makes passkeys fundamentally immune to credential phishing.' },
                  { step: '4', title: 'FIDO Alliance MDS', desc: 'The FIDO Metadata Service (mds.fidoalliance.org) provides authenticator metadata for attestation validation. In production, server-side attestation verifies the authenticator model and its security guarantees.' },
                ].map(({ step, title, desc }) => (
                  <div key={step} className="p-4 rounded-xl glass-effect border border-border/40">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="h-7 w-7 rounded-full bg-primary/20 flex items-center justify-center font-mono text-xs font-bold text-primary">{step}</div>
                      <h4 className="font-semibold">{title}</h4>
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
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
