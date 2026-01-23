import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Code, Key, Webhook, Book, Terminal, Copy, CheckCircle2, Globe, Zap, Shield, Activity } from 'lucide-react';
import { toast } from 'sonner';

export default function DeveloperPortal() {
  const [apiKey, setApiKey] = useState('nxs_live_1234567890abcdef');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [copied, setCopied] = useState(false);

  const handleCopyApiKey = () => {
    navigator.clipboard.writeText(apiKey);
    setCopied(true);
    toast.success('API key copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleGenerateApiKey = () => {
    const newKey = `nxs_live_${Math.random().toString(36).substring(2, 15)}${Math.random().toString(36).substring(2, 15)}`;
    setApiKey(newKey);
    toast.success('New API key generated');
  };

  const handleSaveWebhook = () => {
    if (!webhookUrl.trim()) {
      toast.error('Please enter a webhook URL');
      return;
    }
    toast.success('Webhook endpoint saved');
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold mb-2">Developer SDK</h1>
          <p className="text-muted-foreground">Build powerful integrations with Nexus Intelligence Fabric APIs</p>
        </div>
        <Badge variant="secondary" className="text-sm">
          <Zap className="h-4 w-4 mr-1" />
          v2.0.0
        </Badge>
      </div>

      {/* Quick Stats */}
      <div className="grid md:grid-cols-4 gap-4">
        <Card className="border-border/40 glass-strong shadow-depth-md card-tactile gradient-primary">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-3">
              <Activity className="h-7 w-7 text-primary" />
              <Badge variant="secondary" className="text-xs">Live</Badge>
            </div>
            <div className="text-3xl font-bold mb-1">1,247</div>
            <div className="text-sm text-muted-foreground">API Calls Today</div>
          </CardContent>
        </Card>

        <Card className="border-border/40 glass-strong shadow-depth-md card-tactile gradient-success">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-3">
              <CheckCircle2 className="h-7 w-7 text-success" />
              <Badge variant="secondary" className="text-xs">99.9%</Badge>
            </div>
            <div className="text-3xl font-bold mb-1">Uptime</div>
            <div className="text-sm text-muted-foreground">Last 30 Days</div>
          </CardContent>
        </Card>

        <Card className="border-border/40 glass-strong shadow-depth-md card-tactile from-accent/15 to-accent/5">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-3">
              <Webhook className="h-7 w-7 text-accent" />
              <Badge variant="secondary" className="text-xs">Active</Badge>
            </div>
            <div className="text-3xl font-bold mb-1">3</div>
            <div className="text-sm text-muted-foreground">Webhooks</div>
          </CardContent>
        </Card>

        <Card className="border-border/40 glass-strong shadow-depth-md card-tactile gradient-warning">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-3">
              <Globe className="h-7 w-7 text-warning" />
              <Badge variant="secondary" className="text-xs">Global</Badge>
            </div>
            <div className="text-3xl font-bold mb-1">12ms</div>
            <div className="text-sm text-muted-foreground">Avg Latency</div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="quickstart" className="space-y-6">
        <TabsList className="glass-effect border border-border/40">
          <TabsTrigger value="quickstart">Quick Start</TabsTrigger>
          <TabsTrigger value="api">API Reference</TabsTrigger>
          <TabsTrigger value="webhooks">Webhooks</TabsTrigger>
          <TabsTrigger value="sdk">SDK Libraries</TabsTrigger>
        </TabsList>

        <TabsContent value="quickstart" className="space-y-6">
          {/* API Key Management */}
          <Card className="border-border/40 glass-strong shadow-depth-md">
            <CardHeader>
              <CardTitle>API Authentication</CardTitle>
              <CardDescription>Secure your API requests with OAuth2 and API keys</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="apiKey">Your API Key</Label>
                <div className="flex gap-2">
                  <Input
                    id="apiKey"
                    value={apiKey}
                    readOnly
                    className="glass-effect font-mono text-sm"
                  />
                  <Button
                    onClick={handleCopyApiKey}
                    variant="outline"
                    size="icon"
                    className="rounded-full btn-press"
                  >
                    {copied ? <CheckCircle2 className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
                  </Button>
                  <Button
                    onClick={handleGenerateApiKey}
                    variant="outline"
                    className="rounded-full btn-press"
                  >
                    <Key className="h-4 w-4 mr-2" />
                    Regenerate
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">Keep your API key secure. Never share it publicly or commit it to version control.</p>
              </div>

              <div className="p-4 rounded-xl glass-effect border border-border/40">
                <h4 className="font-semibold mb-3 flex items-center gap-2">
                  <Terminal className="h-4 w-4" />
                  Example Request
                </h4>
                <pre className="text-xs bg-background/50 p-3 rounded-lg overflow-x-auto">
{`curl -X GET https://api.nexus.ai/v2/vault/entries \\
  -H "Authorization: Bearer ${apiKey}" \\
  -H "Content-Type: application/json"`}
                </pre>
              </div>
            </CardContent>
          </Card>

          {/* Quick Start Guide */}
          <Card className="border-border/40 glass-strong shadow-depth-md">
            <CardHeader>
              <CardTitle>Getting Started</CardTitle>
              <CardDescription>Integrate Nexus APIs in minutes</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <StepCard
                  number={1}
                  title="Install the SDK"
                  code="npm install @nexus/sdk"
                />
                <StepCard
                  number={2}
                  title="Initialize the Client"
                  code={`import { NexusClient } from '@nexus/sdk';

const nexus = new NexusClient({
  apiKey: '${apiKey}',
  environment: 'production'
});`}
                />
                <StepCard
                  number={3}
                  title="Make Your First Request"
                  code={`const vaultEntries = await nexus.vault.list();
console.log(vaultEntries);`}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="api" className="space-y-6">
          <Card className="border-border/40 glass-strong shadow-depth-md">
            <CardHeader>
              <CardTitle>API Endpoints</CardTitle>
              <CardDescription>Complete REST and GraphQL API reference</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[500px]">
                <div className="space-y-4">
                  <EndpointCard
                    method="GET"
                    endpoint="/v2/vault/entries"
                    description="List all vault entries"
                    response="Array<VaultEntry>"
                  />
                  <EndpointCard
                    method="POST"
                    endpoint="/v2/vault/entries"
                    description="Create a new vault entry"
                    response="VaultEntry"
                  />
                  <EndpointCard
                    method="GET"
                    endpoint="/v2/auth/passkeys"
                    description="List registered passkeys"
                    response="Array<Passkey>"
                  />
                  <EndpointCard
                    method="POST"
                    endpoint="/v2/auth/passkeys/register"
                    description="Register a new passkey"
                    response="PasskeyRegistration"
                  />
                  <EndpointCard
                    method="GET"
                    endpoint="/v2/ai/recommendations"
                    description="Get AI security recommendations"
                    response="Array<Recommendation>"
                  />
                  <EndpointCard
                    method="GET"
                    endpoint="/v2/teams"
                    description="List user teams"
                    response="Array<Team>"
                  />
                  <EndpointCard
                    method="POST"
                    endpoint="/v2/teams/:id/members"
                    description="Add team member"
                    response="TeamMember"
                  />
                  <EndpointCard
                    method="GET"
                    endpoint="/v2/integrations"
                    description="List SSO integrations"
                    response="Array<Integration>"
                  />
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="webhooks" className="space-y-6">
          <Card className="border-border/40 glass-strong shadow-depth-md">
            <CardHeader>
              <CardTitle>Webhook Configuration</CardTitle>
              <CardDescription>Receive real-time security events and notifications</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="webhookUrl">Webhook Endpoint URL</Label>
                <div className="flex gap-2">
                  <Input
                    id="webhookUrl"
                    placeholder="https://your-app.com/webhooks/nexus"
                    value={webhookUrl}
                    onChange={(e) => setWebhookUrl(e.target.value)}
                    className="glass-effect"
                  />
                  <Button
                    onClick={handleSaveWebhook}
                    className="rounded-full btn-press"
                  >
                    <Webhook className="h-4 w-4 mr-2" />
                    Save
                  </Button>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <EventCard
                  event="vault.entry.created"
                  description="Triggered when a new vault entry is created"
                />
                <EventCard
                  event="vault.entry.updated"
                  description="Triggered when a vault entry is modified"
                />
                <EventCard
                  event="auth.passkey.registered"
                  description="Triggered when a new passkey is registered"
                />
                <EventCard
                  event="security.threat.detected"
                  description="Triggered when a security threat is identified"
                />
                <EventCard
                  event="team.member.added"
                  description="Triggered when a team member is added"
                />
                <EventCard
                  event="ai.recommendation.generated"
                  description="Triggered when AI generates a new recommendation"
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sdk" className="space-y-6">
          <Card className="border-border/40 glass-strong shadow-depth-md">
            <CardHeader>
              <CardTitle>SDK Libraries</CardTitle>
              <CardDescription>Official SDKs for popular languages and frameworks</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-2 gap-4">
                <SDKCard
                  language="TypeScript"
                  package="@nexus/sdk"
                  version="2.0.0"
                  install="npm install @nexus/sdk"
                />
                <SDKCard
                  language="Python"
                  package="nexus-sdk"
                  version="2.0.0"
                  install="pip install nexus-sdk"
                />
                <SDKCard
                  language="Go"
                  package="github.com/nexus/sdk-go"
                  version="2.0.0"
                  install="go get github.com/nexus/sdk-go"
                />
                <SDKCard
                  language="Ruby"
                  package="nexus-sdk"
                  version="2.0.0"
                  install="gem install nexus-sdk"
                />
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/40 glass-strong shadow-depth-md">
            <CardHeader>
              <CardTitle>Framework Integrations</CardTitle>
              <CardDescription>Pre-built integrations for popular frameworks</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-3 gap-4">
                <FrameworkCard name="React" status="Available" />
                <FrameworkCard name="Vue" status="Available" />
                <FrameworkCard name="Angular" status="Available" />
                <FrameworkCard name="Next.js" status="Available" />
                <FrameworkCard name="Nuxt" status="Available" />
                <FrameworkCard name="SvelteKit" status="Coming Soon" />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function StepCard({ number, title, code }: { number: number; title: string; code: string }) {
  return (
    <div className="p-4 rounded-xl glass-effect border border-border/40 shadow-depth-sm">
      <div className="flex items-center gap-3 mb-3">
        <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold">
          {number}
        </div>
        <h4 className="font-semibold">{title}</h4>
      </div>
      <pre className="text-xs bg-background/50 p-3 rounded-lg overflow-x-auto">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function EndpointCard({ method, endpoint, description, response }: any) {
  const methodColors: Record<string, string> = {
    GET: 'bg-blue-500/20 text-blue-500',
    POST: 'bg-green-500/20 text-green-500',
    PUT: 'bg-yellow-500/20 text-yellow-500',
    DELETE: 'bg-red-500/20 text-red-500',
  };

  return (
    <div className="p-4 rounded-xl glass-effect border border-border/40 shadow-depth-sm card-tactile">
      <div className="flex items-start gap-3 mb-2">
        <Badge className={`${methodColors[method]} text-xs font-mono`}>
          {method}
        </Badge>
        <code className="text-sm font-mono flex-1">{endpoint}</code>
      </div>
      <p className="text-sm text-muted-foreground mb-2">{description}</p>
      <div className="text-xs text-muted-foreground">
        Returns: <code className="text-primary">{response}</code>
      </div>
    </div>
  );
}

function EventCard({ event, description }: { event: string; description: string }) {
  return (
    <div className="p-4 rounded-xl glass-effect border border-border/40 shadow-depth-sm card-tactile">
      <div className="flex items-center gap-2 mb-2">
        <Webhook className="h-4 w-4 text-primary" />
        <code className="text-sm font-mono text-primary">{event}</code>
      </div>
      <p className="text-xs text-muted-foreground">{description}</p>
    </div>
  );
}

function SDKCard({ language, package: pkg, version, install }: any) {
  return (
    <div className="p-4 rounded-xl glass-effect border border-border/40 shadow-depth-sm card-tactile">
      <div className="flex items-center justify-between mb-3">
        <h4 className="font-semibold">{language}</h4>
        <Badge variant="secondary" className="text-xs">v{version}</Badge>
      </div>
      <code className="text-xs text-muted-foreground block mb-3">{pkg}</code>
      <pre className="text-xs bg-background/50 p-2 rounded-lg">
        <code>{install}</code>
      </pre>
    </div>
  );
}

function FrameworkCard({ name, status }: { name: string; status: string }) {
  return (
    <div className="p-4 rounded-xl glass-effect border border-border/40 shadow-depth-sm text-center card-tactile">
      <Code className="h-8 w-8 mx-auto mb-2 text-primary" />
      <h4 className="font-semibold mb-2">{name}</h4>
      <Badge variant={status === 'Available' ? 'default' : 'secondary'} className="text-xs">
        {status}
      </Badge>
    </div>
  );
}
