/**
 * VaultUnlockGate.tsx — Passkey + TOTP re-authentication gate.
 *
 * Replaces the old master-password gate with passwordless verification.
 * Users choose between passkey (FIDO2/WebAuthn) or TOTP authenticator app.
 */

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Fingerprint, Smartphone, ShieldCheck, AlertCircle, ShieldOff } from 'lucide-react';
import { toast } from 'sonner';
import { isVaultUnlocked, markVaultVerified } from './lib/vaultCrypto';
import { authenticatePasskey, hasRegisteredPasskeys } from './lib/webauthn';
import { totpStorage, verifyTOTP } from './lib/totp';
import { sessionStorage_ } from './lib/storage';

interface Props {
  /** Called when the user successfully authenticates. */
  onUnlock: () => void;
  onCancel: () => void;
  /** 'unlock' = full vault unlock, 'reveal' = single secret reveal */
  mode?: 'unlock' | 'reveal';
}

type AuthMethod = 'passkey' | 'totp';

export default function VaultUnlockGate({ onUnlock, onCancel, mode = 'unlock' }: Props) {
  const [selectedMethod, setSelectedMethod] = useState<AuthMethod | null>(null);
  const [totpCode, setTotpCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState('');

  const session = sessionStorage_.get();
  const principalId = session?.principalId ?? '';
  const hasPasskeys = hasRegisteredPasskeys(principalId);
  const hasTotp = totpStorage.getAll(principalId).some(c => c.verified);
  const hasAnyMethod = hasPasskeys || hasTotp;

  // If already unlocked within the session window, just pass through
  if (isVaultUnlocked()) {
    onUnlock();
    return null;
  }

  const handlePasskeyAuth = async () => {
    setError('');
    setVerifying(true);
    try {
      await authenticatePasskey(undefined, principalId);
      markVaultVerified();
      toast.success('Identity verified with passkey');
      onUnlock();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Passkey verification failed';
      setError(msg);
    } finally {
      setVerifying(false);
    }
  };

  const handleTotpAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!totpCode.trim() || totpCode.trim().length !== 6) {
      setError('Enter a valid 6-digit authenticator code');
      return;
    }

    setVerifying(true);
    try {
      const creds = totpStorage.getAll(principalId).filter(c => c.verified);
      let valid = false;
      for (const cred of creds) {
        if (await verifyTOTP(cred.secret, totpCode.trim())) {
          valid = true;
          break;
        }
      }
      if (!valid) {
        setError('Invalid authenticator code');
        return;
      }
      markVaultVerified();
      toast.success('Identity verified with authenticator app');
      onUnlock();
    } catch {
      setError('Verification failed — please try again');
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(12px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div
        className="w-full max-w-sm rounded-2xl animate-fade-in overflow-hidden"
        style={{
          background: 'linear-gradient(135deg, rgba(15,15,28,0.99) 0%, rgba(8,8,18,0.99) 100%)',
          border: '1px solid rgba(255,255,255,0.08)',
          boxShadow: '0 32px 64px rgba(0,0,0,0.6)',
        }}
      >
        {/* Header */}
        <div className="p-6 pb-0 text-center">
          <div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, rgba(139,92,246,0.2), rgba(59,130,246,0.15))' }}>
            <ShieldCheck className="h-8 w-8 text-violet-400" />
          </div>
          <h2 className="text-lg font-semibold text-white/90 mb-1">
            {mode === 'reveal' ? 'Verify Identity' : 'Unlock Vault'}
          </h2>
          <p className="text-sm text-white/40">
            {mode === 'reveal'
              ? 'Re-authenticate to view this secret'
              : 'Verify your identity to access the vault'}
          </p>
        </div>

        <div className="p-6 space-y-4">
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
              <AlertCircle className="h-4 w-4 text-red-400 shrink-0" />
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          {/* No methods available */}
          {!hasAnyMethod && (
            <div className="text-center py-4 space-y-3">
              <div className="w-12 h-12 rounded-xl mx-auto flex items-center justify-center bg-amber-500/10">
                <ShieldOff className="h-6 w-6 text-amber-400" />
              </div>
              <p className="text-sm text-white/50">
                Register a passkey or set up TOTP in your security settings to protect your vault.
              </p>
              <Button
                type="button"
                variant="outline"
                onClick={onCancel}
                className="rounded-full btn-press"
              >
                Go Back
              </Button>
            </div>
          )}

          {/* Method selection — show when no method is chosen yet */}
          {hasAnyMethod && !selectedMethod && (
            <div className="space-y-3">
              {hasPasskeys && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedMethod('passkey');
                    setError('');
                    // Immediately trigger passkey prompt
                    handlePasskeyAuth();
                  }}
                  disabled={verifying}
                  className="w-full flex items-center gap-4 p-4 rounded-xl border border-violet-500/20 bg-violet-500/5 hover:bg-violet-500/10 transition-colors text-left group"
                >
                  <div className="p-3 rounded-xl bg-violet-500/15 group-hover:bg-violet-500/25 transition-colors">
                    <Fingerprint className="h-6 w-6 text-violet-400" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-white/90">Verify with Passkey</p>
                    <p className="text-xs text-white/40">Touch ID, Face ID, or security key</p>
                  </div>
                  {hasPasskeys && !hasTotp && (
                    <span className="text-[10px] text-violet-400 font-medium uppercase tracking-wider">Recommended</span>
                  )}
                </button>
              )}

              {hasTotp && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedMethod('totp');
                    setError('');
                  }}
                  disabled={verifying}
                  className="w-full flex items-center gap-4 p-4 rounded-xl border border-blue-500/20 bg-blue-500/5 hover:bg-blue-500/10 transition-colors text-left group"
                >
                  <div className="p-3 rounded-xl bg-blue-500/15 group-hover:bg-blue-500/25 transition-colors">
                    <Smartphone className="h-6 w-6 text-blue-400" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-white/90">Use Authenticator App</p>
                    <p className="text-xs text-white/40">Enter a 6-digit code from your app</p>
                  </div>
                </button>
              )}

              <div className="pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={onCancel}
                  className="w-full rounded-full btn-press"
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {/* Passkey in-progress state */}
          {selectedMethod === 'passkey' && (
            <div className="text-center py-4 space-y-4">
              {verifying ? (
                <>
                  <div className="h-8 w-8 border-2 border-violet-400/30 border-t-violet-400 rounded-full animate-spin mx-auto" />
                  <p className="text-sm text-white/50">Waiting for passkey verification...</p>
                </>
              ) : (
                <>
                  <p className="text-sm text-white/50">Passkey prompt dismissed. Try again?</p>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => { setSelectedMethod(null); setError(''); }}
                      className="flex-1 rounded-full btn-press"
                    >
                      Back
                    </Button>
                    <Button
                      type="button"
                      onClick={handlePasskeyAuth}
                      className="flex-1 rounded-full btn-press"
                      style={{ background: 'linear-gradient(135deg, rgba(139,92,246,0.9), rgba(167,139,250,0.8))', border: 'none' }}
                    >
                      Retry Passkey
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* TOTP code entry */}
          {selectedMethod === 'totp' && (
            <form onSubmit={handleTotpAuth} className="space-y-4">
              <div className="space-y-2">
                <Label className="text-xs text-white/50 flex items-center gap-1.5">
                  <Smartphone className="h-3.5 w-3.5" />
                  Authenticator Code
                </Label>
                <Input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="6-digit code"
                  className="glass-effect text-center text-lg font-mono tracking-[0.3em]"
                  autoFocus
                />
              </div>

              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => { setSelectedMethod(null); setTotpCode(''); setError(''); }}
                  className="flex-1 rounded-full btn-press"
                >
                  Back
                </Button>
                <Button
                  type="submit"
                  disabled={verifying || totpCode.length !== 6}
                  className="flex-1 rounded-full btn-press"
                  style={{ background: 'linear-gradient(135deg, rgba(59,130,246,0.9), rgba(96,165,250,0.8))', border: 'none' }}
                >
                  {verifying
                    ? <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    : 'Verify'}
                </Button>
              </div>
            </form>
          )}

          {/* Security note */}
          {hasAnyMethod && !selectedMethod && (
            <div className="p-3 rounded-lg glass-effect text-xs text-white/30 space-y-1">
              <p className="flex items-center gap-1.5"><ShieldCheck className="h-3 w-3 text-emerald-400" /> AES-256-GCM encryption</p>
              <p className="flex items-center gap-1.5"><ShieldCheck className="h-3 w-3 text-emerald-400" /> Passwordless verification</p>
              <p className="flex items-center gap-1.5"><ShieldCheck className="h-3 w-3 text-emerald-400" /> Session cached for 5 minutes</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
