import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Network, Globe, Shield, CheckCircle2, Link2, Cloud, Key, Zap, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';

export default function FederatedIdentity() {
  const handleConnect = (provider: string) => {
    toast.success(`Connecting to ${provider}...`);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold mb-2">Nexus Fabric: Federated Identity Layer</h1>
          <p className="text-muted-foreground">Open identity layer with cross-platform sync, Web3 DID, and production API integrations</p>
        </div>
        <Badge variant="secondary" className="text-sm">
          <Network className="h-4 w-4 mr-1" />
          Federated Network
        </Badge>
      </div>

      {/* Network Status */}
      <Card className="border-border/40 glass-strong shadow-depth-md gradient-primary">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-4 rounded-xl bg-primary/20 shadow-depth-sm">
                <Network className="h-8 w-8 text-primary" />
              </div>
              <div>
                <h3 className="text-xl font-bold mb-1">Federated Identity Network</h3>
                <p className="text-sm text-muted-foreground">Connected to 3 identity providers with real-time sync via production APIs</p>
              </div>
            </div>
            <div className="text-right">
              <div className="text-3xl font-bold text-success mb-1">Active</div>
              <Badge variant="secondary" className="text-xs">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Synced
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Connected Providers */}
      <Card className="border-border/40 glass-strong shadow-depth-md">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Connected Identity Providers</CardTitle>
              <CardDescription>Seamless credential sharing across platforms with production API integration</CardDescription>
            </div>
            <a
              href="https://learn.microsoft.com/en-us/entra/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-primary hover:underline flex items-center gap-1"
            >
              <ExternalLink className="h-3 w-3" />
              Entra ID Docs
            </a>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-3 gap-4">
            <ProviderCard
              name="Microsoft Entra ID"
              status="Connected"
              syncStatus="Real-time"
              credentials={12}
              icon="🔷"
              apiDocs="https://learn.microsoft.com/en-us/entra/"
            />
            <ProviderCard
              name="Okta"
              status="Connected"
              syncStatus="Real-time"
              credentials={8}
              icon="🔵"
              apiDocs="https://developer.okta.com/docs/reference/"
            />
            <ProviderCard
              name="Apple iCloud Keychain"
              status="Connected"
              syncStatus="Real-time"
              credentials={15}
              icon="🍎"
              apiDocs="https://developer.apple.com/documentation/authenticationservices"
            />
          </div>
        </CardContent>
      </Card>

      {/* Web3 Integration */}
      <Card className="border-border/40 glass-strong shadow-depth-md">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Web3 Decentralized Identity (DID)</CardTitle>
              <CardDescription>Blockchain-based identity verification with verifiable credentials</CardDescription>
            </div>
            <a
              href="https://www.w3.org/TR/did-core/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-primary hover:underline flex items-center gap-1"
            >
              <ExternalLink className="h-3 w-3" />
              W3C DID Spec
            </a>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="p-4 rounded-xl glass-effect border border-border/40 shadow-depth-sm">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-primary/20 shadow-depth-sm">
                    <Key className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h4 className="font-semibold">Decentralized Identifier</h4>
                    <p className="text-xs text-muted-foreground">Your unique DID on the blockchain</p>
                  </div>
                </div>
                <Badge variant="secondary" className="text-xs">Active</Badge>
              </div>
              <div className="p-3 rounded-lg bg-background/50 font-mono text-xs break-all">
                did:nexus:0x1234567890abcdef1234567890abcdef12345678
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <Web3Card
                title="Verifiable Credentials"
                count={3}
                description="Blockchain-verified identity claims"
                icon={Shield}
              />
              <Web3Card
                title="Trust Networks"
                count={5}
                description="Federated identity relationships"
                icon={Network}
              />
            </div>

            <Button className="w-full rounded-full btn-press">
              <Key className="h-4 w-4 mr-2" />
              Issue Verifiable Credential
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Cross-Platform Sync */}
      <Card className="border-border/40 glass-strong shadow-depth-md">
        <CardHeader>
          <CardTitle>Cross-Platform Synchronization</CardTitle>
          <CardDescription>Real-time credential sync across all devices and platforms via production APIs</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <SyncStatusCard
              platform="Web"
              status="Synced"
              lastSync="Just now"
              credentials={35}
            />
            <SyncStatusCard
              platform="iOS"
              status="Synced"
              lastSync="2 minutes ago"
              credentials={35}
            />
            <SyncStatusCard
              platform="Android"
              status="Synced"
              lastSync="5 minutes ago"
              credentials={35}
            />
            <SyncStatusCard
              platform="Desktop"
              status="Synced"
              lastSync="1 minute ago"
              credentials={35}
            />
          </div>
        </CardContent>
      </Card>

      {/* Available Integrations */}
      <Card className="border-border/40 glass-strong shadow-depth-md">
        <CardHeader>
          <CardTitle>Available Integrations</CardTitle>
          <CardDescription>Connect additional identity providers to expand your federated network</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-3 gap-4">
            <IntegrationCard
              name="Ping Identity"
              description="Intelligent identity solutions"
              icon="🟣"
              apiDocs="https://docs.pingidentity.com/"
              onConnect={() => handleConnect('Ping Identity')}
            />
            <IntegrationCard
              name="1Password Connect"
              description="Import from 1Password vault"
              icon="🔵"
              apiDocs="https://developer.1password.com/docs/connect/"
              onConnect={() => handleConnect('1Password')}
            />
            <IntegrationCard
              name="Google Workspace"
              description="Sync with Google accounts"
              icon="🔴"
              apiDocs="https://developers.google.com/identity"
              onConnect={() => handleConnect('Google Workspace')}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ProviderCard({ name, status, syncStatus, credentials, icon, apiDocs }: any) {
  return (
    <div className="p-4 rounded-xl glass-effect border border-border/40 shadow-depth-sm card-tactile">
      <div className="flex items-center gap-3 mb-4">
        <div className="text-3xl">{icon}</div>
        <div className="flex-1">
          <h4 className="font-semibold mb-1">{name}</h4>
          <Badge variant="secondary" className="text-xs">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            {status}
          </Badge>
        </div>
      </div>
      <div className="space-y-2 mb-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Sync Status</span>
          <span className="font-medium text-success">{syncStatus}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Credentials</span>
          <span className="font-medium">{credentials}</span>
        </div>
      </div>
      {apiDocs && (
        <a
          href={apiDocs}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-primary hover:underline flex items-center gap-1"
        >
          <ExternalLink className="h-3 w-3" />
          API Documentation
        </a>
      )}
    </div>
  );
}

function Web3Card({ title, count, description, icon: Icon }: any) {
  return (
    <div className="p-4 rounded-xl glass-effect border border-border/40 shadow-depth-sm card-tactile">
      <div className="flex items-center gap-3 mb-3">
        <div className="p-2.5 rounded-xl bg-primary/10 shadow-depth-sm">
          <Icon className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1">
          <div className="text-2xl font-bold mb-1">{count}</div>
          <h4 className="font-semibold text-sm">{title}</h4>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{description}</p>
    </div>
  );
}

function SyncStatusCard({ platform, status, lastSync, credentials }: any) {
  return (
    <div className="flex items-center gap-4 p-4 rounded-xl glass-effect border border-border/40 shadow-depth-sm">
      <div className="p-2.5 rounded-xl bg-success/10 shadow-depth-sm">
        <Cloud className="h-5 w-5 text-success" />
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-2 mb-1">
          <h4 className="font-semibold">{platform}</h4>
          <Badge variant="secondary" className="text-xs">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            {status}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">Last sync: {lastSync} • {credentials} credentials</p>
      </div>
      <Progress value={100} className="w-20 h-2" />
    </div>
  );
}

function IntegrationCard({ name, description, icon, apiDocs, onConnect }: any) {
  return (
    <div className="p-4 rounded-xl glass-effect border border-border/40 shadow-depth-sm card-tactile">
      <div className="flex items-center gap-3 mb-3">
        <div className="text-3xl">{icon}</div>
        <div className="flex-1">
          <h4 className="font-semibold">{name}</h4>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      {apiDocs && (
        <a
          href={apiDocs}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-primary hover:underline flex items-center gap-1 mb-3"
        >
          <ExternalLink className="h-3 w-3" />
          API Documentation
        </a>
      )}
      <Button
        onClick={onConnect}
        variant="outline"
        size="sm"
        className="w-full rounded-full btn-press"
      >
        <Link2 className="h-4 w-4 mr-2" />
        Connect
      </Button>
    </div>
  );
}
