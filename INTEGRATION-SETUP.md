# Nexus Identity — Integration Setup Guide

## 1. Stripe Billing

### What you need
- Stripe account (https://dashboard.stripe.com/register)
- Publishable key (starts with `pk_live_` or `pk_test_`)
- 4 Products with Prices created in Stripe

### Step-by-step

1. **Create Products in Stripe Dashboard** → Products → Add Product:

   | Product Name | Monthly Price ID | Annual Price ID |
   |-------------|-----------------|-----------------|
   | Individual  | `price_xxx`     | `price_xxx`     |
   | Teams       | `price_xxx`     | `price_xxx`     |
   | Business    | `price_xxx`     | `price_xxx`     |

   Set monthly prices: $8, $25, $79. Set annual prices: $77, $240, $758.

2. **Get your Publishable Key** → Developers → API Keys → copy `pk_test_...` or `pk_live_...`

3. **Enter in Nexus** → Settings → Integrations → Stripe Publishable Key → paste and save

4. **Update Price IDs** in `lib/stripe.ts` lines 23-38 — replace all `price_xxx_placeholder` with your real Price IDs from step 1

5. **Backend requirement**: Stripe Checkout requires a server-side endpoint to create checkout sessions. Options:
   - **Cloudflare Worker** (recommended): Deploy a simple worker that calls `stripe.checkout.sessions.create()`
   - **Vercel Edge Function**: Same pattern
   - **ICP canister HTTP outcall**: Call Stripe API from the canister

   The endpoint should accept `{ priceId, successUrl, cancelUrl }` and return `{ url }`.

6. **Update `lib/stripe.ts`** line 52: Replace the TODO with your backend URL:
   ```typescript
   const res = await fetch('https://your-backend.com/api/billing/checkout', { ... });
   ```

### Testing
- Use `pk_test_` key and test card `4242 4242 4242 4242` in Stripe test mode
- Switch to `pk_live_` when going live

---

## 2. Apple Sign-In

### What you need
- Apple Developer account ($99/year)
- App ID with "Sign in with Apple" capability
- Services ID (client_id for web)

### Step-by-step

1. **Apple Developer Console** → Certificates, IDs & Profiles → Identifiers

2. **Create an App ID**:
   - Description: "Nexus Identity"
   - Bundle ID: `io.nexus-identity.app`
   - Enable "Sign in with Apple"

3. **Create a Services ID**:
   - Description: "Nexus Identity Web"
   - Identifier: `io.nexus-identity.web` (this is your client_id)
   - Enable "Sign in with Apple"
   - Configure web domain: `nexus-identity.io` (or your domain)
   - Return URL: `https://yourdomain.com/` (must be HTTPS in production)

4. **Enter in Nexus** → Settings → Integrations → Apple Sign In Client ID → paste `io.nexus-identity.web`

5. **Backend requirement**: Apple requires a `client_secret` JWT signed with your private key for token exchange. You need:
   - Download the private key (.p8) from Apple Developer
   - Generate the JWT server-side (it rotates every 6 months)
   - Implement `/api/auth/apple/callback` endpoint

### Important
- Apple Sign-In ONLY works on HTTPS (not localhost)
- For local testing, use the demo/simulation mode
- Apple requires displaying the Apple button per their Human Interface Guidelines

---

## 3. Contact Support (Email Service)

### What you need
- Email service account: Resend (recommended), SendGrid, or AWS SES

### Option A: Resend (Recommended — simplest)

1. **Sign up** at https://resend.com (free tier: 100 emails/day)

2. **Get API key** → API Keys → Create

3. **Add domain** → Domains → Add → verify DNS records

4. **Update `lib/helpRequests.ts`** — uncomment the Resend block (lines 124-134):
   ```typescript
   const RESEND_API_KEY = 'your-resend-api-key'; // Move to env var in production

   const res = await fetch('https://api.resend.com/emails', {
     method: 'POST',
     headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
     body: JSON.stringify({
       from: 'Nexus Identity <noreply@yourdomain.com>',
       to: ['admin@yourdomain.com'],
       reply_to: req.requesterEmail,
       subject: `[Nexus Support] ${req.subject}`,
       text: body,
     }),
   });
   ```

5. **Security note**: The API key should be stored server-side, not in frontend code. For production, create a backend endpoint that accepts the ticket data and sends the email.

### Option B: SendGrid

1. Sign up at https://sendgrid.com
2. Get API key → Settings → API Keys → Create
3. Uncomment the SendGrid block in `lib/helpRequests.ts` (lines 137-147)

---

## 4. Okta Integration

### What you need
- Okta developer account (free: https://developer.okta.com/signup/)
- Or existing Okta organization

### SCIM Provisioning (Directory Sync)

1. **In Okta Admin** → Applications → Create App Integration → SCIM 2.0

2. **Configure SCIM connection**:
   - Base URL: `https://your-nexus-backend.com/scim/v2/`
   - Auth: Bearer Token (generate in Nexus Admin → SDK → API Keys)
   - Supported operations: Create Users, Update Users, Deactivate Users

3. **In Nexus Admin** → Directory & Identity Sync → Add Connection → Okta:
   - Tenant URL: `https://your-org.okta.com`
   - Client ID: from your Okta app
   - Sync interval: 15 minutes

4. **Attribute mapping** (auto-configured, customize if needed):
   | Okta Field | Nexus Field |
   |-----------|-------------|
   | userName  | email       |
   | name.givenName | firstName |
   | name.familyName | lastName |
   | active    | isActive    |

### SSO (OAuth2 PKCE)

1. **In Okta Admin** → Applications → Create App Integration → OIDC Web Application

2. **Configure**:
   - Sign-in redirect URI: `https://yourdomain.com/`
   - Sign-out redirect URI: `https://yourdomain.com/`
   - Grant type: Authorization Code with PKCE
   - Client authentication: None (public client)

3. **Copy** Client ID → paste in Nexus Settings → Integrations

---

## 5. Microsoft Entra ID Integration

### What you need
- Azure AD tenant (free tier available)
- Global Administrator or Application Administrator role

### SCIM Provisioning

1. **Azure Portal** → Entra ID → Enterprise Applications → New Application → Create your own

2. **Provisioning** → Automatic → Enter:
   - Tenant URL: `https://your-nexus-backend.com/scim/v2/`
   - Secret Token: generate in Nexus Admin → SDK → API Keys

3. **Attribute mapping**: Map Azure AD attributes to Nexus SCIM attributes

4. **In Nexus Admin** → Directory Sync → Add Connection → Entra ID:
   - Tenant URL: `https://graph.microsoft.com/v1.0`
   - Client ID: from your Azure app registration
   - Scopes: `User.Read.All`, `Group.Read.All`

### SSO (OAuth2)

1. **Azure Portal** → App registrations → New registration
   - Redirect URI: `https://yourdomain.com/` (type: SPA)
   - Supported account types: Single tenant or Multi-tenant

2. **Copy** Application (client) ID → paste in Nexus Settings

### FIDO2 Key Management (AAGUIDs)

Nexus supports Entra ID FIDO2 key pre-registration via AAGUIDs:
- Navigate to Entra ID → Security → Authentication methods → Passkey (FIDO2)
- Add allowed AAGUIDs for your organization's hardware keys
- Nexus Hardware Key Inventory tracks the same AAGUIDs

---

## 6. Cisco Duo Integration

### What you need
- Duo Admin account
- Admin API credentials (Integration Key, Secret Key, API Hostname)

### Setup

1. **Duo Admin Panel** → Applications → Protect an Application → "Admin API"

2. **Copy**:
   - Integration Key (client_id)
   - Secret Key (client_secret — store server-side only)
   - API Hostname: `api-XXXXXXXX.duosecurity.com`

3. **In Nexus Admin** → Directory Sync → Add Connection → Cisco Duo:
   - Tenant URL: `https://api-XXXXXXXX.duosecurity.com`
   - Client ID: Integration Key

4. **Duo Directory Sync** imports users from your Active Directory through Duo

---

## Demo Mode

For prospects and testing:

1. On the login screen, click "DEMO ACCESS"
2. Enter passphrase: `nexus-demo-2026`
3. Platform loads with:
   - 5 realistic vault entries
   - 2 team members
   - 3 security policies
   - Sample audit log
   - Full enterprise tier access
   - Billing disabled

To exit: Click "EXIT DEMO" in the top bar.
