import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Fingerprint, Eye, Shield, CheckCircle2 } from 'lucide-react';

export default function BiometricAuth() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">Biometric Authentication</h1>
        <p className="text-muted-foreground">Fingerprint and face recognition security</p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <Card className="border-border/40 bg-card/50 backdrop-blur-xl">
          <CardHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-3 rounded-xl bg-blue-500/20">
                <Fingerprint className="h-6 w-6 text-blue-500" />
              </div>
              <div>
                <CardTitle>Biometric Setup</CardTitle>
                <CardDescription>Configure fingerprint and face recognition</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button className="w-full rounded-full bg-blue-500 hover:bg-blue-600">
              <Fingerprint className="h-4 w-4 mr-2" />
              Setup Fingerprint
            </Button>
            <Button className="w-full rounded-full bg-gradient-to-r from-pink-500 to-purple-500 hover:opacity-90">
              <Eye className="h-4 w-4 mr-2" />
              Setup Face Recognition
            </Button>
          </CardContent>
        </Card>

        <Card className="border-border/40 bg-gradient-to-br from-green-500/10 to-green-500/5 backdrop-blur-xl">
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

      <Card className="border-border/40 bg-card/50 backdrop-blur-xl">
        <CardHeader>
          <CardTitle>Browser Support</CardTitle>
          <CardDescription>
            Biometric authentication uses your device's built-in sensors through the WebAuthn API. 
            Supported on modern browsers with platform authenticators.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
            <p className="text-sm text-blue-500">
              ✓ WebAuthn API available • Platform authenticators supported • Secure credential storage enabled
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
