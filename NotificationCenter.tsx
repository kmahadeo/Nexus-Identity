import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Bell, X, Shield, User, Sparkles, CreditCard, CheckCircle2, AlertTriangle, Info, Settings as SettingsIcon } from 'lucide-react';
import { toast } from 'sonner';
import { notificationStorage, type NotificationItem, vaultStorage, sessionStorage_ } from './lib/storage';
import { runThreatScan } from './hooks/useQueries';

interface NotificationCenterProps {
  isOpen: boolean;
  onClose: () => void;
}

type Category = 'security' | 'account' | 'ai-insights' | 'billing';
type Priority = 'high' | 'medium' | 'low';

interface DisplayNotification {
  id: string;
  category: Category;
  title: string;
  message: string;
  timestamp: number;
  read: boolean;
  priority: Priority;
}

function mapToDisplay(n: NotificationItem): DisplayNotification {
  const categoryMap: Record<NotificationItem['type'], Category> = {
    security: 'security',
    warning:  'security',
    info:     'account',
    success:  'ai-insights',
  };
  const priorityMap: Record<NotificationItem['type'], Priority> = {
    security: 'high',
    warning:  'medium',
    info:     'medium',
    success:  'low',
  };
  return {
    id:        n.id,
    category:  categoryMap[n.type],
    title:     n.title,
    message:   n.body,
    timestamp: n.createdAt,
    read:      n.read,
    priority:  priorityMap[n.type],
  };
}

/** Seed one-time login notification and any vault threats if storage is empty */
function seedInitialNotifications() {
  const existing = notificationStorage.getAll();
  if (existing.length > 0) return;

  const session = sessionStorage_.get();
  if (session) {
    notificationStorage.add({
      title: 'Login successful',
      body: `Signed in as ${session.name} (${session.role})`,
      type: 'info',
    });
  }

  const entries = vaultStorage.getRaw();
  const findings = runThreatScan(entries);
  const critical = findings.filter(f => f.severity === 'critical' || f.severity === 'high');
  critical.slice(0, 3).forEach(f => {
    notificationStorage.add({ title: f.title, body: f.description, type: f.severity === 'critical' ? 'security' : 'warning' });
  });
}

export default function NotificationCenter({ isOpen, onClose }: NotificationCenterProps) {
  const [notifications, setNotifications] = useState<DisplayNotification[]>([]);
  const [preferences, setPreferences] = useState({
    security: true,
    account: true,
    aiInsights: true,
    billing: true,
  });

  const reload = useCallback(() => {
    seedInitialNotifications();
    setNotifications(notificationStorage.getAll().map(mapToDisplay));
  }, []);

  useEffect(() => {
    if (isOpen) reload();
  }, [isOpen, reload]);

  const unreadCount = notifications.filter(n => !n.read).length;

  const markAsRead = (id: string) => {
    notificationStorage.markRead(id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  };

  const markAllAsRead = () => {
    notificationStorage.markAllRead();
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    toast.success('All notifications marked as read');
  };

  const deleteNotification = (id: string) => {
    // Remove from storage and local state
    const all = notificationStorage.getAll().filter(n => n.id !== id);
    try { localStorage.setItem('nexus-notifications', JSON.stringify(all)); } catch {}
    setNotifications(prev => prev.filter(n => n.id !== id));
    toast.success('Notification deleted');
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'security': return Shield;
      case 'account': return User;
      case 'ai-insights': return Sparkles;
      case 'billing': return CreditCard;
      default: return Bell;
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'text-destructive';
      case 'medium': return 'text-warning';
      case 'low': return 'text-primary';
      default: return 'text-muted-foreground';
    }
  };

  const filterNotifications = (category?: string) => {
    if (!category) return notifications;
    return notifications.filter(n => n.category === category);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm animate-fade-in">
      <div className="fixed right-0 top-0 h-full w-full md:w-[480px] animate-slide-in">
        <Card className="h-full rounded-none border-l border-border/40 glass-strong shadow-depth-lg">
          <CardHeader className="border-b border-border/40 bg-gradient-to-br from-primary/10 to-accent/5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-gradient-to-br from-primary/20 to-accent/10 shadow-depth-sm">
                  <Bell className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <CardTitle>Notifications</CardTitle>
                  <CardDescription className="text-xs">
                    {unreadCount} unread {unreadCount === 1 ? 'notification' : 'notifications'}
                  </CardDescription>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {unreadCount > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={markAllAsRead}
                    className="text-xs rounded-full btn-press"
                  >
                    Mark all read
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onClose}
                  className="rounded-full btn-press"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Tabs defaultValue="all" className="h-[calc(100vh-120px)]">
              <div className="border-b border-border/40 glass-effect px-4 pt-4">
                <TabsList className="w-full glass-effect border border-border/40">
                  <TabsTrigger value="all" className="flex-1">All</TabsTrigger>
                  <TabsTrigger value="security" className="flex-1">Security</TabsTrigger>
                  <TabsTrigger value="ai-insights" className="flex-1">AI</TabsTrigger>
                  <TabsTrigger value="settings" className="flex-1">
                    <SettingsIcon className="h-4 w-4" />
                  </TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="all" className="m-0 h-[calc(100%-60px)]">
                <ScrollArea className="h-full">
                  <div className="p-4 space-y-3">
                    {notifications.length > 0 ? (
                      notifications.map((notification) => (
                        <NotificationCard
                          key={notification.id}
                          notification={notification}
                          onMarkAsRead={markAsRead}
                          onDelete={deleteNotification}
                          getCategoryIcon={getCategoryIcon}
                          getPriorityColor={getPriorityColor}
                        />
                      ))
                    ) : (
                      <EmptyState />
                    )}
                  </div>
                </ScrollArea>
              </TabsContent>

              <TabsContent value="security" className="m-0 h-[calc(100%-60px)]">
                <ScrollArea className="h-full">
                  <div className="p-4 space-y-3">
                    {filterNotifications('security').length > 0 ? filterNotifications('security').map((notification) => (
                      <NotificationCard
                        key={notification.id}
                        notification={notification}
                        onMarkAsRead={markAsRead}
                        onDelete={deleteNotification}
                        getCategoryIcon={getCategoryIcon}
                        getPriorityColor={getPriorityColor}
                      />
                    )) : <EmptyState />}
                  </div>
                </ScrollArea>
              </TabsContent>

              <TabsContent value="ai-insights" className="m-0 h-[calc(100%-60px)]">
                <ScrollArea className="h-full">
                  <div className="p-4 space-y-3">
                    {filterNotifications('ai-insights').length > 0 ? filterNotifications('ai-insights').map((notification) => (
                      <NotificationCard
                        key={notification.id}
                        notification={notification}
                        onMarkAsRead={markAsRead}
                        onDelete={deleteNotification}
                        getCategoryIcon={getCategoryIcon}
                        getPriorityColor={getPriorityColor}
                      />
                    )) : <EmptyState />}
                  </div>
                </ScrollArea>
              </TabsContent>

              <TabsContent value="settings" className="m-0 h-[calc(100%-60px)]">
                <ScrollArea className="h-full">
                  <div className="p-4 space-y-6">
                    <div>
                      <h3 className="text-sm font-semibold mb-4">Notification Preferences</h3>
                      <div className="space-y-4">
                        <PreferenceItem
                          icon={Shield}
                          label="Security Alerts"
                          description="Critical security issues and threats"
                          checked={preferences.security}
                          onChange={(checked) => setPreferences({ ...preferences, security: checked })}
                        />
                        <PreferenceItem
                          icon={User}
                          label="Account Activity"
                          description="Login attempts and profile changes"
                          checked={preferences.account}
                          onChange={(checked) => setPreferences({ ...preferences, account: checked })}
                        />
                        <PreferenceItem
                          icon={Sparkles}
                          label="AI Insights"
                          description="Security recommendations and tips"
                          checked={preferences.aiInsights}
                          onChange={(checked) => setPreferences({ ...preferences, aiInsights: checked })}
                        />
                        <PreferenceItem
                          icon={CreditCard}
                          label="Billing Updates"
                          description="Payment and subscription notifications"
                          checked={preferences.billing}
                          onChange={(checked) => setPreferences({ ...preferences, billing: checked })}
                        />
                      </div>
                    </div>
                  </div>
                </ScrollArea>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function NotificationCard({ notification, onMarkAsRead, onDelete, getCategoryIcon, getPriorityColor }: {
  notification: DisplayNotification;
  onMarkAsRead: (id: string) => void;
  onDelete: (id: string) => void;
  getCategoryIcon: (cat: string) => React.ElementType;
  getPriorityColor: (p: string) => string;
}) {
  const Icon = getCategoryIcon(notification.category);
  const timeAgo = getTimeAgo(notification.timestamp);

  return (
    <div
      className={`p-4 rounded-xl border border-border/40 shadow-depth-sm card-tactile ${
        notification.read ? 'glass-effect' : 'glass-strong bg-primary/5'
      }`}
    >
      <div className="flex items-start gap-3">
        <div className={`p-2 rounded-xl shadow-depth-sm ${
          notification.priority === 'high' ? 'bg-destructive/20' :
          notification.priority === 'medium' ? 'bg-warning/20' : 'bg-primary/20'
        }`}>
          <Icon className={`h-4 w-4 ${getPriorityColor(notification.priority)}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-1">
            <h4 className="font-semibold text-sm">{notification.title}</h4>
            {!notification.read && (
              <div className="h-2 w-2 rounded-full bg-primary animate-pulse shrink-0" />
            )}
          </div>
          <p className="text-xs text-muted-foreground mb-2">{notification.message}</p>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-xs">
              {notification.category.replace('-', ' ')}
            </Badge>
            <span className="text-xs text-muted-foreground">{timeAgo}</span>
          </div>
        </div>
      </div>
      <div className="flex gap-2 mt-3">
        {!notification.read && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onMarkAsRead(notification.id)}
            className="h-7 text-xs rounded-full btn-press"
          >
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Mark read
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onDelete(notification.id)}
          className="h-7 text-xs rounded-full btn-press hover:text-destructive"
        >
          <X className="h-3 w-3 mr-1" />
          Delete
        </Button>
      </div>
    </div>
  );
}

function PreferenceItem({ icon: Icon, label, description, checked, onChange }: {
  icon: React.ElementType;
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between p-3 rounded-xl glass-effect border border-border/40">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-primary/10">
          <Icon className="h-4 w-4 text-primary" />
        </div>
        <div>
          <Label className="text-sm font-medium">{label}</Label>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="p-6 rounded-2xl bg-primary/10 mb-4">
        <CheckCircle2 className="h-12 w-12 text-primary" />
      </div>
      <h3 className="text-lg font-semibold mb-2">All caught up!</h3>
      <p className="text-sm text-muted-foreground max-w-md">
        No notifications in this category.
      </p>
    </div>
  );
}

function getTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
