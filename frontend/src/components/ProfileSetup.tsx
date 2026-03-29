import { useState } from 'react';
import { useSaveCallerUserProfile } from '../hooks/useQueries';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Shield, User, Building2, Castle, ArrowRight, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import type { UserProfile } from '../backend';

type Tier = 'individual' | 'smb' | 'enterprise';

const tiers: { id: Tier; label: string; description: string; icon: typeof User }[] = [
  {
    id: 'individual',
    label: 'Individual',
    description: 'Personal identity vault, passkeys, and security dashboard',
    icon: User,
  },
  {
    id: 'smb',
    label: 'Small Business',
    description: 'Everything in Individual plus team sharing and integrations',
    icon: Building2,
  },
  {
    id: 'enterprise',
    label: 'Enterprise',
    description: 'Full platform with admin intelligence, threat analysis, and federated identity',
    icon: Castle,
  },
];

export default function ProfileSetup() {
  const { mutate: saveProfile, isPending } = useSaveCallerUserProfile();
  const [step, setStep] = useState<'info' | 'tier'>('info');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [selectedTier, setSelectedTier] = useState<Tier>('individual');

  const handleInfoNext = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim()) {
      toast.error('Please fill in all fields');
      return;
    }
    setStep('tier');
  };

  const handleSubmit = () => {
    const profile: UserProfile = {
      name: name.trim(),
      email: email.trim(),
      tier: selectedTier,
      createdAt: BigInt(Date.now() * 1000000),
      lastLogin: BigInt(Date.now() * 1000000),
    };

    saveProfile(profile, {
      onSuccess: () => {
        toast.success('Profile created successfully!');
      },
      onError: () => {
        toast.error('Failed to create profile');
      },
    });
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-background via-background to-primary/5">
      <div className="absolute inset-0 bg-grid-white/5" />
      <div className="absolute top-20 left-10 h-96 w-96 rounded-full bg-primary/10 blur-3xl animate-pulse" />
      <div className="absolute bottom-20 right-10 h-96 w-96 rounded-full bg-accent/10 blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />

      {step === 'info' ? (
        <Card className="w-full max-w-md border-border/40 bg-card/80 backdrop-blur-xl relative z-10">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 h-16 w-16 rounded-2xl bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-lg shadow-primary/20">
              <Shield className="h-9 w-9 text-white" />
            </div>
            <CardTitle className="text-2xl">Welcome to Nexus Identity</CardTitle>
            <CardDescription>Let's set up your secure profile</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleInfoNext} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Full Name</Label>
                <Input
                  id="name"
                  placeholder="Enter your full name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="bg-background/50"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email Address</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="your.email@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="bg-background/50"
                />
              </div>
              <Button
                type="submit"
                className="w-full rounded-full bg-primary hover:bg-primary/90 shadow-lg shadow-primary/20"
              >
                Next <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : (
        <Card className="w-full max-w-lg border-border/40 bg-card/80 backdrop-blur-xl relative z-10">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">Choose Your Plan</CardTitle>
            <CardDescription>Select the tier that fits your needs. You can change this later.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {tiers.map((tier) => {
              const Icon = tier.icon;
              const isSelected = selectedTier === tier.id;
              return (
                <button
                  key={tier.id}
                  type="button"
                  onClick={() => setSelectedTier(tier.id)}
                  className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
                    isSelected
                      ? 'border-primary bg-primary/10 shadow-lg shadow-primary/10'
                      : 'border-border/40 bg-background/30 hover:border-border/60 hover:bg-background/50'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${
                      isSelected ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                    }`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="font-semibold">{tier.label}</p>
                      <p className="text-sm text-muted-foreground mt-0.5">{tier.description}</p>
                    </div>
                  </div>
                </button>
              );
            })}
            <div className="flex gap-3 pt-2">
              <Button
                variant="outline"
                onClick={() => setStep('info')}
                className="rounded-full"
              >
                <ArrowLeft className="mr-2 h-4 w-4" /> Back
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={isPending}
                className="flex-1 rounded-full bg-primary hover:bg-primary/90 shadow-lg shadow-primary/20"
              >
                {isPending ? 'Creating Profile...' : 'Create Profile'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
