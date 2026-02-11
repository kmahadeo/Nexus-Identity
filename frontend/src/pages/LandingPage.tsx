import { useInternetIdentity } from '../hooks/useInternetIdentity';
import { Button } from '@/components/ui/button';
import { Lock, Sparkles, Key, Users, Plug, Target } from 'lucide-react';
import NexusLogo from '../components/NexusLogo';

export default function LandingPage() {
  const { login, loginStatus } = useInternetIdentity();

  const isLoggingIn = loginStatus === 'logging-in';

  return (
    <div className="relative min-h-screen overflow-hidden aurora-bg">
      {/* Aurora gradient orbs */}
      <div className="absolute inset-0 bg-gradient-to-br from-background via-background to-primary/5" />
      <div className="absolute top-20 left-10 h-96 w-96 rounded-full bg-primary/8 blur-3xl animate-pulse" style={{ animationDuration: '8s' }} />
      <div className="absolute bottom-20 right-10 h-96 w-96 rounded-full bg-accent/8 blur-3xl animate-pulse" style={{ animationDuration: '10s', animationDelay: '2s' }} />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[600px] w-[600px] rounded-full bg-primary/3 blur-3xl animate-pulse" style={{ animationDuration: '12s', animationDelay: '4s' }} />

      {/* Content */}
      <div className="relative z-10">
        {/* Header */}
        <header className="border-b border-border/40 glass-strong">
          <div className="container mx-auto px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <NexusLogo size={48} />
              <div>
                <h1 className="text-xl font-bold">Nexus Identity</h1>
                <p className="text-xs text-muted-foreground">Autonomous Security Layer</p>
              </div>
            </div>
            <Button
              onClick={login}
              disabled={isLoggingIn}
              size="lg"
              className="rounded-full bg-primary hover:bg-primary/90 text-primary-foreground font-medium shadow-lg shadow-primary/20"
            >
              {isLoggingIn ? 'Connecting...' : 'Sign In'}
            </Button>
          </div>
        </header>

        {/* Hero Section */}
        <main className="container mx-auto px-6 py-20">
          <div className="max-w-5xl mx-auto text-center space-y-8">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 text-sm text-primary font-medium glass-effect">
              <Sparkles className="h-4 w-4" />
              <span>Decentralized Identity Infrastructure</span>
            </div>

            <h1 className="text-6xl md:text-7xl font-bold tracking-tight leading-tight">
              Autonomous Identity Layer
              <br />
              <span className="bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent animate-gradient bg-[length:200%_200%]">
                for the Decentralized Web
              </span>
            </h1>

            <p className="text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">
              Nexus Identity combines on-chain credential storage, WebAuthn passkeys,
              and client-side security analysis — all running on the Internet Computer.
            </p>

            <div className="flex items-center justify-center gap-4 pt-4">
              <Button
                onClick={login}
                disabled={isLoggingIn}
                size="lg"
                className="rounded-full bg-primary hover:bg-primary/90 text-primary-foreground font-medium glow-primary-soft px-8 h-14 text-lg"
              >
                {isLoggingIn ? 'Connecting...' : 'Get Started Free'}
              </Button>
            </div>
          </div>

          {/* Features Grid */}
          <div className="grid md:grid-cols-3 gap-6 mt-24 max-w-6xl mx-auto">
            <FeatureCard
              icon={<Sparkles className="h-8 w-8" />}
              title="Security Rule Engine"
              description="Client-side security analysis with real-time scoring and actionable recommendations based on your vault state."
              gradient="from-primary/20 to-primary/5"
            />
            <FeatureCard
              icon={<Key className="h-8 w-8" />}
              title="WebAuthn Passkeys"
              description="Browser-native FIDO2 passkeys and platform authenticators for passwordless access to your identity."
              gradient="from-primary/15 to-accent/10"
            />
            <FeatureCard
              icon={<Lock className="h-8 w-8" />}
              title="On-Chain Vault"
              description="AES-256 encrypted credentials stored directly on ICP canisters with per-principal isolation."
              gradient="from-success/20 to-success/5"
            />
            <FeatureCard
              icon={<Target className="h-8 w-8" />}
              title="Threat Analysis"
              description="Continuous security posture assessment analyzing vault hygiene, passkey coverage, and credential age."
              gradient="from-destructive/15 to-destructive/5"
            />
            <FeatureCard
              icon={<Users className="h-8 w-8" />}
              title="Team Sharing"
              description="Securely share credentials with team members using canister-level access control and invite codes."
              gradient="from-accent/20 to-accent/5"
            />
            <FeatureCard
              icon={<Plug className="h-8 w-8" />}
              title="Identity Integrations"
              description="Connect with Okta, Duo, Ping, HYPR, Entra ID, and other identity providers via the developer SDK."
              gradient="from-warning/20 to-warning/5"
            />
          </div>

          {/* Stats Section */}
          <div className="grid md:grid-cols-4 gap-6 mt-24 max-w-5xl mx-auto">
            <StatCard value="AES-256" label="Encryption" />
            <StatCard value="On-Chain" label="Storage" />
            <StatCard value="Passkey" label="Auth Method" />
            <StatCard value="ICP" label="Network" />
          </div>
        </main>

        {/* Footer */}
        <footer className="border-t border-border/40 backdrop-blur-xl bg-background/60 mt-20">
          <div className="container mx-auto px-6 py-8">
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
      </div>
    </div>
  );
}

function FeatureCard({ icon, title, description, gradient }: any) {
  return (
    <div className="group relative">
      <div className={`absolute inset-0 bg-gradient-to-br ${gradient} rounded-2xl blur-xl group-hover:blur-2xl transition-all`} />
      <div className="relative p-8 rounded-2xl border border-border/40 glass-strong shadow-depth-sm card-tactile hover:border-primary/40">
        <div className="inline-flex p-3 rounded-xl bg-primary/10 text-primary mb-4">
          {icon}
        </div>
        <h3 className="text-xl font-semibold mb-2">{title}</h3>
        <p className="text-muted-foreground leading-relaxed">{description}</p>
      </div>
    </div>
  );
}

function StatCard({ value, label }: any) {
  return (
    <div className="p-6 rounded-2xl border border-border/40 glass-strong shadow-depth-sm card-tactile text-center">
      <div className="text-3xl font-bold text-primary mb-2">{value}</div>
      <div className="text-sm text-muted-foreground">{label}</div>
    </div>
  );
}
