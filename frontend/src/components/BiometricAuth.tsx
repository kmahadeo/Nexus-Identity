import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Fingerprint, Eye, Shield, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { useInternetIdentity } from '../hooks/useInternetIdentity';
import { useAddPasskeyCredential, useGetPasskeyCount } from '../hooks/useQueries';
import { isWebAuthnSupported, createPasskey } from '../lib/webauthn';

export default function BiometricAuth() {
  const { identity } = useInternetIdentity();
  const { data: passkeyCount = 0 } = useGetPasskeyCount();
  const { mutateAsync: addPasskey } = useAddPasskeyCredential();
  const [isSettingUp, setIsSettingUp] = useState(false);
  const webAuthnSupported = isWebAuthnSupported();

  const handleSetupBiometric = async () => {
    if (!webAuthnSupported) {
      toast.error('WebAuthn not supported in this browser');
      return;
    }
    setIsSettingUp(true);
    try {
      const userId = identity?.getPrincipal().toText() || 'anonymous';
      const result = await createPasskey(userId, userId);
      await addPasskey({
        credentialId: result.credentialId,
        publicKeyHint: result.publicKeyHint,
        deviceName: result.deviceName,
        createdAt: BigInt(Date.now() * 1000000),
        lastUsed: BigInt(Date.now() * 1000000),
        transports: result.transports,
      });
      toast.success('Biometric passkey registered on-chain');
    } catch (error: any) {
      if (error?.name === 'NotAllowedError') {
        toast.error('Setup was cancelled');
      } else {
        toast.error(error?.message || 'Failed to set up biometric');
      }
    } finally {
      setIsSettingUp(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">Biometric Authentication</h1>
        <p className="text-muted-foreground">Fingerprint and face recognition security via WebAuthn</p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <Card className="border-border/40 glass-strong shadow-depth-md">
          <CardHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-3 rounded-xl bg-blue-500/20">
                <Fingerprint className="h-6 w-6 text-blue-500" />
              </div>
              <div>
                <CardTitle>Biometric Setup</CardTitle>
                <CardDescription>Register a platform passkey using your device's biometric sensor</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button
              className="w-full rounded-full bg-blue-500 hover:bg-blue-600"
              onClick={handleSetupBiometric}
              disabled={isSettingUp || !webAuthnSupported}
            >
              {isSettingUp ? (
                <>
                  <div className="h-4 w-4 mr-2 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Waiting for browser...
                </>
              ) : (
                <>
                  <Fingerprint className="h-4 w-4 mr-2" />
                  {passkeyCount > 0 ? 'Add Another Biometric' : 'Setup Fingerprint'}
                </>
              )}
            </Button>
            <Button
              className="w-full rounded-full bg-gradient-to-r from-primary to-accent hover:opacity-90"
              onClick={handleSetupBiometric}
              disabled={isSettingUp || !webAuthnSupported}
            >
              <Eye className="h-4 w-4 mr-2" />
              {passkeyCount > 0 ? 'Add Face ID Passkey' : 'Setup Face Recognition'}
            </Button>

            {passkeyCount > 0 && (
              <div className="p-3 rounded-lg bg-success/10 border border-success/20">
                <p className="text-sm text-success font-medium flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4" />
                  {passkeyCount} biometric passkey{passkeyCount !== 1 ? 's' : ''} registered
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/40 glass-strong shadow-depth-md gradient-success">
          <CardHeader>
            <CardTitle>Security Benefits</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <BenefitItem
                icon={Shield}
                title="Unique Identity"
                description="Your biometrics are unique and cannot be replicated"
              />
              <BenefitItem
                icon={CheckCircle2}
                title="No Passwords"
                description="Eliminate password vulnerabilities completely"
              />
              <BenefitItem
                icon={Fingerprint}
                title="Instant Access"
                description="Quick authentication without typing"
              />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/40 glass-strong shadow-depth-md">
        <CardHeader>
          <CardTitle>Browser Support</CardTitle>
          <CardDescription>
            Biometric authentication uses your device's built-in sensors through the WebAuthn API.
            Supported on modern browsers with platform authenticators.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className={`p-4 rounded-lg ${webAuthnSupported ? 'bg-success/10 border border-success/20' : 'bg-destructive/10 border border-destructive/20'}`}>
            <p className={`text-sm ${webAuthnSupported ? 'text-success' : 'text-destructive'}`}>
              {webAuthnSupported
                ? '✓ WebAuthn API available • Platform authenticators supported • Secure credential storage enabled'
                : '✗ WebAuthn is not supported in this browser. Please use a modern browser like Chrome, Safari, or Firefox.'}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function BenefitItem({ icon: Icon, title, description }: any) {
  return (
    <div className="flex items-start gap-3">
      <div className="p-2 rounded-lg bg-green-500/20 mt-1">
        <Icon className="h-5 w-5 text-green-500" />
      </div>
      <div>
        <h4 className="font-semibold mb-1">{title}</h4>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}
