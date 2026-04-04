import { useState } from 'react';
import { useInternetIdentity } from '../hooks/useInternetIdentity';
import { useGetCallerUserProfile, useIsCurrentUserAdmin } from '../hooks/useQueries';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Shield,
  Key,
  Lock,
  Eye,
  Target,
  Users,
  Plug,
  LogOut,
  Bell,
  Search,
  Settings,
  Code,
  Brain,
  Network,
  Zap,
  Bot
} from 'lucide-react';
import { toast } from 'sonner';
import NexusLogo from '../components/NexusLogo';
import SecurityDashboard from '../components/SecurityDashboard';
import PasskeysView from '../components/PasskeysView';
import VaultView from '../components/VaultView';
import BiometricAuth from '../components/BiometricAuth';
import ThreatAnalysis from '../components/ThreatAnalysis';
import TeamSharing from '../components/TeamSharing';
import Integrations from '../components/Integrations';
import SettingsPanel from '../components/SettingsPanel';
import FloatingAICoach from '../components/FloatingAICoach';
import NotificationCenter from '../components/NotificationCenter';
import DeveloperPortal from '../components/DeveloperPortal';
import AdminIntelligence from '../components/AdminIntelligence';
import FederatedIdentity from '../components/FederatedIdentity';
import AgentIdentity from '../components/AgentIdentity';

type NavItem = 'dashboard' | 'passkeys' | 'vault' | 'biometric' | 'threat' | 'team' | 'integrations' | 'settings' | 'developer' | 'admin' | 'federated' | 'agents';

export default function MainApp() {
  const { clear } = useInternetIdentity();
  const queryClient = useQueryClient();
  const { data: userProfile } = useGetCallerUserProfile();
  const { data: isAdmin } = useIsCurrentUserAdmin();
  const [activeView, setActiveView] = useState<NavItem>('dashboard');
  const [searchQuery, setSearchQuery] = useState('');
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [unreadNotifications] = useState(3);
  const [cinematicMode, setCinematicMode] = useState(false);

  const handleLogout = async () => {
    try {
      queryClient.clear();
      await clear();
      toast.success('Logged out successfully');
    } catch (error) {
      toast.error('Failed to logout');
    }
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const tier = userProfile?.tier || 'individual';
  const isSmbOrAbove = tier === 'smb' || tier === 'enterprise';
  const isEnterprise = tier === 'enterprise';

  const navItems = [
    { id: 'dashboard' as NavItem, label: 'Security Dashboard', icon: Shield },
    { id: 'passkeys' as NavItem, label: 'WebAuthn & Passkeys', icon: Key },
    { id: 'vault' as NavItem, label: 'Password Manager', icon: Lock },
    { id: 'biometric' as NavItem, label: 'Biometric Auth', icon: Eye },
    ...(isEnterprise ? [{ id: 'threat' as NavItem, label: 'Threat Analysis', icon: Target }] : []),
    ...(isSmbOrAbove ? [{ id: 'team' as NavItem, label: 'Team & Sharing', icon: Users }] : []),
    ...(isSmbOrAbove ? [{ id: 'integrations' as NavItem, label: 'Integrations', icon: Plug }] : []),
    ...(isEnterprise ? [{ id: 'federated' as NavItem, label: 'Nexus Fabric', icon: Network }] : []),
    ...(isSmbOrAbove ? [{ id: 'developer' as NavItem, label: 'Developer SDK', icon: Code }] : []),
    ...(isEnterprise && isAdmin ? [{ id: 'admin' as NavItem, label: 'Admin Intelligence', icon: Brain }] : []),
    ...(isEnterprise && isAdmin ? [{ id: 'agents' as NavItem, label: 'AI Agents', icon: Bot }] : []),
    { id: 'settings' as NavItem, label: 'Settings', icon: Settings },
  ];

  return (
    <div className={`min-h-screen bg-background ${cinematicMode ? 'cinematic-mode' : ''}`}>
      {/* Aurora ambient lighting */}
      <div className="fixed inset-0 pointer-events-none z-0 ambient-lighting">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '8s' }} />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-accent/4 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '10s', animationDelay: '2s' }} />
        <div className="absolute top-1/3 right-1/3 w-72 h-72 bg-primary/3 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '14s', animationDelay: '6s' }} />
      </div>

      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-border/40 glass-strong shadow-depth-sm">
        <div className="container mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <NexusLogo size={40} />
              <div>
                <h1 className="text-lg font-bold">Nexus Identity</h1>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Brain className="h-3 w-3" />
                  Autonomous Security Layer
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative hidden md:block">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 w-64 h-9 glass-effect border-border/40"
              />
            </div>

            <Button 
              variant="ghost" 
              size="icon" 
              className="rounded-full btn-press card-tactile"
              onClick={() => setCinematicMode(!cinematicMode)}
              title="Toggle Cinematic Mode"
            >
              <Zap className={`h-5 w-5 ${cinematicMode ? 'text-primary' : ''}`} />
            </Button>

            <Button 
              variant="ghost" 
              size="icon" 
              className="rounded-full btn-press relative card-tactile"
              onClick={() => setNotificationOpen(true)}
            >
              <Bell className="h-5 w-5" />
              {unreadNotifications > 0 && (
                <Badge className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center text-xs bg-destructive animate-pulse">
                  {unreadNotifications}
                </Badge>
              )}
            </Button>

            <div className="flex items-center gap-3 pl-3 border-l border-border/40">
              <Avatar className="h-9 w-9 border-2 border-primary/20 shadow-depth-sm card-tactile">
                <AvatarFallback className="bg-gradient-to-br from-primary/20 to-accent/20 text-primary font-semibold text-sm">
                  {userProfile ? getInitials(userProfile.name) : 'U'}
                </AvatarFallback>
              </Avatar>
              <Button
                onClick={handleLogout}
                variant="ghost"
                size="icon"
                className="rounded-full hover:bg-destructive/10 hover:text-destructive btn-press card-tactile"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <div className="border-t border-border/40 glass-effect">
          <div className="container mx-auto px-6">
            <nav className="flex items-center gap-1 overflow-x-auto py-2 scrollbar-hide">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeView === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => setActiveView(item.id)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all whitespace-nowrap btn-press card-tactile ${
                      isActive
                        ? 'bg-primary text-primary-foreground shadow-depth-md glow-primary-soft'
                        : 'text-muted-foreground hover:text-foreground hover:bg-accent/10'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </button>
                );
              })}
            </nav>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-6 py-8 relative z-10">
        {activeView === 'dashboard' && <SecurityDashboard onNavigate={setActiveView} />}
        {activeView === 'passkeys' && <PasskeysView />}
        {activeView === 'vault' && <VaultView onNavigate={setActiveView} />}
        {activeView === 'biometric' && <BiometricAuth />}
        {activeView === 'threat' && <ThreatAnalysis />}
        {activeView === 'team' && <TeamSharing />}
        {activeView === 'integrations' && <Integrations />}
        {activeView === 'federated' && <FederatedIdentity />}
        {activeView === 'developer' && <DeveloperPortal />}
        {activeView === 'admin' && isAdmin && <AdminIntelligence />}
        {activeView === 'agents' && isAdmin && <AgentIdentity />}
        {activeView === 'settings' && <SettingsPanel />}
      </main>

      {/* Footer */}
      <footer className="border-t border-border/40 glass-effect mt-20 relative z-10">
        <div className="container mx-auto px-6 py-6">
          <p className="text-center text-sm text-muted-foreground">
            © 2026. Built on{' '}
            <a
              href="https://internetcomputer.org"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              Internet Computer
            </a>
          </p>
        </div>
      </footer>

      {/* Floating AI Coach */}
      <FloatingAICoach currentPage={activeView} />

      {/* Notification Center */}
      <NotificationCenter isOpen={notificationOpen} onClose={() => setNotificationOpen(false)} />
    </div>
  );
}
