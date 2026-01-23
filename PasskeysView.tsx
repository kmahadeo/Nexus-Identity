import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Key, Fingerprint, Shield, CheckCircle2, Smartphone, Laptop, AlertCircle, Zap, Lock, Globe } from 'lucide-react';
import { toast } from 'sonner';

export default function PasskeysView() {
  const [isCreating, setIsCreating] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [registeredPasskeys, setRegisteredPasskeys] = useState<any[]>([]);
  const [webAuthnSupported, setWebAuthnSupported] = useState(true);

  // Check WebAuthn support
  useState(() => {
    const supported = window.PublicKeyCredential !== undefined;
    setWebAuthnSupported(supported);
  });

  const handleCreatePasskey = async () => {
    if (!webAuthnSupported) {
      toast.error('WebAuthn is not supported in this browser');
      return;
    }

    setIsCreating(true);
    try {
      // Simulate WebAuthn registration flow
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      const newPasskey = {
        id: `passkey-${Date.now()}`,
        name: `${navigator.platform} - ${new Date().toLocaleDateString()}`,
        createdAt: Date.now(),
        lastUsed: Date.now(),
        type: 'platform',
        device: navigator.platform,
      };
      
      setRegisteredPasskeys([...registeredPasskeys, newPasskey]);
      toast.success('Passkey created successfully!');
    } catch (error) {
      toast.error('Failed to create passkey');
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
      // Simulate WebAuthn authentication flow
      await new Promise(resolve => setTimeout(resolve, 1000));
      toast.success('Authentication successful!');
    } catch (error) {
      toast.error('Authentication failed');
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleBiometricSetup = async (type: 'fingerprint' | 'face') => {
    toast.info(`${type === 'fingerprint' ? 'Fingerprint' : 'Face recognition'} setup initiated`);
    try {
      await new Promise(resolve => setTimeout(resolve, 1500));
      toast.success(`${type === 'fingerprint' ? 'Fingerprint' : 'Face recognition'} configured successfully`);
    } catch (error) {
      toast.error('Biometric setup failed');
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold mb-2">WebAuthn & Passkeys</h1>
        <p className="text-muted-foreground">Next-generation passwordless authentication with FIDO2 and biometric support</p>
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
          <TabsTrigger value="biometric">Biometric Auth</TabsTrigger>
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
                    <CardDescription>Register a new passwordless credential</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Security Level</span>
                    <Badge variant="secondary">Enterprise</Badge>
                  </div>
                  <Progress value={95} className="h-2" />
                </div>
                <Button 
                  onClick={handleCreatePasskey}
                  disabled={isCreating || !webAuthnSupported}
                  className="w-full rounded-full bg-primary hover:bg-primary/90 btn-press"
                >
                  {isCreating ? (
                    <>
                      <div className="h-4 w-4 mr-2 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Key className="h-4 w-4 mr-2" />
                      Create Passkey
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
                    <CardDescription>Sign in with your passkey</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Available Passkeys</span>
                    <Badge variant="secondary">{registeredPasskeys.length}</Badge>
                  </div>
                  <Progress value={registeredPasskeys.length > 0 ? 100 : 0} className="h-2" />
                </div>
                <Button 
                  onClick={handleAuthenticate}
                  disabled={isAuthenticating || !webAuthnSupported || registeredPasskeys.length === 0}
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
              <CardDescription>Manage your passwordless credentials across devices</CardDescription>
            </CardHeader>
            <CardContent>
              {registeredPasskeys.length > 0 ? (
                <ScrollArea className="h-[300px]">
                  <div className="space-y-3">
                    {registeredPasskeys.map((passkey) => (
                      <div
                        key={passkey.id}
                        className="p-4 rounded-xl border border-border/40 glass-effect shadow-depth-sm card-tactile animate-slide-in"
                      >
                        <div className="flex items-start gap-3">
                          <div className="p-2.5 rounded-xl bg-primary/10 shadow-depth-sm">
                            {passkey.type === 'platform' ? (
                              <Smartphone className="h-5 w-5 text-primary" />
                            ) : (
                              <Key className="h-5 w-5 text-primary" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-2">
                              <h4 className="font-semibold">{passkey.name}</h4>
                              <Badge variant="secondary" className="text-xs">
                                {passkey.type}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-4 text-xs text-muted-foreground">
                              <span>Created: {new Date(passkey.createdAt).toLocaleDateString()}</span>
                              <span>Last used: {new Date(passkey.lastUsed).toLocaleDateString()}</span>
                            </div>
                          </div>
                          <Button variant="ghost" size="sm" className="rounded-full btn-press">
                            Manage
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
        </TabsContent>

        <TabsContent value="biometric" className="space-y-6">
          <div className="grid md:grid-cols-2 gap-6">
            <Card className="border-border/40 glass-strong shadow-depth-md card-tactile">
              <CardHeader>
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-3 rounded-xl bg-blue-500/20 shadow-depth-sm">
                    <Fingerprint className="h-6 w-6 text-blue-500" />
                  </div>
                  <div>
                    <CardTitle>Fingerprint Authentication</CardTitle>
                    <CardDescription>Use your fingerprint for quick access</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/20">
                  <div className="flex items-center gap-3 mb-3">
                    <CheckCircle2 className="h-5 w-5 text-blue-500" />
                    <span className="text-sm font-medium">Touch ID / Fingerprint Sensor</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Secure biometric authentication using your device's fingerprint sensor
                  </p>
                </div>
                <Button 
                  onClick={() => handleBiometricSetup('fingerprint')}
                  className="w-full rounded-full bg-blue-500 hover:bg-blue-600 btn-press"
                >
                  <Fingerprint className="h-4 w-4 mr-2" />
                  Setup Fingerprint
                </Button>
              </CardContent>
            </Card>

            <Card className="border-border/40 glass-strong shadow-depth-md card-tactile">
              <CardHeader>
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-3 rounded-xl bg-purple-500/20 shadow-depth-sm">
                    <Fingerprint className="h-6 w-6 text-purple-500" />
                  </div>
                  <div>
                    <CardTitle>Face Recognition</CardTitle>
                    <CardDescription>Use facial recognition for authentication</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-4 rounded-xl bg-purple-500/10 border border-purple-500/20">
                  <div className="flex items-center gap-3 mb-3">
                    <CheckCircle2 className="h-5 w-5 text-purple-500" />
                    <span className="text-sm font-medium">Face ID / Windows Hello</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Advanced facial recognition for seamless authentication
                  </p>
                </div>
                <Button 
                  onClick={() => handleBiometricSetup('face')}
                  variant="outline"
                  className="w-full rounded-full btn-press"
                >
                  <Fingerprint className="h-4 w-4 mr-2" />
                  Setup Face Recognition
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Security Benefits */}
          <Card className="border-border/40 glass-strong shadow-depth-md">
            <CardHeader>
              <CardTitle>Security Benefits</CardTitle>
              <CardDescription>Why biometric authentication is more secure</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-3 gap-4">
                <BenefitCard
                  icon={Lock}
                  title="Phishing Resistant"
                  description="Cannot be stolen or intercepted"
                />
                <BenefitCard
                  icon={Zap}
                  title="Fast & Convenient"
                  description="Instant authentication"
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
              <CardTitle>Trusted Devices</CardTitle>
              <CardDescription>Devices registered for passwordless authentication</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <DeviceCard
                  name="MacBook Pro"
                  type="macOS"
                  icon={Laptop}
                  status="active"
                  lastUsed="2 hours ago"
                />
                <DeviceCard
                  name="iPhone 15 Pro"
                  type="iOS"
                  icon={Smartphone}
                  status="active"
                  lastUsed="1 day ago"
                />
              </div>
            </CardContent>
          </Card>

          {/* Cross-Platform Support */}
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

function DeviceCard({ name, type, icon: Icon, status, lastUsed }: any) {
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
          <p className="text-xs text-muted-foreground">Last used: {lastUsed}</p>
        </div>
        <Badge variant={status === 'active' ? 'default' : 'secondary'} className="text-xs">
          {status}
        </Badge>
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
