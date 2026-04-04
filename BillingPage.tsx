/**
 * BillingPage.tsx — Pricing tiers, subscription management, and Stripe checkout stubs.
 *
 * All payment logic is stubbed with clear TODO markers for Stripe integration.
 * The UI is fully functional and production-ready.
 */

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { useTenant } from './TenantContext';
import { logError } from './lib/logger';
import {
  Check, Crown, Building2, Shield, Zap, Users, Lock,
  CreditCard, ArrowRight, Sparkles, Star, ExternalLink,
  FileText, Receipt, Settings2, AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';
import { initStripeCheckout, openCustomerPortal, isStripeConfigured, getStripePrices, getMockInvoices, isBetaMode, activateBeta, isBetaEmail, type InvoiceItem } from './lib/stripe';
import { isDemoMode as isDemoModeActive } from './lib/demoMode';
import { Input } from '@/components/ui/input';
import { sessionStorage_ } from './lib/storage';

const PLANS = [
  {
    id: 'free',
    name: 'Free',
    monthly: 0,
    annual: 0,
    tier: 'individual' as const,
    icon: Shield,
    accent: '#94a3b8',
    description: 'Personal password management',
    features: [
      '1 user',
      '50 vault entries',
      '1 passkey',
      'Basic threat scan',
      'TOTP MFA',
    ],
    limits: [
      'No team features',
      'No SSO connections',
      'No API access',
    ],
  },
  {
    id: 'individual',
    name: 'Individual',
    monthly: 8,
    annual: 77,
    tier: 'individual' as const,
    icon: Zap,
    accent: '#22d3ee',
    description: 'Power user — unlimited vault',
    popular: false,
    features: [
      'Unlimited vault entries',
      'Unlimited passkeys',
      'TOTP + hardware key MFA',
      'Breach monitoring',
      '1 SSO connection',
      'Basic reports',
      'AI Security Coach',
    ],
    limits: [
      'No team features',
    ],
  },
  {
    id: 'teams',
    name: 'Teams',
    monthly: 25,
    annual: 240,
    tier: 'smb' as const,
    icon: Users,
    accent: '#f59e0b',
    description: 'Collaborate with up to 5 users',
    popular: true,
    features: [
      'Up to 5 users',
      'Shared vaults',
      'Team management',
      'SSO (Okta / Entra / Duo)',
      'Compliance export',
      'Hardware key support',
      'Advanced threat analysis',
      'Audit trail',
    ],
    limits: [],
  },
  {
    id: 'business',
    name: 'Business',
    monthly: 79,
    annual: 758,
    tier: 'enterprise' as const,
    icon: Building2,
    accent: '#a78bfa',
    description: 'Full platform — up to 25 users',
    features: [
      'Up to 25 users',
      'Unlimited SSO connections',
      'Admin Intelligence dashboard',
      'Policy enforcement (block mode)',
      'Hardware key inventory',
      'SOC2 / ISO 27001 reports',
      'API access + webhooks',
      'Priority support',
    ],
    limits: [],
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    monthly: -1,
    annual: -1,
    tier: 'enterprise' as const,
    icon: Crown,
    accent: '#e879f9',
    description: 'Unlimited — dedicated infrastructure',
    features: [
      'Unlimited users',
      'Dedicated ICP canister',
      '99.99% SLA',
      'Custom SAML / OIDC',
      'White-label option',
      'Security review & BAA',
      'Compliance certification assist',
      'Dedicated account manager',
    ],
    limits: [],
  },
];

/* ── Billing storage stub ─────────────────────────────────────────────── */

interface BillingState {
  planId: string;
  billingCycle: 'monthly' | 'annual';
  status: 'active' | 'trialing' | 'canceled' | 'past_due';
  trialEndsAt?: number;
  currentPeriodEnd?: number;
}

function billingKey(): string {
  try {
    const s = JSON.parse(localStorage.getItem('nexus-session') ?? 'null');
    return s?.principalId ? `nexus-billing-${s.principalId}` : 'nexus-billing';
  } catch { return 'nexus-billing'; }
}

function getBilling(): BillingState {
  try {
    return JSON.parse(localStorage.getItem(billingKey()) ?? 'null') ?? {
      planId: 'free',
      billingCycle: 'monthly',
      status: 'active',
    };
  } catch {
    return { planId: 'free', billingCycle: 'monthly', status: 'active' };
  }
}

function setBilling(state: BillingState) {
  localStorage.setItem(billingKey(), JSON.stringify(state));
}

/* ── Component ─────────────────────────────────────────────────────────── */

export default function BillingPage() {
  const { tier } = useTenant();
  const [billing, setBillingState] = useState(getBilling);
  const [annual, setAnnual] = useState(billing.billingCycle === 'annual');
  const [betaCode, setBetaCode] = useState('');
  const [betaActive, setBetaActive] = useState(() => {
    const session = sessionStorage_.get();
    return isBetaMode() || (session?.email ? isBetaEmail(session.email) : false);
  });
  const [upgrading, setUpgrading] = useState<string | null>(null);

  const currentPlan = PLANS.find(p => p.id === billing.planId) ?? PLANS[0];

  const [invoices] = useState<InvoiceItem[]>(() => getMockInvoices());

  const handleUpgrade = async (planId: string) => {
    if (planId === 'enterprise') {
      toast.info('Contact sales@nexus-identity.io for enterprise pricing');
      return;
    }

    setUpgrading(planId);

    if (isStripeConfigured()) {
      // Real Stripe Checkout
      try {
        const prices = getStripePrices();
        const planPrices = prices[planId];
        if (!planPrices) {
          toast.error('No Stripe price configured for this plan');
          setUpgrading(null);
          return;
        }
        const priceId = annual ? planPrices.annual : planPrices.monthly;
        const successUrl = window.location.origin + window.location.pathname + '?billing=success';
        const cancelUrl = window.location.origin + window.location.pathname + '?billing=cancel';
        await initStripeCheckout(priceId, successUrl, cancelUrl);
      } catch (err) {
        logError('[Billing] Stripe checkout failed:', err);
        toast.error('Payment failed — please try again');
      }
      setUpgrading(null);
      return;
    }

    // No Stripe key — use simulation
    await new Promise(r => setTimeout(r, 1200));

    const newBilling: BillingState = {
      planId,
      billingCycle: annual ? 'annual' : 'monthly',
      status: 'active',
      currentPeriodEnd: Date.now() + 30 * 24 * 60 * 60 * 1000,
    };
    setBilling(newBilling);
    setBillingState(newBilling);
    setUpgrading(null);

    const plan = PLANS.find(p => p.id === planId);
    toast.success(`Upgraded to ${plan?.name ?? planId}!`);
  };

  const handleManageSubscription = async () => {
    if (isStripeConfigured()) {
      await openCustomerPortal();
    } else {
      toast.info('Connect Stripe in Settings > Integrations to manage subscriptions');
    }
  };

  const inDemo = isDemoModeActive();

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold mb-2">Plans & Billing</h1>
        <p className="text-muted-foreground">Choose the plan that fits your security needs</p>
      </div>

      {/* Beta access banner */}
      {betaActive && (
        <Card className="border-emerald-500/30 bg-emerald-500/5 shadow-depth-md">
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-emerald-500/15">
                <Sparkles className="h-5 w-5 text-emerald-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-emerald-300">Beta Access Active</p>
                <p className="text-xs text-emerald-400/60">All features are unlocked at no charge during the beta period.</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {!betaActive && !inDemo && (
        <div className="p-4 rounded-xl border border-border/40 glass-effect">
          <div className="flex items-center gap-3">
            <Input
              placeholder="Enter beta access code"
              value={betaCode}
              onChange={(e) => setBetaCode(e.target.value)}
              className="glass-effect text-sm flex-1 max-w-[250px]"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  if (activateBeta(betaCode)) {
                    setBetaActive(true);
                    toast.success('Beta access activated — all features unlocked');
                  } else {
                    toast.error('Invalid beta code');
                  }
                }
              }}
            />
            <Button size="sm" variant="outline" className="rounded-full btn-press text-xs" onClick={() => {
              if (activateBeta(betaCode)) {
                setBetaActive(true);
                toast.success('Beta access activated — all features unlocked');
              } else {
                toast.error('Invalid beta code');
              }
            }}>
              Activate
            </Button>
            <p className="text-xs text-white/30">Have a beta code? Enter it for free access.</p>
          </div>
        </div>
      )}

      {/* Demo mode billing notice */}
      {inDemo && (
        <div className="p-5 rounded-xl border border-violet-500/25 bg-violet-500/5">
          <div className="flex items-center gap-3">
            <Crown className="h-6 w-6 text-violet-400 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-violet-300">Demo Mode — Billing Disabled</p>
              <p className="text-xs text-white/40 mt-0.5">
                You have full access to all enterprise features for evaluation. No payment method is required and no charges will occur.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Current plan summary */}
      <Card className="border-border/40 glass-strong shadow-depth-md">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl" style={{ background: `${currentPlan.accent}15` }}>
                <currentPlan.icon className="h-6 w-6" style={{ color: currentPlan.accent }} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-semibold text-white/90">{currentPlan.name}</h3>
                  <Badge
                    className="text-xs"
                    style={{ background: `${currentPlan.accent}20`, color: currentPlan.accent, border: `1px solid ${currentPlan.accent}40` }}
                  >
                    {billing.status === 'trialing' ? 'Trial' : 'Active'}
                  </Badge>
                </div>
                <p className="text-sm text-white/40">{currentPlan.description}</p>
              </div>
            </div>
            {billing.planId !== 'free' && (
              <div className="text-right">
                <p className="text-2xl font-bold text-white/90 font-mono">
                  ${annual ? Math.round(currentPlan.annual / 12) : currentPlan.monthly}
                  <span className="text-sm text-white/30 font-normal">/mo</span>
                </p>
                <p className="text-xs text-white/30">
                  {annual ? 'billed annually' : 'billed monthly'}
                  {billing.currentPeriodEnd && ` · renews ${new Date(billing.currentPeriodEnd).toLocaleDateString()}`}
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Billing toggle */}
      <div className="flex items-center justify-center gap-3">
        <span className={`text-sm font-medium ${!annual ? 'text-white/90' : 'text-white/40'}`}>Monthly</span>
        <Switch
          checked={annual}
          onCheckedChange={setAnnual}
          className="data-[state=checked]:bg-violet-500"
        />
        <span className={`text-sm font-medium ${annual ? 'text-white/90' : 'text-white/40'}`}>
          Annual
        </span>
        <Badge className="text-xs bg-emerald-500/15 text-emerald-400 border-emerald-500/30">
          Save 20%
        </Badge>
      </div>

      {/* Pricing cards */}
      <div className="grid lg:grid-cols-5 md:grid-cols-3 gap-4">
        {PLANS.map((plan) => {
          const isCurrent = plan.id === billing.planId;
          const price = annual
            ? plan.annual > 0 ? Math.round(plan.annual / 12) : plan.monthly
            : plan.monthly;
          const isCustom = plan.monthly === -1;

          return (
            <div
              key={plan.id}
              className={`relative rounded-2xl p-[1px] ${plan.popular ? 'lg:scale-105' : ''}`}
              style={plan.popular ? {
                background: `linear-gradient(135deg, ${plan.accent}60, ${plan.accent}20)`,
              } : {}}
            >
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10">
                  <Badge
                    className="text-xs px-3 py-0.5 shadow-lg"
                    style={{ background: plan.accent, color: '#000', border: 'none' }}
                  >
                    <Star className="h-3 w-3 mr-1" /> Most Popular
                  </Badge>
                </div>
              )}
              <div
                className="h-full rounded-2xl p-5 flex flex-col"
                style={{
                  background: isCurrent
                    ? `linear-gradient(135deg, ${plan.accent}08, ${plan.accent}04)`
                    : 'linear-gradient(135deg, rgba(15,15,28,0.95), rgba(8,8,18,0.95))',
                  border: `1px solid ${isCurrent ? plan.accent + '40' : 'rgba(255,255,255,0.06)'}`,
                }}
              >
                <div className="mb-4">
                  <plan.icon className="h-5 w-5 mb-2" style={{ color: plan.accent }} />
                  <h3 className="text-base font-semibold text-white/90">{plan.name}</h3>
                  <p className="text-xs text-white/35 mt-0.5">{plan.description}</p>
                </div>

                <div className="mb-5">
                  {isCustom ? (
                    <p className="text-2xl font-bold text-white/90">Custom</p>
                  ) : (
                    <div className="flex items-baseline gap-1">
                      <span className="text-3xl font-bold text-white/90 font-mono">${price}</span>
                      <span className="text-sm text-white/30">/mo</span>
                    </div>
                  )}
                  {annual && !isCustom && plan.monthly > 0 && (
                    <p className="text-xs text-white/25 mt-0.5 line-through">${plan.monthly}/mo</p>
                  )}
                </div>

                <ul className="space-y-2 flex-1 mb-5">
                  {plan.features.map((f, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-white/60">
                      <Check className="h-3.5 w-3.5 mt-0.5 shrink-0" style={{ color: plan.accent }} />
                      <span>{f}</span>
                    </li>
                  ))}
                  {plan.limits.map((f, i) => (
                    <li key={`l-${i}`} className="flex items-start gap-2 text-xs text-white/25">
                      <span className="h-3.5 w-3.5 mt-0.5 shrink-0 text-center">—</span>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>

                {inDemo ? (
                  <Button
                    disabled
                    className="w-full rounded-full btn-press text-xs"
                    variant="outline"
                    style={{ opacity: 0.5 }}
                  >
                    Demo — Billing Disabled
                  </Button>
                ) : isCurrent ? (
                  <Button
                    disabled
                    className="w-full rounded-full btn-press text-xs"
                    variant="outline"
                  >
                    Current Plan
                  </Button>
                ) : isCustom ? (
                  <Button
                    onClick={() => toast.info('Contact sales@nexus-identity.io')}
                    className="w-full rounded-full btn-press text-xs"
                    variant="outline"
                  >
                    Contact Sales <ExternalLink className="h-3 w-3 ml-1" />
                  </Button>
                ) : (
                  <Button
                    onClick={() => handleUpgrade(plan.id)}
                    disabled={upgrading !== null}
                    className="w-full rounded-full btn-press text-xs"
                    style={plan.popular ? {
                      background: `linear-gradient(135deg, ${plan.accent}CC, ${plan.accent}99)`,
                      border: 'none',
                      color: '#000',
                    } : {}}
                    variant={plan.popular ? 'default' : 'outline'}
                  >
                    {upgrading === plan.id ? (
                      <div className="h-4 w-4 border-2 border-current/30 border-t-current rounded-full animate-spin" />
                    ) : (
                      <>
                        {price === 0 ? 'Downgrade' : 'Upgrade'} <ArrowRight className="h-3 w-3 ml-1" />
                      </>
                    )}
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Stripe connection notice */}
      {!isStripeConfigured() && (
        <div className="p-4 rounded-xl border border-amber-500/20 bg-amber-500/5">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0" />
            <div>
              <p className="text-sm font-medium text-amber-300">Connect Stripe for real payments</p>
              <p className="text-xs text-white/40 mt-0.5">
                Upgrades are currently simulated. Add your Stripe publishable key in Settings &gt; Integrations to enable live billing.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Payment method & Manage Subscription — hidden in demo */}
      {!inDemo && <Card className="border-border/40 glass-strong shadow-depth-md">
        <CardContent className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-white/5">
                <CreditCard className="h-5 w-5 text-white/40" />
              </div>
              <div>
                <p className="text-sm font-medium text-white/70">Payment Method</p>
                <p className="text-xs text-white/30">
                  {billing.planId === 'free' ? 'No payment method required' : 'Visa ending in ••4242'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {billing.planId !== 'free' && (
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-full btn-press text-xs"
                  onClick={handleManageSubscription}
                >
                  <Settings2 className="h-3.5 w-3.5 mr-1.5" />
                  Manage Subscription
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                className="rounded-full btn-press text-xs"
                onClick={() => {
                  if (isStripeConfigured()) {
                    openCustomerPortal();
                  } else {
                    toast.info('Connect Stripe in Settings > Integrations to manage payment methods');
                  }
                }}
              >
                {billing.planId === 'free' ? 'Add Payment' : 'Update Card'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>}

      {/* Invoice History */}
      <Card className="border-border/40 glass-strong shadow-depth-md">
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-white/5">
                <Receipt className="h-5 w-5 text-white/40" />
              </div>
              <div>
                <p className="text-sm font-medium text-white/70">Invoice History</p>
                <p className="text-xs text-white/30">Recent billing activity</p>
              </div>
            </div>
          </div>
          {billing.planId === 'free' ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <FileText className="h-8 w-8 text-white/15 mb-2" />
              <p className="text-xs text-white/30">No invoices — upgrade to a paid plan to see billing history</p>
            </div>
          ) : (
            <div className="space-y-2">
              {invoices.map((inv) => (
                <div
                  key={inv.id}
                  className="flex items-center justify-between p-3 rounded-xl border border-border/40 glass-effect"
                >
                  <div className="flex items-center gap-3">
                    <FileText className="h-4 w-4 text-white/25 shrink-0" />
                    <div>
                      <p className="text-sm text-white/70">{inv.description}</p>
                      <p className="text-xs text-white/30">{inv.date}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge
                      className="text-xs"
                      style={{
                        background: inv.status === 'paid' ? 'rgba(34,197,94,0.15)' : inv.status === 'pending' ? 'rgba(245,158,11,0.15)' : 'rgba(239,68,68,0.15)',
                        color: inv.status === 'paid' ? '#22c55e' : inv.status === 'pending' ? '#f59e0b' : '#ef4444',
                        border: `1px solid ${inv.status === 'paid' ? 'rgba(34,197,94,0.3)' : inv.status === 'pending' ? 'rgba(245,158,11,0.3)' : 'rgba(239,68,68,0.3)'}`,
                      }}
                    >
                      {inv.status}
                    </Badge>
                    <span className="text-sm font-mono text-white/60">{inv.amount}</span>
                  </div>
                </div>
              ))}
              <p className="text-xs text-white/20 text-center pt-2">
                {isStripeConfigured() ? 'View full history in Stripe Dashboard' : 'Mock data — connect Stripe for real invoices'}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Usage add-ons */}
      <div className="p-4 rounded-xl glass-effect border border-border/40 text-center">
        <p className="text-xs text-white/30">
          Need more? Add extra seats at $4/user/mo or additional SSO connectors at $15/mo.
          <button className="text-violet-400 hover:text-violet-300 ml-1 transition-colors"
            onClick={() => toast.info('Contact support to configure add-ons')}>
            Contact support
          </button>
        </p>
      </div>
    </div>
  );
}
