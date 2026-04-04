/**
 * OnboardingFlow.tsx — Interactive multi-step onboarding wizard.
 *
 * Steps: Welcome -> First Credential -> MFA Setup -> Invite Team -> Connect IdP -> All Set!
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
  PartyPopper,
} from 'lucide-react';
import { toast } from 'sonner';
import { sessionStorage_ } from './lib/storage';
import { isDemoMode } from './lib/demoMode';

/* -- Persistence ----------------------------------------------------------- */

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

/* -- Steps ----------------------------------------------------------------- */

interface Step {
  id: string;
  title: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  description: string;
  actionLabel?: string;
  action?: string;
  tip: string;
  /** Check if this step is already done -- returns true if complete */
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
  welcome: { id: 'welcome', title: 'Welcome to Nexus', subtitle: 'Zero-trust identity, private by design', icon: Shield, color: 'text-violet-400', description: "Passwordless identity with client-side encryption. Let's secure your account.", actionLabel: 'Next', tip: 'Skip anytime and return from Settings.' },
  passkey: { id: 'passkey', title: 'Register a Passkey', subtitle: 'Phishing-proof FIDO2 auth', icon: Key, color: 'text-emerald-400', description: "Use Touch ID, Face ID, or Windows Hello. No passwords needed.", actionLabel: 'Register passkey now', action: 'passkeys', tip: 'Register on each device you use.', checkDone: hasPasskeys },
  vault: { id: 'vault', title: 'Add a Vault Entry', subtitle: 'AES-256-GCM encrypted', icon: Lock, color: 'text-cyan-400', description: 'Store passwords and API keys. Everything is encrypted before storage.', actionLabel: 'Open vault', action: 'vault', tip: 'Use the password generator for high-entropy secrets.', checkDone: hasVaultEntries },
  mfa: { id: 'mfa', title: 'Set Up Authenticator', subtitle: 'TOTP backup via Google/Microsoft', icon: Smartphone, color: 'text-amber-400', description: 'Add TOTP as a backup factor. Scan the QR code in Settings.', actionLabel: 'Open settings', action: 'settings', tip: 'Passkeys are stronger than TOTP -- use TOTP as backup.', checkDone: hasTOTP },
  team: { id: 'team', title: 'Create a Team', subtitle: 'Role-based access control', icon: Users, color: 'text-blue-400', description: 'Set up teams and assign roles to manage vault sharing.', actionLabel: 'Create team now', action: 'team', tip: 'Share entries without revealing plaintext to members.', checkDone: hasTeams },
  policies: { id: 'policies', title: 'Set Security Policies', subtitle: 'Enforce org-wide rules', icon: Target, color: 'text-red-400', description: 'Configure password complexity, MFA requirements, and session timeouts.', actionLabel: 'Configure policies', action: 'admin', tip: 'Use "AI Generate" for Zero Trust policies.', checkDone: hasPolicies },
  directory: { id: 'directory', title: 'Connect a Directory', subtitle: 'SCIM 2.0 sync', icon: FolderSync, color: 'text-indigo-400', description: 'Import users from Entra ID, Okta, Duo, or Google Workspace.', actionLabel: 'Connect directory', action: 'admin', tip: 'Bidirectional sync keeps both platforms aligned.', checkDone: hasDirectories },
  sso: { id: 'sso', title: 'Connect SSO', subtitle: 'Okta, Entra ID, Cisco Duo', icon: Plug, color: 'text-pink-400', description: 'Enable single sign-on via OAuth2 PKCE.', actionLabel: 'Set up SSO', action: 'integrations', tip: 'Configure in Settings > Integrations.' },
  done: { id: 'done', title: "You're All Set!", subtitle: 'Nexus Identity is ready', icon: Sparkles, color: 'text-violet-400', description: 'Your identity platform is configured. The Security Advisor provides real-time recommendations.', actionLabel: 'Get started', tip: 'Open the Security Advisor for data-driven insights.' },
};

function getStepsForRole(role: string, isDemo: boolean): Step[] {
  // In demo mode, skip the passkey step (can't register real passkeys for a demo account)
  const filterPasskey = (steps: Step[]) =>
    isDemo ? steps.filter(s => s.id !== 'passkey') : steps;

  switch (role) {
    case 'admin':
      return filterPasskey([STEP_LIBRARY.welcome, STEP_LIBRARY.directory, STEP_LIBRARY.policies, STEP_LIBRARY.passkey, STEP_LIBRARY.mfa, STEP_LIBRARY.team, STEP_LIBRARY.done]);
    case 'team':
      return filterPasskey([STEP_LIBRARY.welcome, STEP_LIBRARY.passkey, STEP_LIBRARY.vault, STEP_LIBRARY.team, STEP_LIBRARY.mfa, STEP_LIBRARY.done]);
    case 'contractor':
      return filterPasskey([STEP_LIBRARY.welcome, STEP_LIBRARY.passkey, STEP_LIBRARY.vault, STEP_LIBRARY.done]);
    case 'guest':
      return [STEP_LIBRARY.welcome, STEP_LIBRARY.done];
    default: // individual
      return filterPasskey([STEP_LIBRARY.welcome, STEP_LIBRARY.vault, STEP_LIBRARY.passkey, STEP_LIBRARY.mfa, STEP_LIBRARY.sso, STEP_LIBRARY.done]);
  }
}

/* -- Component ------------------------------------------------------------- */

interface OnboardingFlowProps {
  onClose: () => void;
  onNavigate: (view: string) => void;
}

export default function OnboardingFlow({ onClose, onNavigate }: OnboardingFlowProps) {
  const [state, setState] = useState<OnboardingState>(loadOnboardingState);
  const [showCelebration, setShowCelebration] = useState(false);
  const session = sessionStorage_.get();
  const role = session?.role ?? 'individual';
  const isDemo = isDemoMode();
  const STEPS = getStepsForRole(role, isDemo);

  const step = STEPS[state.currentStep] ?? STEPS[STEPS.length - 1];
  const isFirst = state.currentStep === 0;
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
      setShowCelebration(true);
      persist({ completed: true, stepsCompleted });
      setTimeout(() => {
        toast.success('Onboarding complete! Welcome to Nexus Identity.');
        onClose();
      }, 1800);
    } else {
      persist({ currentStep: state.currentStep + 1, stepsCompleted });
    }
  };

  const goPrev = () => {
    if (state.currentStep > 0) persist({ currentStep: state.currentStep - 1 });
  };

  const skip = () => {
    persist({ skipped: true });
    toast.info("Walkthrough skipped -- restart from Settings anytime.");
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
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(12px)' }}
      onClick={e => { if (e.target === e.currentTarget) skip(); }}
    >
      <div
        className="relative w-full h-full md:h-auto md:max-w-lg md:rounded-2xl overflow-hidden animate-fade-in flex flex-col"
        style={{
          background: 'linear-gradient(135deg, rgba(15,15,28,0.98) 0%, rgba(8,8,18,0.98) 100%)',
          border: '1px solid rgba(255,255,255,0.08)',
          boxShadow: '0 32px 64px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04)',
        }}
      >
        {/* Demo mode banner */}
        {isDemo && (
          <div
            className="px-4 md:px-6 py-2.5 text-xs text-violet-300 flex items-center gap-2"
            style={{ background: 'rgba(167,139,250,0.12)', borderBottom: '1px solid rgba(167,139,250,0.20)' }}
          >
            <Shield className="h-3.5 w-3.5 text-violet-400 shrink-0" />
            You're exploring in demo mode. All data is sample data.
          </div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between px-4 md:px-6 pt-4 md:pt-5 pb-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-white/80">
              Step {state.currentStep + 1} of {STEPS.length}
            </span>
            <span className="text-xs text-white/30 capitalize">{role} setup</span>
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
        <div className="px-4 md:px-6 pt-3">
          <Progress value={progress} className="h-1.5 bg-white/[0.06]" />
        </div>

        {/* Content area with vertical step indicator */}
        <div className="flex-1 flex overflow-y-auto">
          {/* Vertical step indicator */}
          <div className="hidden md:flex flex-col items-center py-8 pl-6 pr-2 gap-0">
            {STEPS.map((s, i) => {
              const isDone = s.checkDone?.() ?? false;
              const isCurrent = i === state.currentStep;
              const isVisited = state.stepsCompleted.includes(i);
              return (
                <div key={s.id} className="flex flex-col items-center">
                  <button
                    onClick={() => persist({ currentStep: i })}
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                      isCurrent
                        ? 'bg-violet-500 text-white ring-2 ring-violet-400/40'
                        : isDone
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                        : isVisited
                        ? 'bg-white/10 text-white/50 border border-white/15'
                        : 'bg-white/5 text-white/25 border border-white/10'
                    }`}
                    title={s.title}
                  >
                    {isDone ? <CheckCircle2 className="h-3.5 w-3.5" /> : i + 1}
                  </button>
                  {i < STEPS.length - 1 && (
                    <div className={`w-px h-8 ${i < state.currentStep ? 'bg-violet-500/40' : 'bg-white/10'}`} />
                  )}
                </div>
              );
            })}
          </div>

          {/* Main step content */}
          <div className="flex-1 px-4 md:px-6 py-6 md:py-8">
            {/* Celebration overlay */}
            {showCelebration && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center animate-fade-in" style={{ background: 'rgba(8,8,18,0.95)' }}>
                <div className="relative mb-6">
                  <div className="w-24 h-24 rounded-full bg-gradient-to-br from-violet-500/30 to-emerald-500/30 flex items-center justify-center animate-pulse">
                    <CheckCircle2 className="h-14 w-14 text-emerald-400" />
                  </div>
                  {/* Confetti-like decorative dots */}
                  <div className="absolute -top-3 -left-3 w-3 h-3 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="absolute -top-2 right-0 w-2 h-2 rounded-full bg-amber-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="absolute bottom-0 -left-4 w-2.5 h-2.5 rounded-full bg-cyan-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                  <div className="absolute -bottom-2 right-2 w-2 h-2 rounded-full bg-pink-400 animate-bounce" style={{ animationDelay: '450ms' }} />
                  <div className="absolute top-1/2 -right-5 w-3 h-3 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: '200ms' }} />
                  <div className="absolute top-0 left-1/2 w-2 h-2 rounded-full bg-yellow-400 animate-bounce" style={{ animationDelay: '350ms' }} />
                </div>
                <h2 className="text-2xl font-bold text-white mb-2">All set!</h2>
                <p className="text-sm text-white/50">Launching Nexus Identity...</p>
              </div>
            )}

            {/* Icon */}
            <div
              className="w-14 h-14 md:w-16 md:h-16 rounded-2xl flex items-center justify-center mb-5 mx-auto"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
            >
              <StepIcon className={`h-7 w-7 md:h-8 md:w-8 ${step.color}`} />
            </div>

            {/* Text */}
            <div className="text-center mb-5">
              <h2 className="text-lg md:text-xl font-bold text-white mb-1">{step.title}</h2>
              <p className={`text-sm font-medium mb-3 ${step.color}`}>{step.subtitle}</p>
              {step.checkDone?.() && (
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-400 mb-3">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Already completed
                </div>
              )}
              <p className="text-sm text-white/55 leading-relaxed max-w-sm mx-auto">{step.description}</p>
            </div>

            {/* Completion count badge */}
            {totalActionable > 0 && (
              <div className="flex justify-center mb-5">
                <Badge className="text-xs px-3 py-1" style={{
                  background: completedSteps === totalActionable ? 'rgba(34,197,94,0.15)' : 'rgba(245,158,11,0.15)',
                  color: completedSteps === totalActionable ? '#22c55e' : '#f59e0b',
                  border: `1px solid ${completedSteps === totalActionable ? 'rgba(34,197,94,0.3)' : 'rgba(245,158,11,0.3)'}`,
                }}>
                  {completedSteps}/{totalActionable} steps completed
                </Badge>
              </div>
            )}

            {/* Action button -- large and prominent */}
            <div className="flex flex-col items-center gap-3 mb-4">
              <Button
                onClick={handleAction}
                className="w-full md:w-auto rounded-full btn-press px-8 py-3 text-base font-semibold"
                style={{ background: 'linear-gradient(135deg, rgba(139,92,246,0.9), rgba(167,139,250,0.8))', border: 'none', minHeight: '48px' }}
              >
                {isLast ? (
                  <><Sparkles className="h-5 w-5 mr-2" />{step.actionLabel || 'Get started'}</>
                ) : step.action ? (
                  <><ChevronRight className="h-5 w-5 mr-2" />{step.actionLabel || 'Continue'}</>
                ) : (
                  <><ChevronRight className="h-5 w-5 mr-2" />{step.actionLabel || 'Next'}</>
                )}
              </Button>
            </div>

            {/* Tip */}
            <div
              className="rounded-xl p-3 text-xs text-white/45 leading-relaxed"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
            >
              <span className="text-violet-400 font-semibold mr-1">Tip:</span>
              {step.tip}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-between px-4 md:px-8 py-4 md:py-5 shrink-0"
          style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
        >
          <Button
            variant="ghost"
            size="sm"
            onClick={goPrev}
            disabled={isFirst}
            className="text-white/40 hover:text-white/70 rounded-full btn-press"
          >
            <ChevronLeft className="h-4 w-4 mr-1" />Back
          </Button>

          <button
            onClick={skip}
            className="text-[10px] text-white/20 hover:text-white/40 transition-colors"
          >
            skip walkthrough
          </button>

          {/* Mobile step dots */}
          <div className="flex items-center gap-1 md:hidden">
            {STEPS.map((s, i) => {
              const isDone = s.checkDone?.() ?? false;
              return (
                <button
                  key={s.id}
                  onClick={() => persist({ currentStep: i })}
                  className={`rounded-full transition-all ${
                    i === state.currentStep
                      ? 'w-4 h-1.5 bg-violet-400'
                      : isDone
                      ? 'w-1.5 h-1.5 bg-emerald-400'
                      : state.stepsCompleted.includes(i)
                      ? 'w-1.5 h-1.5 bg-emerald-400/40'
                      : 'w-1.5 h-1.5 bg-white/15'
                  }`}
                />
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
