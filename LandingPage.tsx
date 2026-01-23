import { useInternetIdentity } from '../hooks/useInternetIdentity';
import { Button } from '@/components/ui/button';
import { Shield, Lock, Activity, Sparkles, Key, Users, Plug, Eye, Target } from 'lucide-react';

export default function LandingPage() {
  const { login, loginStatus } = useInternetIdentity();

  const isLoggingIn = loginStatus === 'logging-in';

  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Gradient background with animated orbs */}
      <div className="absolute inset-0 bg-gradient-to-br from-background via-background to-primary/5" />
      <div className="absolute top-20 left-10 h-96 w-96 rounded-full bg-primary/10 blur-3xl animate-pulse" />
      <div className="absolute bottom-20 right-10 h-96 w-96 rounded-full bg-accent/10 blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[600px] w-[600px] rounded-full bg-primary/5 blur-3xl animate-pulse" style={{ animationDelay: '2s' }} />

      {/* Content */}
      <div className="relative z-10">
        {/* Header */}
        <header className="border-b border-border/40 backdrop-blur-xl bg-background/60">
          <div className="container mx-auto px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-lg shadow-primary/20">
                <Shield className="h-7 w-7 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold">Nexus Identity</h1>
                <p className="text-xs text-muted-foreground">AI-Powered Security</p>
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
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 text-sm text-primary font-medium backdrop-blur-xl">
              <Sparkles className="h-4 w-4" />
              <span>Next-Generation Identity Security Platform</span>
            </div>

            <h1 className="text-6xl md:text-7xl font-bold tracking-tight leading-tight">
              Your Digital Identity,
              <br />
              <span className="bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent animate-pulse">
                Secured by AI
              </span>
            </h1>

            <p className="text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">
              Nexus Identity combines advanced AI security analysis, passwordless authentication, 
              and seamless team collaboration to protect what matters most.
            </p>

            <div className="flex items-center justify-center gap-4 pt-4">
              <Button
                onClick={login}
                disabled={isLoggingIn}
                size="lg"
                className="rounded-full bg-primary hover:bg-primary/90 text-primary-foreground font-medium shadow-lg shadow-primary/20 px-8 h-14 text-lg"
              >
                {isLoggingIn ? 'Connecting...' : 'Get Started Free'}
              </Button>
            </div>
          </div>

          {/* Features Grid */}
          <div className="grid md:grid-cols-3 gap-6 mt-24 max-w-6xl mx-auto">
            <FeatureCard
              icon={<Sparkles className="h-8 w-8" />}
              title="AI Security Coach"
              description="Intelligent threat detection and personalized security recommendations powered by advanced AI analysis."
              gradient="from-primary/20 to-primary/5"
            />
            <FeatureCard
              icon={<Key className="h-8 w-8" />}
              title="Passwordless Auth"
              description="WebAuthn passkeys and biometric authentication for secure, frictionless access to your accounts."
              gradient="from-blue-500/20 to-blue-500/5"
            />
            <FeatureCard
              icon={<Lock className="h-8 w-8" />}
              title="Encrypted Vault"
              description="Military-grade encryption for credentials, keys, and sensitive data with organized access control."
              gradient="from-green-500/20 to-green-500/5"
            />
            <FeatureCard
              icon={<Target className="h-8 w-8" />}
              title="Threat Analysis"
              description="Real-time monitoring and AI-powered threat detection to identify security risks before they escalate."
              gradient="from-red-500/20 to-red-500/5"
            />
            <FeatureCard
              icon={<Users className="h-8 w-8" />}
              title="Team Collaboration"
              description="Securely share credentials with family and team members with granular permission controls."
              gradient="from-purple-500/20 to-purple-500/5"
            />
            <FeatureCard
              icon={<Plug className="h-8 w-8" />}
              title="Enterprise Integrations"
              description="Seamless connections with Okta, Duo, Ping, HYPR, Entra ID, and other identity platforms."
              gradient="from-yellow-500/20 to-yellow-500/5"
            />
          </div>

          {/* Stats Section */}
          <div className="grid md:grid-cols-4 gap-6 mt-24 max-w-5xl mx-auto">
            <StatCard value="99.9%" label="Uptime" />
            <StatCard value="256-bit" label="Encryption" />
            <StatCard value="< 100ms" label="Response Time" />
            <StatCard value="24/7" label="AI Monitoring" />
          </div>
        </main>

        {/* Footer */}
        <footer className="border-t border-border/40 backdrop-blur-xl bg-background/60 mt-20">
          <div className="container mx-auto px-6 py-8">
            <p className="text-center text-sm text-muted-foreground">
              © 2025. Built with <span className="text-primary">♥</span> using{' '}
              <a
                href="https://caffeine.ai"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                caffeine.ai
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
      <div className="relative p-8 rounded-2xl border border-border/40 bg-card/50 backdrop-blur-xl hover:border-primary/40 transition-all">
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
    <div className="p-6 rounded-2xl border border-border/40 bg-card/50 backdrop-blur-xl text-center">
      <div className="text-3xl font-bold text-primary mb-2">{value}</div>
      <div className="text-sm text-muted-foreground">{label}</div>
    </div>
  );
}
