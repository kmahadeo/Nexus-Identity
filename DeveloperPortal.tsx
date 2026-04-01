import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Code, Key, Webhook, Book, Terminal, Copy, CheckCircle2, Globe, Zap, Shield, Activity, Trash2, Plus, Send, Loader2, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

/* ── Types ──────────────────────────────────────────────────────────────── */

interface ApiKeyEntry {
  id: string;
  name: string;
  key: string;
  createdAt: number;
  lastUsed: number | null;
  isRevealed: boolean;
}

interface WebhookEntry {
  id: string;
  url: string;
  createdAt: number;
  lastTriggered: number | null;
  events: string[];
}

/* ── localStorage helpers ───────────────────────────────────────────────── */

const API_KEYS_STORAGE_KEY = 'nexus-api-keys';
const WEBHOOKS_STORAGE_KEY = 'nexus-webhooks';

function generateRandomKey(): string {
  const arr = new Uint8Array(24);
  crypto.getRandomValues(arr);
  const chars = Array.from(arr).map(b => b.toString(36).padStart(2, '0')).join('').substring(0, 32);
  return `nxs_live_${chars}`;
}

function loadApiKeys(): ApiKeyEntry[] {
  try {
    return JSON.parse(localStorage.getItem(API_KEYS_STORAGE_KEY) ?? '[]');
  } catch { return []; }
}

function saveApiKeys(keys: ApiKeyEntry[]) {
  localStorage.setItem(API_KEYS_STORAGE_KEY, JSON.stringify(keys));
}

function loadWebhooks(): WebhookEntry[] {
  try {
    return JSON.parse(localStorage.getItem(WEBHOOKS_STORAGE_KEY) ?? '[]');
  } catch { return []; }
}

function saveWebhooks(hooks: WebhookEntry[]) {
  localStorage.setItem(WEBHOOKS_STORAGE_KEY, JSON.stringify(hooks));
}

/* ── Component ──────────────────────────────────────────────────────────── */

export default function DeveloperPortal() {
  const [apiKeys, setApiKeys] = useState<ApiKeyEntry[]>([]);
  const [webhooks, setWebhooks] = useState<WebhookEntry[]>([]);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [newKeyName, setNewKeyName] = useState('');
  const [copied, setCopied] = useState<string | null>(null);
  const [testingWebhook, setTestingWebhook] = useState<string | null>(null);

  // Load persisted data
  useEffect(() => {
    const keys = loadApiKeys();
    // Seed a default key if none exist
    if (keys.length === 0) {
      const defaultKey: ApiKeyEntry = {
        id: crypto.randomUUID(),
        name: 'Default Key',
        key: generateRandomKey(),
        createdAt: Date.now(),
        lastUsed: null,
        isRevealed: false,
      };
      saveApiKeys([defaultKey]);
      setApiKeys([defaultKey]);
    } else {
      setApiKeys(keys);
    }
    setWebhooks(loadWebhooks());
  }, []);

  // Active/primary key for display in quickstart
  const primaryKey = apiKeys.length > 0 ? apiKeys[0] : null;

  /* ── API Key management ─────────────────────────────────────────────── */

  const handleCreateApiKey = () => {
    const name = newKeyName.trim() || `API Key ${apiKeys.length + 1}`;
    const entry: ApiKeyEntry = {
      id: crypto.randomUUID(),
      name,
      key: generateRandomKey(),
      createdAt: Date.now(),
      lastUsed: null,
      isRevealed: false,
    };
    const updated = [...apiKeys, entry];
    saveApiKeys(updated);
    setApiKeys(updated);
    setNewKeyName('');
    toast.success(`API key "${name}" created`);
  };

  const handleRevokeApiKey = (id: string) => {
    const key = apiKeys.find(k => k.id === id);
    const updated = apiKeys.filter(k => k.id !== id);
    saveApiKeys(updated);
    setApiKeys(updated);
    toast.success(`API key "${key?.name}" revoked`);
  };

  const handleCopyApiKey = (key: string, id: string) => {
    navigator.clipboard.writeText(key);
    setCopied(id);
    // Mark as used
    const updated = apiKeys.map(k => k.id === id ? { ...k, lastUsed: Date.now() } : k);
    saveApiKeys(updated);
    setApiKeys(updated);
    toast.success('API key copied to clipboard');
    setTimeout(() => setCopied(null), 2000);
  };

  const toggleRevealKey = (id: string) => {
    const updated = apiKeys.map(k => k.id === id ? { ...k, isRevealed: !k.isRevealed } : k);
    setApiKeys(updated);
  };

  /* ── Webhook management ─────────────────────────────────────────────── */

  const handleSaveWebhook = () => {
    if (!webhookUrl.trim()) {
      toast.error('Please enter a webhook URL');
      return;
    }
    try {
      new URL(webhookUrl.trim());
    } catch {
      toast.error('Please enter a valid URL');
      return;
    }

    const entry: WebhookEntry = {
      id: crypto.randomUUID(),
      url: webhookUrl.trim(),
      createdAt: Date.now(),
      lastTriggered: null,
      events: ['vault.entry.created', 'vault.entry.updated', 'security.threat.detected'],
    };
    const updated = [...webhooks, entry];
    saveWebhooks(updated);
    setWebhooks(updated);
    setWebhookUrl('');
    toast.success('Webhook endpoint saved');
  };

  const handleDeleteWebhook = (id: string) => {
    const updated = webhooks.filter(w => w.id !== id);
    saveWebhooks(updated);
    setWebhooks(updated);
    toast.success('Webhook removed');
  };

  const handleTestWebhook = async (hook: WebhookEntry) => {
    setTestingWebhook(hook.id);
    toast.info(`Sending test event to ${hook.url}...`);

    // Simulate network call
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Update last triggered
    const updated = webhooks.map(w =>
      w.id === hook.id ? { ...w, lastTriggered: Date.now() } : w
    );
    saveWebhooks(updated);
    setWebhooks(updated);
    setTestingWebhook(null);

    // Mock response
    toast.success(
      `Test event delivered to ${new URL(hook.url).hostname}. Response: 200 OK`,
      { description: 'Payload: { "event": "test.ping", "timestamp": ' + Date.now() + ' }' }
    );
  };

  /* ── Formatting helpers ─────────────────────────────────────────────── */

  const formatDate = (ts: number) => new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const formatTime = (ts: number | null) => {
    if (!ts) return 'Never';
    const diff = Date.now() - ts;
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return formatDate(ts);
  };

  const maskKey = (key: string) => key.substring(0, 12) + '\u2022'.repeat(20);

  const displayKey = primaryKey?.key ?? 'nxs_live_...';

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
      <div className="grid md:grid-cols-3 gap-4">
        <Card className="border-border/40 glass-strong shadow-depth-md card-tactile gradient-warning">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-3">
              <Key className="h-7 w-7 text-warning" />
              <Badge variant="secondary" className="text-xs">{apiKeys.length}</Badge>
            </div>
            <div className="text-3xl font-bold mb-1">{apiKeys.length}</div>
            <div className="text-sm text-muted-foreground">API Keys</div>
          </CardContent>
        </Card>

        <Card className="border-border/40 glass-strong shadow-depth-md card-tactile from-accent/15 to-accent/5">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-3">
              <Webhook className="h-7 w-7 text-accent" />
              <Badge variant="secondary" className="text-xs">{webhooks.length > 0 ? 'Active' : 'None'}</Badge>
            </div>
            <div className="text-3xl font-bold mb-1">{webhooks.length}</div>
            <div className="text-sm text-muted-foreground">Webhooks</div>
          </CardContent>
        </Card>

        <Card className="border-border/40 glass-strong shadow-depth-md card-tactile gradient-primary">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-3">
              <Activity className="h-7 w-7 text-primary" />
              <Badge variant="secondary" className="text-xs">Local</Badge>
            </div>
            <div className="text-3xl font-bold mb-1">{apiKeys.length + webhooks.length}</div>
            <div className="text-sm text-muted-foreground">Total Integrations</div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="quickstart" className="space-y-6">
        <TabsList className="glass-effect border border-border/40">
          <TabsTrigger value="quickstart">Quick Start</TabsTrigger>
          <TabsTrigger value="keys">API Keys</TabsTrigger>
          <TabsTrigger value="api">API Reference</TabsTrigger>
          <TabsTrigger value="webhooks">Webhooks</TabsTrigger>
          <TabsTrigger value="sdk">SDK Libraries</TabsTrigger>
        </TabsList>

        <TabsContent value="quickstart" className="space-y-6">
          {/* API Key Preview */}
          <Card className="border-border/40 glass-strong shadow-depth-md">
            <CardHeader>
              <CardTitle>API Authentication</CardTitle>
              <CardDescription>Secure your API requests with OAuth2 and API keys</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="apiKeyPreview">Your Primary API Key</Label>
                <div className="flex gap-2">
                  <Input
                    id="apiKeyPreview"
                    value={primaryKey?.isRevealed ? displayKey : maskKey(displayKey)}
                    readOnly
                    className="glass-effect font-mono text-sm"
                  />
                  {primaryKey && (
                    <>
                      <Button
                        onClick={() => toggleRevealKey(primaryKey.id)}
                        variant="outline"
                        size="icon"
                        className="rounded-full btn-press"
                      >
                        {primaryKey.isRevealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                      <Button
                        onClick={() => handleCopyApiKey(primaryKey.key, primaryKey.id)}
                        variant="outline"
                        size="icon"
                        className="rounded-full btn-press"
                      >
                        {copied === primaryKey.id ? <CheckCircle2 className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
                      </Button>
                    </>
                  )}
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
  -H "Authorization: Bearer ${primaryKey?.isRevealed ? displayKey : 'nxs_live_...'}" \\
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
  apiKey: '${primaryKey?.isRevealed ? displayKey : 'nxs_live_...'}',
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

        {/* ── API Keys Management Tab ───────────────────────────────────── */}
        <TabsContent value="keys" className="space-y-6">
          <Card className="border-border/40 glass-strong shadow-depth-md">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>API Key Management</CardTitle>
                  <CardDescription>Create, manage, and revoke API keys for your integrations</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Create new key */}
              <div className="p-4 rounded-xl glass-effect border border-border/40 shadow-depth-sm space-y-3">
                <h4 className="font-semibold text-sm flex items-center gap-2">
                  <Plus className="h-4 w-4" />
                  Create New API Key
                </h4>
                <div className="flex gap-2">
                  <Input
                    placeholder="Key name (e.g. Production, Staging)"
                    value={newKeyName}
                    onChange={(e) => setNewKeyName(e.target.value)}
                    className="glass-effect"
                    onKeyDown={(e) => e.key === 'Enter' && handleCreateApiKey()}
                  />
                  <Button onClick={handleCreateApiKey} className="rounded-full btn-press">
                    <Key className="h-4 w-4 mr-2" />
                    Generate
                  </Button>
                </div>
              </div>

              {/* Keys list */}
              <div className="space-y-3">
                {apiKeys.map(keyEntry => (
                  <div key={keyEntry.id} className="p-4 rounded-xl glass-effect border border-border/40 shadow-depth-sm card-tactile">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Key className="h-4 w-4 text-primary" />
                        <span className="font-semibold text-sm">{keyEntry.name}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 rounded-full"
                          onClick={() => toggleRevealKey(keyEntry.id)}
                        >
                          {keyEntry.isRevealed ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 rounded-full"
                          onClick={() => handleCopyApiKey(keyEntry.key, keyEntry.id)}
                        >
                          {copied === keyEntry.id ? <CheckCircle2 className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 rounded-full text-destructive hover:text-destructive"
                          onClick={() => handleRevokeApiKey(keyEntry.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                    <div className="font-mono text-xs bg-background/50 p-2 rounded-lg mb-2 break-all">
                      {keyEntry.isRevealed ? keyEntry.key : maskKey(keyEntry.key)}
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span>Created: {formatDate(keyEntry.createdAt)}</span>
                      <span>Last used: {formatTime(keyEntry.lastUsed)}</span>
                    </div>
                  </div>
                ))}

                {apiKeys.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    <Key className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No API keys yet. Create one above to get started.</p>
                  </div>
                )}
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
                  <EndpointCard method="GET" endpoint="/v2/vault/entries" description="List all vault entries" response="Array<VaultEntry>" />
                  <EndpointCard method="POST" endpoint="/v2/vault/entries" description="Create a new vault entry" response="VaultEntry" />
                  <EndpointCard method="GET" endpoint="/v2/auth/passkeys" description="List registered passkeys" response="Array<Passkey>" />
                  <EndpointCard method="POST" endpoint="/v2/auth/passkeys/register" description="Register a new passkey" response="PasskeyRegistration" />
                  <EndpointCard method="GET" endpoint="/v2/ai/recommendations" description="Get AI security recommendations" response="Array<Recommendation>" />
                  <EndpointCard method="GET" endpoint="/v2/teams" description="List user teams" response="Array<Team>" />
                  <EndpointCard method="POST" endpoint="/v2/teams/:id/members" description="Add team member" response="TeamMember" />
                  <EndpointCard method="GET" endpoint="/v2/integrations" description="List SSO integrations" response="Array<Integration>" />
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Webhooks Tab ──────────────────────────────────────────────── */}
        <TabsContent value="webhooks" className="space-y-6">
          <Card className="border-border/40 glass-strong shadow-depth-md">
            <CardHeader>
              <CardTitle>Webhook Configuration</CardTitle>
              <CardDescription>Receive real-time security events and notifications</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Add new webhook */}
              <div className="space-y-2">
                <Label htmlFor="webhookUrl">Add Webhook Endpoint</Label>
                <div className="flex gap-2">
                  <Input
                    id="webhookUrl"
                    placeholder="https://your-app.com/webhooks/nexus"
                    value={webhookUrl}
                    onChange={(e) => setWebhookUrl(e.target.value)}
                    className="glass-effect"
                    onKeyDown={(e) => e.key === 'Enter' && handleSaveWebhook()}
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

              {/* Saved webhooks */}
              {webhooks.length > 0 && (
                <div className="space-y-3">
                  <h4 className="font-semibold text-sm">Saved Webhooks</h4>
                  {webhooks.map(hook => (
                    <div key={hook.id} className="p-4 rounded-xl glass-effect border border-border/40 shadow-depth-sm card-tactile">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <Webhook className="h-4 w-4 text-primary flex-shrink-0" />
                          <span className="font-mono text-sm truncate">{hook.url}</span>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <Button
                            variant="outline"
                            size="sm"
                            className="rounded-full btn-press"
                            onClick={() => handleTestWebhook(hook)}
                            disabled={testingWebhook === hook.id}
                          >
                            {testingWebhook === hook.id ? (
                              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                            ) : (
                              <Send className="h-3 w-3 mr-1" />
                            )}
                            Test
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 rounded-full text-destructive hover:text-destructive"
                            onClick={() => handleDeleteWebhook(hook.id)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span>Created: {formatDate(hook.createdAt)}</span>
                        <span>Last triggered: {formatTime(hook.lastTriggered)}</span>
                        <span>{hook.events.length} events</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {webhooks.length === 0 && (
                <div className="text-center py-6 text-muted-foreground">
                  <Webhook className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No webhooks configured. Add one above to receive events.</p>
                </div>
              )}

              {/* Events reference */}
              <div className="pt-2">
                <h4 className="font-semibold text-sm mb-3">Available Events</h4>
                <div className="grid md:grid-cols-2 gap-4">
                  <EventCard event="vault.entry.created" description="Triggered when a new vault entry is created" />
                  <EventCard event="vault.entry.updated" description="Triggered when a vault entry is modified" />
                  <EventCard event="auth.passkey.registered" description="Triggered when a new passkey is registered" />
                  <EventCard event="security.threat.detected" description="Triggered when a security threat is identified" />
                  <EventCard event="team.member.added" description="Triggered when a team member is added" />
                  <EventCard event="ai.recommendation.generated" description="Triggered when AI generates a new recommendation" />
                </div>
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
                <SDKCard language="TypeScript" package="@nexus/sdk" version="2.0.0" install="npm install @nexus/sdk" />
                <SDKCard language="Python" package="nexus-sdk" version="2.0.0" install="pip install nexus-sdk" />
                <SDKCard language="Go" package="github.com/nexus/sdk-go" version="2.0.0" install="go get github.com/nexus/sdk-go" />
                <SDKCard language="Ruby" package="nexus-sdk" version="2.0.0" install="gem install nexus-sdk" />
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

/* ── Sub-components ─────────────────────────────────────────────────────── */

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
