import { useState } from 'react';
import { useSaveCallerUserProfile } from './hooks/useQueries';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Shield } from 'lucide-react';
import { toast } from 'sonner';
import type { UserProfile } from './backend';

export default function ProfileSetup() {
  const { mutate: saveProfile, isPending } = useSaveCallerUserProfile();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim()) {
      toast.error('Please fill in all fields');
      return;
    }
    const profile: UserProfile = {
      name: name.trim(),
      email: email.trim(),
      createdAt: BigInt(Date.now() * 1_000_000),
      lastLogin: BigInt(Date.now() * 1_000_000),
    };
    saveProfile(profile, {
      onSuccess: () => toast.success('Profile created successfully!'),
      onError:   () => toast.error('Failed to create profile'),
    });
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 relative overflow-hidden"
      style={{ background: 'radial-gradient(ellipse at 50% 40%, rgba(8,8,18,1) 0%, rgba(3,4,7,1) 100%)' }}
    >
      {/* Ambient orbs */}
      <div className="absolute top-20 left-10 h-80 w-80 rounded-full bg-primary/10 blur-3xl animate-pulse" />
      <div className="absolute bottom-20 right-10 h-80 w-80 rounded-full bg-accent/10 blur-3xl animate-pulse"
        style={{ animationDelay: '1s' }} />

      <Card className="w-full max-w-md relative z-10 rounded-3xl animate-scale-in"
        style={{ background: 'rgba(10,10,18,0.8)', border: '1px solid rgba(255,255,255,0.08)' }}
      >
        <CardHeader className="text-center pb-2">
          <div className="mx-auto mb-4 h-16 w-16 rounded-2xl bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-lg shadow-primary/20">
            <Shield className="h-9 w-9 text-white" />
          </div>
          <CardTitle className="text-2xl font-semibold tracking-tight">Welcome to Nexus</CardTitle>
          <CardDescription className="text-white/45">Set up your secure identity profile</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5 pt-2">
            <div className="space-y-2">
              <Label htmlFor="name">FULL NAME</Label>
              <Input
                id="name"
                placeholder="Alex Chen"
                value={name}
                onChange={e => setName(e.target.value)}
                disabled={isPending}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">EMAIL ADDRESS</Label>
              <Input
                id="email"
                type="email"
                placeholder="alex@domain.io"
                value={email}
                onChange={e => setEmail(e.target.value)}
                disabled={isPending}
              />
            </div>
            <Button
              type="submit"
              disabled={isPending}
              className="w-full h-12 rounded-pill bg-primary hover:bg-primary/90 font-semibold tracking-wide shadow-lg shadow-primary/20 mt-2"
            >
              {isPending ? 'INITIALIZING PROFILE…' : 'CREATE PROFILE'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
