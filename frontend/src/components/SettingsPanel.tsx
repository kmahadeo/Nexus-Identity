import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Settings, Bell, Shield, Smartphone, Key, Plug, User, Lock, Eye, Trash2, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { useGetPasskeyCredentials, useDeletePasskeyCredential } from '../hooks/useQueries';

export default function SettingsPanel() {
  const { data: passkeys = [] } = useGetPasskeyCredentials();
  const { mutateAsync: deletePasskeyCredential, isPending: isDeleting } = useDeletePasskeyCredential();

  const [notificationSettings, setNotificationSettings] = useState({
    security: true,
    account: true,
    aiInsights: true,
    billing: false,
    email: true,
    push: true,
  });

  const [securitySettings, setSecuritySettings] = useState({
    twoFactor: true,
    biometric: true,
    autoLock: true,
    sessionTimeout: '30',
  });

  // Derive linked devices from passkey data
  const linkedDevices = passkeys.map((p) => ({
    id: p.credentialId,
    name: p.deviceName,
    type: p.transports?.includes('internal') ? 'Platform' : 'Security Key',
    lastActive: new Date(Number(p.createdAt) / 1000000).toLocaleDateString(),
    trusted: true,
  }));

  const registeredPasskeys = passkeys.map((p) => ({
    id: p.credentialId,
    name: `${p.deviceName} - ${p.transports?.includes('internal') ? 'Biometric' : 'Key'}`,
    created: new Date(Number(p.createdAt) / 1000000).toLocaleDateString(),
    lastUsed: new Date(Number(p.lastUsed) / 1000000).toLocaleDateString(),
  }));

  // No connected providers yet (requires backend OAuth2)
  const connectedProviders: { id: string; name: string; status: string; lastSync: string }[] = [];

  const [deleteTarget, setDeleteTarget] = useState<{ id: string; type: 'device' | 'passkey' } | null>(null);

  const handleRemoveDevice = (deviceId: string) => {
    setDeleteTarget({ id: deviceId, type: 'device' });
  };

  const handleRevokePasskey = (passkeyId: string) => {
    setDeleteTarget({ id: passkeyId, type: 'passkey' });
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deletePasskeyCredential(deleteTarget.id);
      toast.success(deleteTarget.type === 'device' ? 'Device removed successfully' : 'Passkey revoked successfully');
    } catch (error: any) {
      toast.error(error?.message || 'Failed to remove credential');
    }
    setDeleteTarget(null);
  };

  const handleDisconnectProvider = (providerId: string) => {
    toast.info('Provider disconnection requires backend OAuth2 implementation');
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold mb-2">Settings</h1>
        <p className="text-muted-foreground">Manage your account, security, and preferences</p>
      </div>

      <Tabs defaultValue="notifications" className="space-y-6">
        <TabsList className="glass-effect border border-border/40">
          <TabsTrigger value="notifications">
            <Bell className="h-4 w-4 mr-2" />
            Notifications
          </TabsTrigger>
          <TabsTrigger value="security">
            <Shield className="h-4 w-4 mr-2" />
            Security
          </TabsTrigger>
          <TabsTrigger value="devices">
            <Smartphone className="h-4 w-4 mr-2" />
            Devices
          </TabsTrigger>
          <TabsTrigger value="passkeys">
            <Key className="h-4 w-4 mr-2" />
            Passkeys
          </TabsTrigger>
          <TabsTrigger value="integrations">
            <Plug className="h-4 w-4 mr-2" />
            Integrations
          </TabsTrigger>
        </TabsList>

        <TabsContent value="notifications" className="space-y-6">
          <Card className="border-border/40 glass-strong shadow-depth-md">
            <CardHeader>
              <CardTitle>Notification Preferences</CardTitle>
              <CardDescription>Choose what notifications you want to receive</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <h3 className="text-sm font-semibold">Categories</h3>
                <SettingItem
                  label="Security Alerts"
                  description="Critical security issues and threats"
                  checked={notificationSettings.security}
                  onChange={(checked) => setNotificationSettings({ ...notificationSettings, security: checked })}
                />
                <SettingItem
                  label="Account Activity"
                  description="Login attempts and profile changes"
                  checked={notificationSettings.account}
                  onChange={(checked) => setNotificationSettings({ ...notificationSettings, account: checked })}
                />
                <SettingItem
                  label="AI Insights"
                  description="Security recommendations and tips"
                  checked={notificationSettings.aiInsights}
                  onChange={(checked) => setNotificationSettings({ ...notificationSettings, aiInsights: checked })}
                />
                <SettingItem
                  label="Billing Updates"
                  description="Payment and subscription notifications"
                  checked={notificationSettings.billing}
                  onChange={(checked) => setNotificationSettings({ ...notificationSettings, billing: checked })}
                />
              </div>

              <Separator />

              <div className="space-y-4">
                <h3 className="text-sm font-semibold">Delivery Methods</h3>
                <SettingItem
                  label="Email Notifications"
                  description="Receive notifications via email"
                  checked={notificationSettings.email}
                  onChange={(checked) => setNotificationSettings({ ...notificationSettings, email: checked })}
                />
                <SettingItem
                  label="Push Notifications"
                  description="Receive push notifications on your devices"
                  checked={notificationSettings.push}
                  onChange={(checked) => setNotificationSettings({ ...notificationSettings, push: checked })}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security" className="space-y-6">
          <Card className="border-border/40 glass-strong shadow-depth-md">
            <CardHeader>
              <CardTitle>Security Settings</CardTitle>
              <CardDescription>Configure your security preferences</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <SettingItem
                label="Two-Factor Authentication"
                description="Require a second form of verification"
                checked={securitySettings.twoFactor}
                onChange={(checked) => setSecuritySettings({ ...securitySettings, twoFactor: checked })}
              />
              <SettingItem
                label="Biometric Authentication"
                description="Use fingerprint or face recognition"
                checked={securitySettings.biometric}
                onChange={(checked) => setSecuritySettings({ ...securitySettings, biometric: checked })}
              />
              <SettingItem
                label="Auto-Lock"
                description="Automatically lock after inactivity"
                checked={securitySettings.autoLock}
                onChange={(checked) => setSecuritySettings({ ...securitySettings, autoLock: checked })}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="devices" className="space-y-6">
          <Card className="border-border/40 glass-strong shadow-depth-md">
            <CardHeader>
              <CardTitle>Linked Devices</CardTitle>
              <CardDescription>Manage devices that have access to your account</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[400px]">
                <div className="space-y-3">
                  {linkedDevices.map((device) => (
                    <div
                      key={device.id}
                      className="p-4 rounded-xl border border-border/40 glass-effect shadow-depth-sm card-tactile"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3">
                          <div className="p-2.5 rounded-xl bg-primary/10 shadow-depth-sm">
                            <Smartphone className="h-5 w-5 text-primary" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <h4 className="font-semibold text-sm">{device.name}</h4>
                              {device.trusted && (
                                <Badge variant="secondary" className="text-xs">
                                  <CheckCircle2 className="h-3 w-3 mr-1" />
                                  Trusted
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground mb-1">{device.type}</p>
                            <p className="text-xs text-muted-foreground">Last active: {device.lastActive}</p>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveDevice(device.id)}
                          className="rounded-full btn-press hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="passkeys" className="space-y-6">
          <Card className="border-border/40 glass-strong shadow-depth-md">
            <CardHeader>
              <CardTitle>Registered Passkeys</CardTitle>
              <CardDescription>Manage your passwordless authentication credentials</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[400px]">
                <div className="space-y-3">
                  {registeredPasskeys.map((passkey) => (
                    <div
                      key={passkey.id}
                      className="p-4 rounded-xl border border-border/40 glass-effect shadow-depth-sm card-tactile"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3">
                          <div className="p-2.5 rounded-xl bg-primary/10 shadow-depth-sm">
                            <Key className="h-5 w-5 text-primary" />
                          </div>
                          <div>
                            <h4 className="font-semibold text-sm mb-1">{passkey.name}</h4>
                            <div className="flex items-center gap-3 text-xs text-muted-foreground">
                              <span>Created: {passkey.created}</span>
                              <span>Last used: {passkey.lastUsed}</span>
                            </div>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRevokePasskey(passkey.id)}
                          className="rounded-full btn-press hover:text-destructive"
                        >
                          Revoke
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="integrations" className="space-y-6">
          <Card className="border-border/40 glass-strong shadow-depth-md">
            <CardHeader>
              <CardTitle>Connected Identity Providers</CardTitle>
              <CardDescription>Manage your SSO integrations and connections</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[400px]">
                <div className="space-y-3">
                  {connectedProviders.map((provider) => (
                    <div
                      key={provider.id}
                      className="p-4 rounded-xl border border-border/40 glass-effect shadow-depth-sm card-tactile"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3">
                          <div className="p-2.5 rounded-xl bg-primary/10 shadow-depth-sm">
                            <Plug className="h-5 w-5 text-primary" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <h4 className="font-semibold text-sm">{provider.name}</h4>
                              <Badge
                                variant={provider.status === 'connected' ? 'default' : 'secondary'}
                                className="text-xs"
                              >
                                {provider.status}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground">Last sync: {provider.lastSync}</p>
                          </div>
                        </div>
                        {provider.status === 'connected' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDisconnectProvider(provider.id)}
                            className="rounded-full btn-press hover:text-destructive"
                          >
                            Disconnect
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent className="glass-strong border-border/40">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deleteTarget?.type === 'device' ? 'Remove Device' : 'Revoke Passkey'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove this credential from your on-chain storage.
              The credential on your physical device will remain but will no longer be recognized.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting} className="rounded-full btn-press">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} disabled={isDeleting} className="rounded-full bg-destructive hover:bg-destructive/90 btn-press">
              {isDeleting ? 'Removing...' : 'Confirm'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SettingItem({ label, description, checked, onChange }: any) {
  return (
    <div className="flex items-center justify-between p-3 rounded-xl glass-effect border border-border/40">
      <div className="flex-1">
        <Label className="text-sm font-medium">{label}</Label>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
