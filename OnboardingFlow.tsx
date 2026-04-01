/**
 * OnboardingFlow.tsx — Interactive multi-step onboarding wizard.
 *
 * Steps: Welcome → First Credential → MFA Setup → Invite Team → Connect IdP → All Set!
 * Fully skippable. Progress persisted in localStorage.
 */

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import {
  Shield, Key, Lock, Users, Plug, Sparkles,
  ChevronRight, ChevronLeft, X, CheckCircle2,
  QrCode, Smartphone, Brain, Target, FolderSync,
} from 'lucide-react';
import { toast } from 'sonner';
import { sessionStorage_ } from './lib/storage';

/* ── Persistence ──────────────────────────────────────────────────────────── */

function getOnboardingKey(): string {
  try {
    const s = JSON.parse(localStorage.getItem('nexus-session') ?? 'null');
    return s?.principalId ? `nexus-onboarding-${s.principalId}` : 'nexus-onboarding';
  } catch { return 'nexus-onboarding'; }
}
const ONBOARDING_KEY = 'nexus-onboarding'; // kept for legacy check

interface OnboardingState {
  completed: boolean;
  currentStep: number;
  stepsCompleted: number[];
  skipped: boolean;
  startedAt: number;
}

function loadOnboardingState(): OnboardingState {
  const key = getOnboardingKey();
  try {
    // Try user-scoped key, fall back to legacy global
    const data = localStorage.getItem(key) ?? localStorage.getItem(ONBOARDING_KEY);
    return JSON.parse(data ?? 'null') ?? {
      completed: false, currentStep: 0, stepsCompleted: [], skipped: false, startedAt: Date.now(),
    };
  } catch {
    return { completed: false, currentStep: 0, stepsCompleted: [], skipped: false, startedAt: Date.now() };
  }
}

function saveOnboardingState(s: OnboardingState): void {
  try { localStorage.setItem(getOnboardingKey(), JSON.stringify(s)); } catch {}
}

export function resetOnboarding(): void {
  localStorage.removeItem(getOnboardingKey());
}

export function isOnboardingDone(): boolean {
  const s = loadOnboardingState();
  return s.completed || s.skipped;
}

/* ── Steps ────────────────────────────────────────────────────────────────── */

interface Step {
  id: string;
  title: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  description: string;
  action?: string;
  tip: string;
  /** Check if this step is already done — returns true if complete */
  checkDone?: () => boolean;
}

/** Dynamic step completion checks */
const hasPasskeys = () => {
  const session = sessionStorage_.get();
  if (!session) return false;
  try { return JSON.parse(localStorage.getItem(`nexus-passkeys-${session.principalId}`) ?? '[]').length > 0; } catch { return false; }
};
const hasVaultEntries = () => {
  try { return JSON.parse(localStorage.getItem(`nexus-vault`) ?? '[]').length > 0; } catch { return false; }
};
const hasTOTP = () => {
  const session = sessionStorage_.get();
  if (!session) return false;
  try { return JSON.parse(localStorage.getItem(`nexus-totp-credentials-${session.principalId}`) ?? '[]').some((c: any) => c.verified); } catch { return false; }
};
const hasPolicies = () => {
  try { return JSON.parse(localStorage.getItem('nexus-policies') ?? '[]').length > 0; } catch { return false; }
};
const hasDirectories = () => {
  try { return JSON.parse(localStorage.getItem('nexus-directory-connections') ?? '[]').length > 0; } catch { return false; }
};
const hasTeams = () => {
  try { return JSON.parse(localStorage.getItem('nexus-teams') ?? '[]').length > 0; } catch { return false; }
};

/** Role-specific step sets */
const STEP_LIBRARY: Record<string, Step> = {
  welcome: { id: 'welcome', title: 'Welcome to Nexus Identity', subtitle: 'Zero-trust identity — private by design', icon: Shield, color: 'text-violet-400', description: "You're setting up a passwordless identity platform. Your data is encrypted client-side and never accessible to servers. Let's get you set up.", tip: 'Skip anytime and return from Settings.' },
  passkey: { id: 'passkey', title: 'Register a Passkey', subtitle: 'Phishing-proof FIDO2 authentication', icon: Key, color: 'text-emerald-400', description: 'Passkeys use your device\'s secure enclave (Touch ID, Face ID, Windows Hello). They\'re phishing-proof and replace passwords entirely.', action: 'passkeys', tip: 'Register on each device you use.', checkDone: hasPasskeys },
  vault: { id: 'vault', title: 'Add a Vault Entry', subtitle: 'AES-256-GCM encrypted credentials', icon: Lock, color: 'text-cyan-400', description: 'Store passwords, API keys, and secrets — all encrypted before storage. Only you hold the decryption key.', action: 'vault', tip: 'Use the password generator for high-entropy secrets.', checkDone: hasVaultEntries },
  mfa: { id: 'mfa', title: 'Set Up Authenticator App', subtitle: 'TOTP with Google, Microsoft, Duo, Okta', icon: Smartphone, color: 'text-amber-400', description: 'Add a second factor via TOTP authenticator. Go to Settings → MFA to scan the QR code with your preferred app.', action: 'settings', tip: 'Passkeys are stronger than TOTP — use TOTP as a backup.', checkDone: hasTOTP },
  team: { id: 'team', title: 'Create or Join a Team', subtitle: 'Role-based access control', icon: Users, color: 'text-blue-400', description: 'Create teams and assign roles to control who can read, write, or share vault entries.', action: 'team', tip: 'Share entries without revealing plaintext to team members.', checkDone: hasTeams },
  policies: { id: 'policies', title: 'Configure Security Policies', subtitle: 'Enforce password, MFA, and session rules', icon: Target, color: 'text-red-400', description: 'Set organization-wide policies: password complexity, MFA requirements, session timeouts, vault access controls.', action: 'admin', tip: 'Use "AI Generate" to create Zero Trust, PAM, and DLP policies automatically.', checkDone: hasPolicies },
  directory: { id: 'directory', title: 'Connect a Directory', subtitle: 'SCIM 2.0 sync with Entra ID, Okta, Duo', icon: FolderSync, color: 'text-indigo-400', description: 'Import users from your identity provider. Supports Entra ID, Okta, Cisco Duo, Workday, and Google Workspace via SCIM 2.0.', action: 'admin', tip: 'Bidirectional sync keeps both platforms in alignment.', checkDone: hasDirectories },
  sso: { id: 'sso', title: 'Connect SSO Provider', subtitle: 'Okta, Entra ID, Cisco Duo', icon: Plug, color: 'text-pink-400', description: 'Enable single sign-on with your identity provider via OAuth2 PKCE.', action: 'integrations', tip: 'Configure in Settings → Integrations.' },
  done: { id: 'done', title: "You're All Set!", subtitle: 'Nexus Identity is ready', icon: Sparkles, color: 'text-violet-400', description: 'Your identity platform is configured. The Security Advisor in the sidebar provides real-time recommendations. Return to this walkthrough anytime from Settings.', tip: 'Open the Security Advisor for data-driven security insights.' },
};

function getStepsForRole(role: string): Step[] {
  switch (role) {
    case 'admin':
      return [STEP_LIBRARY.welcome, STEP_LIBRARY.directory, STEP_LIBRARY.policies, STEP_LIBRARY.passkey, STEP_LIBRARY.mfa, STEP_LIBRARY.team, STEP_LIBRARY.done];
    case 'team':
      return [STEP_LIBRARY.welcome, STEP_LIBRARY.passkey, STEP_LIBRARY.vault, STEP_LIBRARY.team, STEP_LIBRARY.mfa, STEP_LIBRARY.done];
    case 'contractor':
      return [STEP_LIBRARY.welcome, STEP_LIBRARY.passkey, STEP_LIBRARY.vault, STEP_LIBRARY.done];
    case 'guest':
      return [STEP_LIBRARY.welcome, STEP_LIBRARY.done];
    default: // individual
      return [STEP_LIBRARY.welcome, STEP_LIBRARY.vault, STEP_LIBRARY.passkey, STEP_LIBRARY.mfa, STEP_LIBRARY.sso, STEP_LIBRARY.done];
  }
}

/* ── Component ────────────────────────────────────────────────────────────── */

interface OnboardingFlowProps {
  onClose: () => void;
  onNavigate: (view: string) => void;
}

export default function OnboardingFlow({ onClose, onNavigate }: OnboardingFlowProps) {
  const [state, setState] = useState<OnboardingState>(loadOnboardingState);
  const session = sessionStorage_.get();
  const role = session?.role ?? 'individual';
  const STEPS = getStepsForRole(role);

  const step = STEPS[state.currentStep] ?? STEPS[STEPS.length - 1];
  const isLast = state.currentStep === STEPS.length - 1;
  const progress = ((state.currentStep) / (STEPS.length - 1)) * 100;
  const completedSteps = STEPS.filter(s => s.checkDone?.()).length;
  const totalActionable = STEPS.filter(s => !!s.checkDone).length;

  const persist = (updates: Partial<OnboardingState>) => {
    const next = { ...state, ...updates };
    setState(next);
    saveOnboardingState(next);
  };

  const goNext = () => {
    const stepsCompleted = state.stepsCompleted.includes(state.currentStep)
      ? state.stepsCompleted
      : [...state.stepsCompleted, state.currentStep];

    if (isLast) {
      persist({ completed: true, stepsCompleted });
      toast.success('Onboarding complete! Welcome to Nexus Identity.');
      onClose();
    } else {
      persist({ currentStep: state.currentStep + 1, stepsCompleted });
    }
  };

  const goPrev = () => {
    if (state.currentStep > 0) persist({ currentStep: state.currentStep - 1 });
  };

  const skip = () => {
    persist({ skipped: true });
    toast.info("Walkthrough skipped — you can restart it from Settings anytime.");
    onClose();
  };

  const handleAction = () => {
    if (step.action) {
      onNavigate(step.action);
      goNext();
    } else {
      goNext();
    }
  };

  const StepIcon = step.icon;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(12px)' }}
      onClick={e => { if (e.target === e.currentTarget) skip(); }}
    >
      <div
        className="relative w-full max-w-lg rounded-2xl overflow-hidden animate-fade-in"
        style={{
          background: 'linear-gradient(135deg, rgba(15,15,28,0.98) 0%, rgba(8,8,18,0.98) 100%)',
          border: '1px solid rgba(255,255,255,0.08)',
          boxShadow: '0 32px 64px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04)',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-0">
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="font-mono text-xs px-2 py-0.5">
              {state.currentStep + 1} / {STEPS.length}
            </Badge>
            <span className="text-xs text-white/30 capitalize">{role} setup</span>
            {totalActionable > 0 && (
              <Badge className="text-[10px] px-1.5" style={{
                background: completedSteps === totalActionable ? 'rgba(34,197,94,0.15)' : 'rgba(245,158,11,0.15)',
                color: completedSteps === totalActionable ? '#22c55e' : '#f59e0b',
                border: `1px solid ${completedSteps === totalActionable ? 'rgba(34,197,94,0.3)' : 'rgba(245,158,11,0.3)'}`,
              }}>
                {completedSteps}/{totalActionable} done
              </Badge>
            )}
          </div>
          <button
            onClick={skip}
            className="p-1.5 rounded-md text-white/25 hover:text-white/60 hover:bg-white/[0.05] transition-colors"
            title="Skip walkthrough"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Progress bar */}
        <div className="px-6 pt-3">
          <Progress value={progress} className="h-1 bg-white/[0.06]" />
        </div>

        {/* Step dots */}
        <div className="flex items-center justify-center gap-1.5 pt-3 px-6">
          {STEPS.map((s, i) => {
            const isDone = s.checkDone?.() ?? false;
            return (
              <button
                key={s.id}
                onClick={() => persist({ currentStep: i })}
                className={`rounded-full transition-all ${
                  i === state.currentStep
                    ? 'w-5 h-1.5 bg-violet-400'
                    : isDone
                    ? 'w-1.5 h-1.5 bg-emerald-400'
                    : state.stepsCompleted.includes(i)
                    ? 'w-1.5 h-1.5 bg-emerald-400/40'
                    : 'w-1.5 h-1.5 bg-white/15'
                }`}
                title={isDone ? `${s.title} ✓` : s.title}
              />
            );
          })}
        </div>

        {/* Content */}
        <div className="px-8 py-8">
          {/* Icon */}
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center mb-6 mx-auto"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            <StepIcon className={`h-8 w-8 ${step.color}`} />
          </div>

          {/* Text */}
          <div className="text-center mb-6">
            <h2 className="text-xl font-bold text-white mb-1.5">{step.title}</h2>
            <p className={`text-sm font-medium mb-3 ${step.color}`}>{step.subtitle}</p>
            {step.checkDone?.() && (
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-400 mb-3">
                <CheckCircle2 className="h-3.5 w-3.5" /> Already completed
              </div>
            )}
            <p className="text-sm text-white/55 leading-relaxed">{step.description}</p>
          </div>

          {/* Tip */}
          <div
            className="rounded-xl p-3 mb-6 text-xs text-white/45 leading-relaxed"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
          >
            <span className="text-violet-400 font-semibold mr-1">Tip:</span>
            {step.tip}
          </div>

          {/* Already completed steps */}
          {state.stepsCompleted.length > 0 && state.currentStep > 0 && !isLast && (
            <div className="flex flex-wrap gap-1.5 mb-5 justify-center">
              {state.stepsCompleted.map(i => (
                <span key={i} className="flex items-center gap-1 text-xs text-emerald-400/70 bg-emerald-400/5 px-2 py-0.5 rounded-full border border-emerald-400/10">
                  <CheckCircle2 className="h-3 w-3" />{STEPS[i]?.title.split(' ').slice(0, 3).join(' ')}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-between px-8 py-5"
          style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
        >
          <Button
            variant="ghost"
            size="sm"
            onClick={goPrev}
            disabled={state.currentStep === 0}
            className="text-white/40 hover:text-white/70 rounded-full btn-press"
          >
            <ChevronLeft className="h-4 w-4 mr-1" />Back
          </Button>

          <button
            onClick={skip}
            className="text-xs text-white/25 hover:text-white/50 transition-colors underline-offset-2 hover:underline"
          >
            Skip walkthrough
          </button>

          <Button
            onClick={handleAction}
            className="rounded-full btn-press px-5"
            style={{ background: 'linear-gradient(135deg, rgba(139,92,246,0.9), rgba(167,139,250,0.8))', border: 'none' }}
          >
            {isLast ? (
              <><Sparkles className="h-4 w-4 mr-2" />Get started</>
            ) : step.action ? (
              <><ChevronRight className="h-4 w-4 mr-2" />Go to {STEPS[state.currentStep].id === 'mfa' ? 'Settings' : step.action.charAt(0).toUpperCase() + step.action.slice(1)}</>
            ) : (
              <><ChevronRight className="h-4 w-4 mr-2" />Next</>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
