import { useInternetIdentity } from './hooks/useInternetIdentity';
import { useGetCallerUserProfile } from './hooks/useQueries';
import { ThemeProvider } from 'next-themes';
import { Toaster } from '@/components/ui/sonner';
import LandingPage from './pages/LandingPage';
import MainApp from './pages/MainApp';
import ProfileSetup from './components/ProfileSetup';

export default function App() {
  const { identity, isInitializing } = useInternetIdentity();
  const { data: userProfile, isLoading: profileLoading, isFetched } = useGetCallerUserProfile();

  const isAuthenticated = !!identity;
  const showProfileSetup = isAuthenticated && !profileLoading && isFetched && userProfile === null;

  if (isInitializing || (isAuthenticated && !isFetched)) {
    return (
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
        <div className="flex h-screen items-center justify-center bg-background">
          <div className="flex flex-col items-center gap-4">
            <div className="relative h-16 w-16">
              <div className="absolute inset-0 animate-spin rounded-full border-4 border-primary/30 border-t-primary" />
              <div className="absolute inset-2 animate-pulse rounded-full bg-primary/20" />
            </div>
            <p className="text-sm text-muted-foreground animate-pulse">Initializing Nexus Identity...</p>
          </div>
        </div>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
      <div className="min-h-screen bg-background">
        {showProfileSetup ? (
          <ProfileSetup />
        ) : isAuthenticated && userProfile ? (
          <MainApp />
        ) : (
          <LandingPage />
        )}
        <Toaster />
      </div>
    </ThemeProvider>
  );
}
