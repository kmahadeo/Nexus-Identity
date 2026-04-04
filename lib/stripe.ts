/**
 * lib/stripe.ts — Stripe billing integration.
 *
 * Beta mode: VITE_BETA_MODE=true bypasses all payments.
 * When beta ends, set VITE_BETA_MODE=false to enable real billing.
 *
 * Beta bypass codes (enter in billing page to get free access):
 *   - "NEXUS-BETA-2026" — full enterprise access, no charge
 *   - Admin accounts (kaushik.mahadeokar@gmail.com) auto-bypass
 */

import { getStripeKey } from './ssoConfig';

/* ── Beta Mode ──────────────────────────────────────────────────────────── */

const BETA_BYPASS_CODES = ['NEXUS-BETA-2026', 'NEXUS-FOUNDER', 'NEXUS-DEMO-2026'];
const BETA_BYPASS_EMAILS = ['kaushik.mahadeokar@gmail.com', 'admin@nexus.io', 'demo@nexus-identity.io'];
const BETA_KEY = 'nexus-beta-activated';

export function isBetaMode(): boolean {
  // Check env var first
  if (import.meta.env.VITE_BETA_MODE === 'true') return true;
  // Check if user activated beta via code
  return localStorage.getItem(BETA_KEY) === 'true';
}

export function activateBeta(code: string): boolean {
  if (BETA_BYPASS_CODES.includes(code.toUpperCase().trim())) {
    localStorage.setItem(BETA_KEY, 'true');
    return true;
  }
  return false;
}

export function isBetaEmail(email: string): boolean {
  return BETA_BYPASS_EMAILS.includes(email.toLowerCase().trim());
}

/* ── Stripe Key ─────────────────────────────────────────────────────────── */

function getKey(): string {
  // Env var takes priority
  const envKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
  if (envKey) return envKey;
  // Fall back to Settings config
  return getStripeKey();
}

export function isStripeConfigured(): boolean {
  const key = getKey();
  return !!key && !key.includes('placeholder');
}

/* ── Price IDs ──────────────────────────────────────────────────────────── */

/**
 * Stripe Price IDs for each plan.
 * Create these in Stripe Dashboard → Products → Add Product → Add Price.
 * Then replace the placeholder values below.
 */
export function getStripePrices(): Record<string, { monthly: string; annual: string }> {
  return {
    individual: {
      monthly: 'price_individual_monthly', // TODO: Replace after creating in Stripe
      annual: 'price_individual_annual',
    },
    teams: {
      monthly: 'price_teams_monthly',
      annual: 'price_teams_annual',
    },
    business: {
      monthly: 'price_business_monthly',
      annual: 'price_business_annual',
    },
  };
}

/* ── Checkout ───────────────────────────────────────────────────────────── */

export async function initStripeCheckout(
  priceId: string,
  successUrl: string,
  _cancelUrl: string,
): Promise<void> {
  // Beta mode — simulate success, no charge
  if (isBetaMode()) {
    console.log('[Stripe] Beta mode — checkout bypassed, no charge');
    await new Promise(r => setTimeout(r, 800));
    return;
  }

  // Check if user's email is in bypass list
  try {
    const session = JSON.parse(localStorage.getItem('nexus-session') ?? 'null');
    if (session?.email && isBetaEmail(session.email)) {
      console.log('[Stripe] Founder/admin bypass — no charge');
      await new Promise(r => setTimeout(r, 800));
      return;
    }
  } catch {}

  // Real Stripe checkout would happen here via backend
  // For now, Stripe Checkout requires a server-side session creation
  // TODO: Create Cloudflare Worker at /api/billing/checkout
  console.log('[Stripe] Would charge for price:', priceId);
  await new Promise(r => setTimeout(r, 800));
}

/* ── Customer Portal ────────────────────────────────────────────────────── */

export async function openCustomerPortal(): Promise<void> {
  if (isBetaMode()) {
    console.log('[Stripe] Beta mode — portal not available');
    return;
  }
  // TODO: Backend endpoint for Stripe Customer Portal
  console.log('[Stripe] Customer portal requires backend endpoint');
}

/* ── Invoice Data ───────────────────────────────────────────────────────── */

export interface InvoiceItem {
  id: string;
  date: string;
  amount: string;
  status: 'paid' | 'pending' | 'failed';
  description: string;
}

export function getMockInvoices(): InvoiceItem[] {
  if (isBetaMode()) {
    return [{
      id: 'inv_beta',
      date: new Date().toLocaleDateString(),
      amount: '$0.00',
      status: 'paid',
      description: 'Beta Access — No Charge',
    }];
  }

  const now = Date.now();
  return [
    { id: 'inv_001', date: new Date(now - 5 * 86400000).toLocaleDateString(), amount: '$25.00', status: 'paid', description: 'Teams Plan — Monthly' },
    { id: 'inv_002', date: new Date(now - 35 * 86400000).toLocaleDateString(), amount: '$25.00', status: 'paid', description: 'Teams Plan — Monthly' },
  ];
}
