/**
 * lib/stripe.ts — Stripe Checkout integration helpers.
 *
 * Provides functions to create Stripe Checkout sessions and manage subscriptions.
 * Uses the publishable key stored via ssoConfig.ts.
 *
 * TODO: Replace `pk_test_placeholder` with your actual Stripe publishable key.
 * TODO: Implement backend endpoints for creating Checkout sessions and Customer Portal links.
 */

import { getStripeKey } from './ssoConfig';
import { logWarn, logInfo } from './logger';

/* ── Price IDs ───────────────────────────────────────────────────────────── */

/**
 * Returns Stripe Price IDs for each plan.
 *
 * TODO: Replace these placeholder IDs with real Stripe Price IDs from your dashboard.
 */
export function getStripePrices(): Record<string, { monthly: string; annual: string }> {
  return {
    individual: {
      monthly: 'price_individual_monthly_placeholder', // TODO: Replace with real Stripe Price ID
      annual: 'price_individual_annual_placeholder',   // TODO: Replace with real Stripe Price ID
    },
    teams: {
      monthly: 'price_teams_monthly_placeholder',      // TODO: Replace with real Stripe Price ID
      annual: 'price_teams_annual_placeholder',        // TODO: Replace with real Stripe Price ID
    },
    business: {
      monthly: 'price_business_monthly_placeholder',   // TODO: Replace with real Stripe Price ID
      annual: 'price_business_annual_placeholder',     // TODO: Replace with real Stripe Price ID
    },
  };
}

/* ── Checkout ────────────────────────────────────────────────────────────── */

/**
 * Create a Stripe Checkout session and redirect the user.
 *
 * In production, this should call your backend which creates a Checkout Session
 * using the Stripe secret key and returns the session URL.
 *
 * TODO: Implement backend endpoint POST /api/billing/checkout
 */
export async function initStripeCheckout(
  priceId: string,
  successUrl: string,
  cancelUrl: string,
): Promise<void> {
  const publishableKey = getStripeKey();

  if (!publishableKey || publishableKey === 'pk_test_placeholder') {
    // DEMO mode — simulate checkout
    return simulateCheckout(successUrl);
  }

  // TODO: Call your backend to create a Checkout Session:
  // const res = await fetch('/api/billing/checkout', {
  //   method: 'POST',
  //   headers: { 'Content-Type': 'application/json' },
  //   body: JSON.stringify({ priceId, successUrl, cancelUrl }),
  // });
  // const { url } = await res.json();
  // window.location.href = url;

  // Fallback: Use Stripe.js to redirect (requires @stripe/stripe-js)
  // const stripe = await loadStripe(publishableKey);
  // await stripe?.redirectToCheckout({ lineItems: [{ price: priceId, quantity: 1 }], mode: 'subscription', successUrl, cancelUrl });

  logWarn('[Stripe] Backend checkout endpoint not implemented — falling back to simulation');
  return simulateCheckout(successUrl);
}

/* ── Customer Portal ─────────────────────────────────────────────────────── */

/**
 * Redirect user to Stripe Customer Portal for subscription management.
 *
 * TODO: Implement backend endpoint POST /api/billing/portal that creates
 * a Billing Portal session and returns the URL.
 */
export async function openCustomerPortal(): Promise<void> {
  const publishableKey = getStripeKey();

  if (!publishableKey || publishableKey === 'pk_test_placeholder') {
    logWarn('[Stripe] No Stripe key configured — customer portal unavailable');
    return;
  }

  // TODO: Call your backend:
  // const res = await fetch('/api/billing/portal', { method: 'POST' });
  // const { url } = await res.json();
  // window.location.href = url;

  logWarn('[Stripe] Backend portal endpoint not implemented');
}

/* ── Helpers ─────────────────────────────────────────────────────────────── */

/** Check whether Stripe is configured with a real key. */
export function isStripeConfigured(): boolean {
  const key = getStripeKey();
  return !!key && key !== 'pk_test_placeholder';
}

/** Simulate a checkout redirect with a short delay (demo mode). */
async function simulateCheckout(successUrl: string): Promise<void> {
  await new Promise(r => setTimeout(r, 1200));
  // In demo mode, just mark as success
  logInfo('[Stripe] Demo checkout complete — would redirect to:', successUrl);
}

/* ── Mock Invoice Data ───────────────────────────────────────────────────── */

export interface InvoiceItem {
  id: string;
  date: string;
  amount: string;
  status: 'paid' | 'pending' | 'failed';
  description: string;
  pdfUrl?: string;
}

/** Returns mock invoice history for the billing page. */
export function getMockInvoices(): InvoiceItem[] {
  const now = Date.now();
  return [
    {
      id: 'inv_demo_001',
      date: new Date(now - 5 * 24 * 60 * 60 * 1000).toLocaleDateString(),
      amount: '$25.00',
      status: 'paid',
      description: 'Teams Plan — Monthly',
    },
    {
      id: 'inv_demo_002',
      date: new Date(now - 35 * 24 * 60 * 60 * 1000).toLocaleDateString(),
      amount: '$25.00',
      status: 'paid',
      description: 'Teams Plan — Monthly',
    },
    {
      id: 'inv_demo_003',
      date: new Date(now - 65 * 24 * 60 * 60 * 1000).toLocaleDateString(),
      amount: '$8.00',
      status: 'paid',
      description: 'Individual Plan — Monthly',
    },
    {
      id: 'inv_demo_004',
      date: new Date(now - 95 * 24 * 60 * 60 * 1000).toLocaleDateString(),
      amount: '$8.00',
      status: 'paid',
      description: 'Individual Plan — Monthly',
    },
  ];
}
