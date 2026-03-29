import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plug, CheckCircle2, Clock, AlertCircle, Zap, Shield, RefreshCw, Settings, TrendingUp, Activity, ExternalLink, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

type IntegrationStatus = 'connected' | 'available' | 'connecting' | 'error';

interface Integration {
  id: string;
  name: string;
  description: string;
  category: 'sso' | 'security' | 'migration' | 'fido';
  status: IntegrationStatus;
  health?: number;
  lastSync?: string;
  users?: number;
  autoDetected?: boolean;
  apiDocs?: string;
  oauthEndpoint?: string;
}

export default function Integrations() {
  const [integrations, setIntegrations] = useState<Integration[]>([
    {
      id: 'fido-mds',
      name: 'FIDO Alliance MDS',
      description: 'Device verification and attestation validation',
      category: 'fido',
      status: 'available',
      apiDocs: 'https://fidoalliance.org/metadata/',
      oauthEndpoint: 'https://mds.fidoalliance.org/',
    },
    {
      id: '1password-connect',
      name: '1Password Connect API',
      description: 'Encrypted vault sync and credential storage',
      category: 'migration',
      status: 'available',
      apiDocs: 'https://developer.1password.com/docs/connect/',
      oauthEndpoint: 'https://connect.1password.com',
    },
    {
      id: '1password-events',
      name: '1Password Events API',
      description: 'Audit trails and SIEM sync',
      category: 'security',
      status: 'available',
      apiDocs: 'https://developer.1password.com/docs/events-api/',
      oauthEndpoint: 'https://events.1password.com',
    },
    {
      id: 'okta',
      name: 'Okta',
      description: 'Enterprise SSO, MFA, and user provisioning',
      category: 'sso',
      status: 'available',
      autoDetected: true,
      apiDocs: 'https://developer.okta.com/docs/reference/',
      oauthEndpoint: 'https://dev-xxxxx.okta.com/oauth2/v1/authorize',
    },
    {
      id: 'duo',
      name: 'Cisco Duo Security',
      description: 'Two-factor authentication and risk-based auth',
      category: 'security',
      status: 'available',
      apiDocs: 'https://duo.com/docs/duoweb',
      oauthEndpoint: 'https://api.duosecurity.com',
    },
    {
      id: 'ping',
      name: 'Ping Identity',
      description: 'Intelligent identity solutions and SSO',
      category: 'sso',
      status: 'available',
      apiDocs: 'https://docs.pingidentity.com/',
      oauthEndpoint: 'https://auth.pingone.com',
    },
    {
      id: 'hypr',
      name: 'HYPR',
      description: 'Passwordless authentication and passkey management',
      category: 'security',
      status: 'available',
      apiDocs: 'https://docs.hypr.com/',
      oauthEndpoint: 'https://api.hypr.com',
    },
    {
      id: 'entra',
      name: 'Microsoft Entra ID',
      description: 'Azure AD integration with SSO and MFA',
      category: 'sso',
      status: 'available',
      apiDocs: 'https://learn.microsoft.com/en-us/entra/',
      oauthEndpoint: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    },
    {
      id: 'auth0',
      name: 'Auth0',
      description: 'Universal identity platform',
      category: 'sso',
      status: 'available',
      apiDocs: 'https://auth0.com/docs/api',
      oauthEndpoint: 'https://YOUR_DOMAIN.auth0.com/authorize',
    },
  ]);

  const handleConnect = async (integrationId: string) => {
    const integration = integrations.find(i => i.id === integrationId);
    if (!integration) return;

    toast.info('Not yet configured', {
      description: `${integration.name} requires backend OAuth2 implementation. See the integration notice above for details.`,
      duration: 4000,
    });
  };

  const handleDisconnect = (integrationId: string) => {
    setIntegrations(prev =>
      prev.map(int =>
        int.id === integrationId
          ? { ...int, status: 'available' as IntegrationStatus, health: undefined, lastSync: undefined, users: undefined }
          : int
      )
    );
    toast.success('Integration disconnected');
  };

  const handleSync = async (integrationId: string) => {
    toast.error('Backend sync integration required', {
      description: 'Please implement polling (every 60 minutes) or webhook listeners to fetch and sync live data from integrated providers.',
      duration: 5000,
    });
  };

  const connectedCount = integrations.filter(i => i.status === 'connected').length;
  const ssoIntegrations = integrations.filter(i => i.category === 'sso');
  const securityIntegrations = integrations.filter(i => i.category === 'security');
  const migrationIntegrations = integrations.filter(i => i.category === 'migration');
  const fidoIntegrations = integrations.filter(i => i.category === 'fido');

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold mb-2">Production API Integrations</h1>
        <p className="text-muted-foreground">Connect with enterprise identity providers, security platforms, and FIDO Alliance services using OAuth2 flows</p>
      </div>

      {/* Backend Integration Notice */}
      <Alert className="border-warning/40 bg-warning/5">
        <AlertTriangle className="h-4 w-4 text-warning" />
        <AlertTitle>Backend Integration Required</AlertTitle>
        <AlertDescription className="text-sm">
          Production OAuth2 flows require backend implementation:
          <ul className="list-disc list-inside mt-2 space-y-1">
            <li>Serverless routes at /auth/{'{provider}'}/callback for OAuth2 redirects</li>
            <li>Secure token storage in Supabase with AES-256-GCM encryption</li>
            <li>Polling (every 60 minutes) or webhook listeners for live data sync</li>
            <li>API signature validation (HMAC/JWT) and security event logging</li>
          </ul>
        </AlertDescription>
      </Alert>

      {/* Stats Overview */}
      <div className="grid md:grid-cols-4 gap-4">
        <Card className="border-border/40 glass-strong shadow-depth-md card-tactile gradient-primary">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-3">
              <Plug className="h-7 w-7 text-primary" />
              <Badge variant="secondary" className="text-xs">Ready</Badge>
            </div>
            <div className="text-3xl font-bold mb-1">{connectedCount}</div>
            <div className="text-sm text-muted-foreground">Connected</div>
          </CardContent>
        </Card>

        <Card className="border-border/40 glass-strong shadow-depth-md card-tactile gradient-success">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-3">
              <Shield className="h-7 w-7 text-success" />
              <Badge variant="secondary" className="text-xs">SSO</Badge>
            </div>
            <div className="text-3xl font-bold mb-1">{ssoIntegrations.length}</div>
            <div className="text-sm text-muted-foreground">Providers</div>
          </CardContent>
        </Card>

        <Card className="border-border/40 glass-strong shadow-depth-md card-tactile gradient-warning">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-3">
              <Activity className="h-7 w-7 text-warning" />
              <Badge variant="secondary" className="text-xs">OAuth2</Badge>
            </div>
            <div className="text-3xl font-bold mb-1">{integrations.length}</div>
            <div className="text-sm text-muted-foreground">Available</div>
          </CardContent>
        </Card>

        <Card className="border-border/40 glass-strong shadow-depth-md card-tactile from-accent/15 to-accent/5">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-3">
              <TrendingUp className="h-7 w-7 text-accent" />
              <Badge variant="secondary" className="text-xs">Auto</Badge>
            </div>
            <div className="text-3xl font-bold mb-1">1</div>
            <div className="text-sm text-muted-foreground">Detected</div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="all" className="space-y-6">
        <TabsList className="glass-effect border border-border/40">
          <TabsTrigger value="all">All Integrations</TabsTrigger>
          <TabsTrigger value="fido">FIDO Alliance</TabsTrigger>
          <TabsTrigger value="sso">SSO Providers</TabsTrigger>
          <TabsTrigger value="security">Security & MFA</TabsTrigger>
          <TabsTrigger value="migration">Migration</TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="space-y-4">
          <div className="grid md:grid-cols-2 gap-6">
            {integrations.map((integration) => (
              <IntegrationCard
                key={integration.id}
                integration={integration}
                onConnect={handleConnect}
                onDisconnect={handleDisconnect}
                onSync={handleSync}
              />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="fido" className="space-y-4">
          <div className="grid md:grid-cols-2 gap-6">
            {fidoIntegrations.map((integration) => (
              <IntegrationCard
                key={integration.id}
                integration={integration}
                onConnect={handleConnect}
                onDisconnect={handleDisconnect}
                onSync={handleSync}
              />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="sso" className="space-y-4">
          <div className="grid md:grid-cols-2 gap-6">
            {ssoIntegrations.map((integration) => (
              <IntegrationCard
                key={integration.id}
                integration={integration}
                onConnect={handleConnect}
                onDisconnect={handleDisconnect}
                onSync={handleSync}
              />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="security" className="space-y-4">
          <div className="grid md:grid-cols-2 gap-6">
            {securityIntegrations.map((integration) => (
              <IntegrationCard
                key={integration.id}
                integration={integration}
                onConnect={handleConnect}
                onDisconnect={handleDisconnect}
                onSync={handleSync}
              />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="migration" className="space-y-4">
          <div className="grid md:grid-cols-2 gap-6">
            {migrationIntegrations.map((integration) => (
              <IntegrationCard
                key={integration.id}
                integration={integration}
                onConnect={handleConnect}
                onDisconnect={handleDisconnect}
                onSync={handleSync}
              />
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function IntegrationCard({ integration, onConnect, onDisconnect, onSync }: any) {
  const getStatusBadge = () => {
    switch (integration.status) {
      case 'connected':
        return (
          <Badge variant="default" className="text-xs">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Connected
          </Badge>
        );
      case 'connecting':
        return (
          <Badge variant="secondary" className="text-xs">
            <div className="h-3 w-3 mr-1 animate-spin rounded-full border-2 border-current border-t-transparent" />
            Connecting
          </Badge>
        );
      case 'error':
        return (
          <Badge variant="destructive" className="text-xs">
            <AlertCircle className="h-3 w-3 mr-1" />
            Backend Required
          </Badge>
        );
      default:
        return (
          <Badge variant="secondary" className="text-xs">
            <Clock className="h-3 w-3 mr-1" />
            Ready for OAuth2
          </Badge>
        );
    }
  };

  return (
    <Card className={`border-border/40 glass-strong shadow-depth-md card-tactile ${integration.status === 'connected' ? 'gradient-success' : ''}`}>
      <CardHeader>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl shadow-depth-sm ${integration.status === 'connected' ? 'bg-success/20' : 'bg-primary/10'}`}>
              <Plug className={`h-5 w-5 ${integration.status === 'connected' ? 'text-success' : 'text-primary'}`} />
            </div>
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                {integration.name}
                {integration.autoDetected && (
                  <Badge variant="outline" className="text-xs">
                    <Zap className="h-3 w-3 mr-1" />
                    Auto-detected
                  </Badge>
                )}
              </CardTitle>
            </div>
          </div>
          {getStatusBadge()}
        </div>
        <CardDescription>{integration.description}</CardDescription>
        <div className="space-y-1 mt-2">
          {integration.apiDocs && (
            <a
              href={integration.apiDocs}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-primary hover:underline flex items-center gap-1"
            >
              <ExternalLink className="h-3 w-3" />
              API Documentation
            </a>
          )}
          {integration.oauthEndpoint && (
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <Shield className="h-3 w-3" />
              OAuth2: {integration.oauthEndpoint}
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {integration.status === 'connected' && (
          <>
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Health Status</span>
                <span className="font-semibold text-success">{integration.health}%</span>
              </div>
              <Progress value={integration.health} className="h-2" />
            </div>
            <div className="grid grid-cols-2 gap-3 p-3 rounded-xl glass-effect border border-border/40">
              <div>
                <div className="text-xs text-muted-foreground mb-1">Last Sync</div>
                <div className="text-sm font-semibold">{integration.lastSync}</div>
              </div>
              {integration.users !== undefined && (
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Users</div>
                  <div className="text-sm font-semibold">{integration.users}</div>
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <Button
                onClick={() => onSync(integration.id)}
                variant="outline"
                size="sm"
                className="flex-1 rounded-full btn-press"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Sync
              </Button>
              <Button
                onClick={() => onDisconnect(integration.id)}
                variant="outline"
                size="sm"
                className="flex-1 rounded-full btn-press"
              >
                <Settings className="h-4 w-4 mr-2" />
                Manage
              </Button>
            </div>
          </>
        )}
        {integration.status !== 'connected' && (
          <Button
            onClick={() => onConnect(integration.id)}
            disabled={integration.status === 'connecting'}
            className="w-full rounded-full btn-press"
          >
            {integration.status === 'connecting' ? (
              <>
                <div className="h-4 w-4 mr-2 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Initiating OAuth2...
              </>
            ) : (
              <>
                <Plug className="h-4 w-4 mr-2" />
                Connect via OAuth2
              </>
            )}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

