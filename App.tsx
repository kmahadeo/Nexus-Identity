import { useEffect, useRef } from 'react';
import { useInternetIdentity } from './hooks/useInternetIdentity';
import { Toaster } from '@/components/ui/sonner';
import { useTenant } from './TenantContext';
import NexusLogo from './NexusLogo';
import LandingPage from './LandingPage';
import MainApp from './MainApp';
import { callbackStorage, pkceStorage } from './lib/oauth';
import { roleRegistry } from './lib/storage';
import { getSupabase, isSupabaseConfigured } from './lib/supabase';
import { toast } from 'sonner';

/** Decode a JWT payload (no signature verification — just parse). */
function decodeJwtPayload(token: string): Record<string, any> | null {
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(base64));
  } catch { return null; }
}

export default function App() {
  const { isInitializing, loginStatus, session, selectRole, loginWithEmail } = useInternetIdentity();
  const { tier, setTier } = useTenant();
  const oauthHandled = useRef(false);

  // Handle OAuth callbacks — supports both:
  //   1. Implicit flow: #id_token=...&state=... (Google GIS)
  //   2. Auth code flow: ?code=...&state=... (Okta, Entra, Apple)
  useEffect(() => {
    if (oauthHandled.current) return;

    // Wrap in async IIFE for Supabase lookups
    (async () => {

    // Check URL fragment first (implicit flow — Google)
    const hash = window.location.hash.substring(1);
    if (hash) {
      const fragParams = new URLSearchParams(hash);
      const idToken = fragParams.get('id_token');
      const fragState = fragParams.get('state');

      if (idToken && fragState) {
        oauthHandled.current = true;
        window.history.replaceState({}, '', window.location.pathname);

        // Verify state matches what we saved
        const saved = pkceStorage.get();
        if (!saved || saved.state !== fragState) {
          toast.error('OAuth state mismatch — please try again');
          pkceStorage.clear();
          return;
        }

        // Decode the id_token to get user profile
        const payload = decodeJwtPayload(idToken);
        pkceStorage.clear();

        // Apple sends email in payload.email; name only on first auth
        // Google sends email, name, picture in payload
        const email = (payload?.email || '').trim().toLowerCase();
        if (email) {
          // Check Supabase FIRST (source of truth), then fall back to localStorage
          let existing: { principalId: string; name: string; role: any; tier: any } | null = null;

          if (isSupabaseConfigured()) {
            const client = getSupabase();
            if (client) {
              const { data } = await client.from('profiles')
                .select('principal_id, name, role, tier')
                .eq('email', email).maybeSingle();
              if (data) {
                existing = { principalId: data.principal_id, name: data.name, role: data.role, tier: data.tier };
                // Update localStorage to match Supabase
                roleRegistry.save({ email, name: data.name, role: data.role, tier: data.tier, principalId: data.principal_id });
              }
            }
          }

          // Fall back to localStorage only if Supabase didn't have the user
          if (!existing) {
            const local = roleRegistry.get(email);
            if (local) existing = local;
          }

          if (existing) {
            selectRole(existing.role, existing.name, email, existing.tier);
            setTier(existing.tier);
            toast.success(`Welcome back, ${existing.name}!`);
          } else {
            const name = payload.name || payload.given_name || email.split('@')[0];
            selectRole('individual', name, email, 'individual');
            setTier('individual');
            toast.success(`Welcome, ${name}!`);
          }
        } else {
          toast.error('Could not read profile from SSO provider — please try again');
        }
        return;
      }
    }

    // Check query params (authorization code flow — Okta, Entra, Apple)
    const url = new URL(window.location.href);
    const code  = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    if (code && state) {
      oauthHandled.current = true;
      callbackStorage.save(code, state);
      window.history.replaceState({}, '', window.location.pathname);
      // Code flow requires backend token exchange — show info
      toast.info('Authorization code received — backend token exchange needed');
      pkceStorage.clear();
    }

    })(); // end async IIFE
  }, [selectRole, loginWithEmail, setTier]);

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
