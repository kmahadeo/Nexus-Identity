import { useEffect } from 'react';
import { useInternetIdentity } from './hooks/useInternetIdentity';
import { Toaster } from '@/components/ui/sonner';
import { useTenant } from './TenantContext';
import NexusLogo from './NexusLogo';
import LandingPage from './LandingPage';
import MainApp from './MainApp';
import { callbackStorage } from './lib/oauth';

export default function App() {
  const { isInitializing, loginStatus, session } = useInternetIdentity();
  const { tier } = useTenant();

  // Capture OAuth2 callback params before client-side routing cleans the URL
  useEffect(() => {
    const url = new URL(window.location.href);
    const code  = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    if (code && state) {
      callbackStorage.save(code, state);
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  // Only considered authenticated once role selection is complete
  const isAuthenticated = loginStatus === 'logged-in';
  const hasProfile = !!session;

  if (isInitializing) {
    return (
      <div
        className="flex h-screen items-center justify-center"
        data-tier={tier}
        style={{ background: 'radial-gradient(ellipse at 50% 40%, rgba(8,8,18,1) 0%, rgba(3,4,7,1) 100%)' }}
      >
        <div className="flex flex-col items-center gap-6">
          <NexusLogo size={64} />
          <div className="text-center">
            <p
              className="text-xs text-white/40 tracking-[0.2em] uppercase"
              style={{ fontFamily: 'JetBrains Mono, monospace' }}
            >
              NEXUS.IDENTITY
            </p>
            <div className="mt-3 flex items-center gap-2 justify-center">
              <div className="h-1 w-1 rounded-full bg-white/30 animate-pulse" />
              <div className="h-1 w-1 rounded-full bg-white/30 animate-pulse" style={{ animationDelay: '0.2s' }} />
              <div className="h-1 w-1 rounded-full bg-white/30 animate-pulse" style={{ animationDelay: '0.4s' }} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background" data-tier={tier}>
      {isAuthenticated && hasProfile ? (
        <MainApp />
      ) : (
        <LandingPage />
      )}
      <Toaster />
    </div>
  );
}
