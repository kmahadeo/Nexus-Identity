/**
 * MFASetup.tsx — TOTP authenticator app setup component.
 *
 * Renders inside SettingsPanel's MFA tab.
 * Supports Google Authenticator, Microsoft Authenticator, Duo, Okta Verify.
 */

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Smartphone, QrCode, CheckCircle2, Trash2, RefreshCw,
  Shield, AlertCircle, Phone, ChevronRight,
} from 'lucide-react';
import { toast } from 'sonner';
import QRCode from 'qrcode';
import {
  generateTOTPSecret, buildOTPAuthUri, verifyTOTP, totpStorage,
  generateTOTP, totpSecondsRemaining, type TOTPCredential,
} from './lib/totp';
import { sessionStorage_ } from './lib/storage';

/* ── App config ─────────────────────────────────────────────────────────── */

const AUTHENTICATOR_APPS = [
  { id: 'google',    label: 'Google Authenticator',    icon: '🔵' },
  { id: 'microsoft', label: 'Microsoft Authenticator', icon: '🟦' },
  { id: 'duo',       label: 'Duo Mobile',              icon: '🟢' },
  { id: 'okta',      label: 'Okta Verify',             icon: '🔷' },
  { id: 'authy',     label: 'Authy',                   icon: '🔴' },
  { id: 'other',     label: 'Other TOTP App',          icon: '⚪' },
];

/* ── Component ──────────────────────────────────────────────────────────── */

export default function MFASetup() {
  const session = sessionStorage_.get();
  const principalId = session?.principalId ?? 'local';
  const email = session?.email ?? 'user@nexus.io';

  const [creds, setCreds] = useState<TOTPCredential[]>(() => totpStorage.getAll(principalId));
  const [setupMode, setSetupMode]   = useState(false);
  const [selectedApp, setSelectedApp] = useState('google');
  const [secret, setSecret]         = useState('');
  const [qrDataUrl, setQrDataUrl]   = useState('');
  const [verifyCode, setVerifyCode] = useState('');
  const [verifying, setVerifying]   = useState(false);
  const [liveCode, setLiveCode]     = useState('');
  const [secondsLeft, setSecondsLeft] = useState(30);

  // Refresh TOTP list when principalId changes
  const refresh = useCallback(() => {
    setCreds(totpStorage.getAll(principalId));
  }, [principalId]);

  useEffect(() => { refresh(); }, [refresh]);

  // Live TOTP countdown for first verified credential (demo)
  useEffect(() => {
    if (creds.length === 0) return;
    const first = creds.find(c => c.verified);
    if (!first) return;
    let cancelled = false;

    const tick = async () => {
      if (cancelled) return;
      const code = await generateTOTP(first.secret);
      const secs = totpSecondsRemaining();
      setLiveCode(code);
      setSecondsLeft(secs);
    };

    tick();
    const id = setInterval(tick, 1000);
    return () => { cancelled = true; clearInterval(id); };
  }, [creds]);

  const startSetup = async () => {
    const newSecret = generateTOTPSecret();
    setSecret(newSecret);
    const uri = buildOTPAuthUri({
      issuer: 'Nexus Identity',
      accountName: email,
      secret: newSecret,
    });
    try {
      const dataUrl = await QRCode.toDataURL(uri, { width: 200, margin: 2, color: { dark: '#ffffff', light: '#00000000' } });
      setQrDataUrl(dataUrl);
    } catch {
      setQrDataUrl('');
    }
    setSetupMode(true);
    setVerifyCode('');
  };

  const cancelSetup = () => {
    setSetupMode(false);
    setSecret('');
    setQrDataUrl('');
    setVerifyCode('');
  };

  const confirmSetup = async () => {
    if (!verifyCode.trim()) { toast.error('Enter the 6-digit code from your authenticator app'); return; }
    setVerifying(true);
    try {
      const ok = await verifyTOTP(secret, verifyCode.trim());
      if (!ok) {
        toast.error('Incorrect code — check your app and try again');
        setVerifying(false);
        return;
      }
      const appMeta = AUTHENTICATOR_APPS.find(a => a.id === selectedApp);
      const cred: TOTPCredential = {
        id: crypto.randomUUID(),
        label: appMeta?.label ?? 'Authenticator App',
        app: selectedApp,
        secret,
        createdAt: Date.now(),
        verified: true,
      };
      totpStorage.add(principalId, cred);
      refresh();
      cancelSetup();
      toast.success(`${appMeta?.label ?? 'Authenticator'} added successfully`);
    } finally {
      setVerifying(false);
    }
  };

  const removeCredential = (id: string, label: string) => {
    totpStorage.remove(principalId, id);
    refresh();
    toast.success(`"${label}" removed`);
  };

  const progressColor = secondsLeft <= 5 ? '#f87171' : secondsLeft <= 10 ? '#fb923c' : '#34d399';

  return (
    <div className="space-y-6">
      {/* Header card */}
      <Card className="border-border/40 glass-strong shadow-depth-md">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-xl bg-primary/10"><Smartphone className="h-5 w-5 text-primary" /></div>
              <div>
                <CardTitle className="text-base">Authenticator Apps (TOTP)</CardTitle>
                <CardDescription>Add a second factor using any TOTP-compatible app</CardDescription>
              </div>
            </div>
            {!setupMode && (
              <Button onClick={startSetup} className="rounded-full btn-press" size="sm">
                <QrCode className="h-4 w-4 mr-2" />Add app
              </Button>
            )}
          </div>
        </CardHeader>

        {/* Setup flow */}
        {setupMode && (
          <CardContent className="space-y-5">
            <div className="p-3 rounded-xl text-xs glass-effect border border-border/40 text-white/50">
              <AlertCircle className="h-3.5 w-3.5 inline mr-1.5 text-amber-400" />
              Open your authenticator app and scan the QR code below. Your secret will only be shown once — save it in a secure place as a backup.
            </div>

            {/* App selector */}
            <div className="space-y-2">
              <Label>Authenticator app</Label>
              <Select value={selectedApp} onValueChange={setSelectedApp}>
                <SelectTrigger className="glass-effect">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AUTHENTICATOR_APPS.map(a => (
                    <SelectItem key={a.id} value={a.id}>{a.icon} {a.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* QR code */}
            <div className="flex flex-col items-center gap-3">
              {qrDataUrl ? (
                <div className="p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <img src={qrDataUrl} alt="TOTP QR Code" className="w-[180px] h-[180px]" />
                </div>
              ) : (
                <div className="w-[180px] h-[180px] rounded-xl bg-white/5 flex items-center justify-center">
                  <QrCode className="h-10 w-10 text-white/20" />
                </div>
              )}
              <p className="text-xs text-white/35">Scan with your authenticator app</p>
            </div>

            {/* Manual entry */}
            <details className="text-xs text-white/40">
              <summary className="cursor-pointer hover:text-white/60 transition-colors select-none">
                Can't scan? Enter code manually
              </summary>
              <div className="mt-2 p-3 rounded-lg glass-effect border border-border/40">
                <p className="text-[11px] text-white/30 mb-1">Account: {email}</p>
                <p className="text-[11px] text-white/30 mb-2">Issuer: Nexus Identity</p>
                <div
                  className="font-mono text-sm text-white/70 tracking-widest cursor-pointer hover:text-white/90"
                  onClick={() => { navigator.clipboard.writeText(secret); toast.success('Secret copied'); }}
                >
                  {secret.match(/.{1,4}/g)?.join(' ')}
                </div>
                <p className="text-[10px] text-white/20 mt-1">Click to copy · 30-second step · SHA-1 · 6 digits</p>
              </div>
            </details>

            {/* Verification */}
            <div className="space-y-2">
              <Label>Verify — enter the 6-digit code from your app</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="000000"
                  value={verifyCode}
                  onChange={e => setVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  onKeyDown={e => e.key === 'Enter' && confirmSetup()}
                  className="glass-effect font-mono text-center text-lg tracking-[0.4em] max-w-[160px]"
                  maxLength={6}
                  autoComplete="one-time-code"
                />
                <Button
                  onClick={confirmSetup}
                  disabled={verifyCode.length < 6 || verifying}
                  className="rounded-full btn-press"
                >
                  {verifying ? <RefreshCw className="h-4 w-4 animate-spin" /> : <><CheckCircle2 className="h-4 w-4 mr-2" />Confirm</>}
                </Button>
                <Button variant="ghost" onClick={cancelSetup} className="rounded-full btn-press text-white/40">
                  Cancel
                </Button>
              </div>
            </div>
          </CardContent>
        )}

        {/* Registered credentials */}
        {!setupMode && creds.length > 0 && (
          <CardContent className="space-y-3 pt-0">
            {creds.map(cred => {
              const app = AUTHENTICATOR_APPS.find(a => a.id === cred.app);
              return (
                <div
                  key={cred.id}
                  className="flex items-center justify-between p-4 rounded-xl glass-effect border border-border/40"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-emerald-400/10">
                      <Smartphone className="h-5 w-5 text-emerald-400" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium">{cred.label}</p>
                        {cred.verified && (
                          <Badge variant="secondary" className="text-emerald-400 text-xs">
                            <CheckCircle2 className="h-3 w-3 mr-1" />Verified
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-white/30">
                        {app?.icon} {app?.label ?? 'TOTP App'} · Added {new Date(cred.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeCredential(cred.id, cred.label)}
                    className="rounded-full btn-press text-white/30 hover:text-red-400"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              );
            })}

            {/* Live code preview for first verified cred */}
            {creds.some(c => c.verified) && (
              <div
                className="p-4 rounded-xl text-center"
                style={{ background: 'rgba(52,211,153,0.04)', border: '1px solid rgba(52,211,153,0.12)' }}
              >
                <p className="text-xs text-white/30 mb-1">Current TOTP code</p>
                <p className="font-mono text-3xl font-bold text-emerald-400 tracking-[0.3em]">
                  {liveCode.slice(0, 3)} {liveCode.slice(3)}
                </p>
                <div className="flex items-center justify-center gap-2 mt-2">
                  <div
                    className="h-1.5 w-1.5 rounded-full transition-all"
                    style={{ background: progressColor }}
                  />
                  <p className="text-xs" style={{ color: progressColor }}>
                    Refreshes in {secondsLeft}s
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        )}

        {/* Empty state */}
        {!setupMode && creds.length === 0 && (
          <CardContent className="py-8 text-center">
            <Smartphone className="h-10 w-10 text-white/15 mx-auto mb-3" />
            <p className="text-sm text-white/40 mb-1">No authenticator apps added</p>
            <p className="text-xs text-white/25">Add an app above to enable TOTP-based two-factor authentication</p>
          </CardContent>
        )}
      </Card>

      {/* Phone number stub */}
      <Card className="border-border/40 glass-strong shadow-depth-md">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-white/5"><Phone className="h-5 w-5 text-white/40" /></div>
            <div>
              <CardTitle className="text-base text-white/60">Phone Number (SMS / Call)</CardTitle>
              <CardDescription>Connect your phone via an external provider</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div
            className="p-4 rounded-xl text-sm text-white/40 flex items-center gap-3"
            style={{ background: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(255,255,255,0.08)' }}
          >
            <ChevronRight className="h-4 w-4 shrink-0 text-white/20" />
            <p>Connect your phone external provider here — Twilio, Vonage, or your preferred SMS/voice OTP service. Contact <span className="text-violet-400">support@nexus.io</span> to enable this for your organisation.</p>
          </div>
        </CardContent>
      </Card>

      {/* Security summary */}
      <Card className="border-border/40 glass-strong shadow-depth-md">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="h-4 w-4 text-violet-400" />MFA Security Level
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[
              { label: 'Passkeys (FIDO2)',    note: 'Strongest — phishing-proof',    color: 'text-emerald-400', check: true  },
              { label: 'TOTP Authenticator', note: 'Strong — offline second factor', color: 'text-amber-400',  check: creds.some(c => c.verified) },
              { label: 'SMS / Phone',        note: 'Fair — SIM-swap risk',          color: 'text-orange-400', check: false },
            ].map(row => (
              <div key={row.label} className="flex items-center justify-between p-2.5 rounded-lg">
                <div className="flex items-center gap-2">
                  {row.check
                    ? <CheckCircle2 className={`h-4 w-4 ${row.color}`} />
                    : <div className="h-4 w-4 rounded-full border border-white/15" />
                  }
                  <span className={`text-sm ${row.check ? 'text-white/70' : 'text-white/30'}`}>{row.label}</span>
                </div>
                <span className="text-xs text-white/25">{row.note}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
