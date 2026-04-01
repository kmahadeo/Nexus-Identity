import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Key, Fingerprint, Shield, CheckCircle2, Smartphone, Laptop, AlertCircle, Zap, Lock, Globe, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useInternetIdentity } from '../hooks/useInternetIdentity';
import { useGetPasskeyCredentials, useAddPasskeyCredential, useDeletePasskeyCredential } from '../hooks/useQueries';
import { isWebAuthnSupported, isPlatformAuthenticatorAvailable, createPasskey, authenticateWithPasskey } from '../lib/webauthn';
import type { PasskeyCredential } from '../backend';

export default function PasskeysView() {
  const { identity } = useInternetIdentity();
  const { data: passkeys = [], isLoading } = useGetPasskeyCredentials();
  const { mutateAsync: addPasskey } = useAddPasskeyCredential();
  const { mutateAsync: deletePasskey } = useDeletePasskeyCredential();

  const [isCreating, setIsCreating] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const webAuthnSupported = isWebAuthnSupported();

  const handleCreatePasskey = async () => {
    if (!webAuthnSupported) {
      toast.error('WebAuthn is not supported in this browser');
      return;
    }

    setIsCreating(true);
    try {
      const userId = identity?.getPrincipal().toText() || 'anonymous';
      const existingIds = passkeys.map((p) => p.credentialId);
      const result = await createPasskey(userId, userId, existingIds);

      const credential: PasskeyCredential = {
        credentialId: result.credentialId,
        publicKeyHint: result.publicKeyHint,
        deviceName: result.deviceName,
        createdAt: BigInt(Date.now() * 1000000),
        lastUsed: BigInt(Date.now() * 1000000),
        transports: result.transports,
      };

      await addPasskey(credential);
      toast.success('Passkey created and stored on-chain');
    } catch (error: any) {
      if (error?.message?.includes('already exists')) {
        toast.warning('A passkey is already registered on this device. You can manage it below.');
      } else if (error?.name === 'NotAllowedError') {
        toast.error('Passkey creation was cancelled');
      } else {
        toast.error(error?.message || 'Failed to create passkey');
      }
    } finally {
      setIsCreating(false);
    }
  };

  const handleAuthenticate = async () => {
    if (!webAuthnSupported) {
      toast.error('WebAuthn is not supported in this browser');
      return;
    }

    setIsAuthenticating(true);
    try {
      const credentialIds = passkeys.map((p) => p.credentialId);
      const result = await authenticateWithPasskey(credentialIds.length > 0 ? credentialIds : undefined);
      if (result.success) {
        toast.success('Authentication successful');
      }
    } catch (error: any) {
      if (error?.name === 'NotAllowedError') {
        toast.error('Authentication was cancelled');
      } else {
        toast.error(error?.message || 'Authentication failed');
      }
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleDelete = async (credentialId: string) => {
    try {
      await deletePasskey(credentialId);
      toast.success('Passkey removed');
    } catch {
      toast.error('Failed to remove passkey');
    }
    setDeleteTarget(null);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold mb-2">WebAuthn & Passkeys</h1>
        <p className="text-muted-foreground">Passwordless authentication with FIDO2 and biometric support</p>
      </div>

      {/* Status Banner */}
      <Card className={`border-border/40 glass-strong shadow-depth-md ${webAuthnSupported ? 'gradient-success' : 'gradient-warning'}`}>
        <CardContent className="p-6">
          <div className="flex items-center gap-4">
            {webAuthnSupported ? (
              <>
                <div className="p-3 rounded-xl bg-success/20 shadow-depth-sm">
                  <CheckCircle2 className="h-6 w-6 text-success" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold mb-1">WebAuthn Ready</h3>
                  <p className="text-sm text-muted-foreground">Your browser supports passwordless authentication</p>
                </div>
                <Badge variant="secondary" className="text-xs">
                  <Zap className="h-3 w-3 mr-1" />
                  Active
                </Badge>
              </>
            ) : (
              <>
                <div className="p-3 rounded-xl bg-warning/20 shadow-depth-sm">
                  <AlertCircle className="h-6 w-6 text-warning" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold mb-1">Limited Support</h3>
                  <p className="text-sm text-muted-foreground">WebAuthn may not be fully supported in this browser</p>
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="passkeys" className="space-y-6">
        <TabsList className="glass-effect border border-border/40">
          <TabsTrigger value="passkeys">Passkeys</TabsTrigger>
          <TabsTrigger value="devices">Devices</TabsTrigger>
        </TabsList>

        <TabsContent value="passkeys" className="space-y-6">
          {/* Quick Actions */}
          <div className="grid md:grid-cols-2 gap-6">
            <Card className="border-border/40 glass-strong shadow-depth-md card-tactile gradient-primary">
              <CardHeader>
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-3 rounded-xl bg-primary/20 shadow-depth-sm">
                    <Key className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <CardTitle>Create Passkey</CardTitle>
                    <CardDescription>Register a new passwordless credential via your browser</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Stored On-Chain</span>
                    <Badge variant="secondary">{passkeys.length} credential{passkeys.length !== 1 ? 's' : ''}</Badge>
                  </div>
                  <Progress value={Math.min(passkeys.length * 33, 100)} className="h-2" />
                </div>
                <Button
                  onClick={handleCreatePasskey}
                  disabled={isCreating || !webAuthnSupported}
                  className="w-full rounded-full bg-primary hover:bg-primary/90 btn-press"
                >
                  {isCreating ? (
                    <>
                      <div className="h-4 w-4 mr-2 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      Waiting for browser...
                    </>
                  ) : (
                    <>
                      <Key className="h-4 w-4 mr-2" />
                      Create Passkey
                      {passkeys.length > 0 && (
                        <Badge variant="secondary" className="ml-2 text-xs">{passkeys.length}</Badge>
                      )}
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>

            <Card className="border-border/40 glass-strong shadow-depth-md card-tactile gradient-success">
              <CardHeader>
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-3 rounded-xl bg-success/20 shadow-depth-sm">
                    <Shield className="h-6 w-6 text-success" />
                  </div>
                  <div>
                    <CardTitle>Authenticate</CardTitle>
                    <CardDescription>Test sign-in with your passkey</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Available Passkeys</span>
                    <Badge variant="secondary">{passkeys.length}</Badge>
                  </div>
                  <Progress value={passkeys.length > 0 ? 100 : 0} className="h-2" />
                </div>
                <Button
                  onClick={handleAuthenticate}
                  disabled={isAuthenticating || !webAuthnSupported || passkeys.length === 0}
                  variant="outline"
                  className="w-full rounded-full btn-press"
                >
                  {isAuthenticating ? (
                    <>
                      <div className="h-4 w-4 mr-2 animate-spin rounded-full border-2 border-current border-t-transparent" />
                      Authenticating...
                    </>
                  ) : (
                    <>
                      <Shield className="h-4 w-4 mr-2" />
                      Authenticate
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Registered Passkeys */}
          <Card className="border-border/40 glass-strong shadow-depth-md">
            <CardHeader>
              <CardTitle>Registered Passkeys</CardTitle>
              <CardDescription>Credentials stored on the Internet Computer</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary/30 border-t-primary" />
                </div>
              ) : passkeys.length > 0 ? (
                <ScrollArea className="h-[300px]">
                  <div className="space-y-3">
                    {passkeys.map((passkey) => (
                      <div
                        key={passkey.credentialId}
                        className="p-4 rounded-xl border border-border/40 glass-effect shadow-depth-sm card-tactile animate-slide-in"
                      >
                        <div className="flex items-start gap-3">
                          <div className="p-2.5 rounded-xl bg-primary/10 shadow-depth-sm">
                            {passkey.transports?.includes('internal') ? (
                              <Fingerprint className="h-5 w-5 text-primary" />
                            ) : (
                              <Key className="h-5 w-5 text-primary" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-2">
                              <h4 className="font-semibold">{passkey.deviceName}</h4>
                              <Badge variant="secondary" className="text-xs">
                                {passkey.transports?.includes('internal') ? 'Platform' : 'Cross-platform'}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-4 text-xs text-muted-foreground">
                              <span>Created: {new Date(Number(passkey.createdAt) / 1000000).toLocaleDateString()}</span>
                              <span>ID: {passkey.credentialId.slice(0, 12)}...</span>
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="rounded-full btn-press text-destructive hover:bg-destructive/10"
                            onClick={() => setDeleteTarget(passkey.credentialId)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="p-6 rounded-2xl bg-primary/10 mb-4">
                    <Key className="h-12 w-12 text-primary" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">No passkeys registered</h3>
                  <p className="text-sm text-muted-foreground mb-4 max-w-md">
                    Create your first passkey to enable passwordless authentication
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Security Benefits */}
          <Card className="border-border/40 glass-strong shadow-depth-md">
            <CardHeader>
              <CardTitle>Security Benefits</CardTitle>
              <CardDescription>Why passkey authentication is more secure</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-3 gap-4">
                <BenefitCard
                  icon={Lock}
                  title="Phishing Resistant"
                  description="Bound to origin, cannot be stolen"
                />
                <BenefitCard
                  icon={Zap}
                  title="Fast & Convenient"
                  description="Biometric or PIN authentication"
                />
                <BenefitCard
                  icon={Shield}
                  title="Hardware Protected"
                  description="Stored in secure enclave"
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="devices" className="space-y-6">
          <Card className="border-border/40 glass-strong shadow-depth-md">
            <CardHeader>
              <CardTitle>Registered Devices</CardTitle>
              <CardDescription>Devices with passkey credentials</CardDescription>
            </CardHeader>
            <CardContent>
              {passkeys.length > 0 ? (
                <div className="space-y-3">
                  {passkeys.map((passkey) => (
                    <DeviceCard
                      key={passkey.credentialId}
                      name={passkey.deviceName}
                      type={passkey.transports?.includes('internal') ? 'Platform' : 'Security Key'}
                      icon={passkey.transports?.includes('internal') ? Smartphone : Key}
                      createdAt={new Date(Number(passkey.createdAt) / 1000000).toLocaleDateString()}
                    />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">No devices registered yet. Create a passkey to get started.</p>
              )}
            </CardContent>
          </Card>

          <Card className="border-border/40 glass-strong shadow-depth-md">
            <CardHeader>
              <CardTitle>Cross-Platform Support</CardTitle>
              <CardDescription>WebAuthn works across all your devices</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-4 gap-4">
                <PlatformCard platform="Web" supported />
                <PlatformCard platform="iOS" supported />
                <PlatformCard platform="Android" supported />
                <PlatformCard platform="Desktop" supported />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Passkey</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the passkey credential from your on-chain storage. The credential on your device will remain but won't be recognized by Nexus Identity.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteTarget && handleDelete(deleteTarget)}>
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function BenefitCard({ icon: Icon, title, description }: any) {
  return (
    <div className="p-4 rounded-xl glass-effect border border-border/40 shadow-depth-sm card-tactile">
      <div className="p-2.5 rounded-xl bg-primary/10 mb-3 inline-block">
        <Icon className="h-5 w-5 text-primary" />
      </div>
      <h4 className="font-semibold mb-1 text-sm">{title}</h4>
      <p className="text-xs text-muted-foreground">{description}</p>
    </div>
  );
}

function DeviceCard({ name, type, icon: Icon, createdAt }: any) {
  return (
    <div className="p-4 rounded-xl border border-border/40 glass-effect shadow-depth-sm card-tactile">
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-primary/10 shadow-depth-sm">
          <Icon className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h4 className="font-semibold text-sm">{name}</h4>
            <Badge variant="secondary" className="text-xs">{type}</Badge>
          </div>
          <p className="text-xs text-muted-foreground">Registered: {createdAt}</p>
        </div>
      </div>
    </div>
  );
}

function PlatformCard({ platform, supported }: { platform: string; supported: boolean }) {
  return (
    <div className={`p-4 rounded-xl border border-border/40 glass-effect shadow-depth-sm text-center ${supported ? 'gradient-success' : 'opacity-50'}`}>
      <Globe className={`h-8 w-8 mx-auto mb-2 ${supported ? 'text-success' : 'text-muted-foreground'}`} />
      <h4 className="font-semibold text-sm mb-1">{platform}</h4>
      <Badge variant={supported ? 'default' : 'secondary'} className="text-xs">
        {supported ? 'Supported' : 'Coming Soon'}
      </Badge>
    </div>
  );
}
