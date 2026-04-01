# Nexus Identity

Passwordless identity and access management platform with zero-trust architecture, enterprise directory sync, and post-quantum cryptography readiness.

## Quick Start

```bash
# Install dependencies
npm install

# Copy environment template and add your Supabase credentials
cp .env.example .env.local

# Start development server
npm run dev
```

Open [http://localhost:5173](http://localhost:5173)

## Architecture

```
├── lib/                    # Core libraries
│   ├── supabase.ts         # Supabase client (persistent backend)
│   ├── supabaseStorage.ts  # Data layer (Supabase + localStorage fallback)
│   ├── migrateToSupabase.ts# One-time localStorage → Supabase migration
│   ├── webauthn.ts         # FIDO2/WebAuthn passkey management
│   ├── totp.ts             # RFC 6238 TOTP implementation
│   ├── crypto.ts           # AES-256-GCM encryption (Web Crypto API)
│   ├── vaultCrypto.ts      # Vault-specific encryption layer
│   ├── pqcCrypto.ts        # Post-quantum crypto agility layer
│   ├── permissions.ts      # RBAC + JIT access + conditional access + break-glass
│   ├── auditLog.ts         # Security event logging
│   ├── storage.ts          # localStorage helpers (user-scoped)
│   ├── oauth.ts            # OAuth2 PKCE flows
│   ├── ssoConfig.ts        # Google/Apple SSO configuration
│   ├── stripe.ts           # Stripe billing integration
│   ├── directorySync.ts    # SCIM 2.0 directory sync engine
│   ├── helpRequests.ts     # Support ticket system
│   ├── verifiableCredentials.ts # W3C Verifiable Credentials
│   ├── demoMode.ts         # Demo mode with seed data
│   └── logger.ts           # Production-safe logging
├── hooks/                  # React hooks
│   ├── useInternetIdentity.tsx # Auth context + session management
│   └── useQueries.ts       # Data hooks (React Query + Supabase sync)
├── supabase/
│   └── migrations/         # Database schema (run in Supabase SQL Editor)
├── components/ui/          # Shadcn/Radix UI components
└── [Page].tsx              # Page components
```

## Features

### Authentication
- **Passkeys (FIDO2/WebAuthn)** — phishing-proof, device-bound credentials
- **TOTP MFA** — Google Authenticator, Microsoft Authenticator, Duo, Okta Verify
- **Google SSO** — OAuth2 implicit flow (client-side, no backend needed)
- **Apple SSO** — configuration ready (requires Apple Developer account)
- **Liveness detection** — camera-based motion analysis for biometric verification

### Vault
- **AES-256-GCM encryption** — client-side, zero-knowledge
- **Passkey/TOTP gate** — re-verification required after 30-minute session timeout
- **Password generator** — cryptographically random via Web Crypto API
- **Threat scanning** — 8 detection rules (weak passwords, credential reuse, rotation, HTTP URLs, common passwords)

### Enterprise
- **User management** — directory with roles, MFA status, compliance tracking
- **Security policies** — password, MFA, session, vault, access enforcement (advisory/warn/block)
- **Directory sync** — SCIM 2.0 connectors for Entra ID, Okta, Cisco Duo, Workday, Google Workspace
- **Hardware key inventory** — AAGUID auto-detection, lifecycle management, bulk import
- **Session management** — active sessions, force-terminate
- **Conditional access** — device trust, MFA requirements, session age rules
- **Break-glass emergency access** — time-limited admin override, rate-limited, fully audited
- **Audit logging** — every operation logged with actor, resource, result

### Security
- **RBAC** — 5 roles (admin, individual, team, contractor, guest) with 24 permissions
- **JIT access** — time-boxed permission grants
- **Post-quantum readiness** — crypto-agile architecture with algorithm-tagged payloads
- **Data isolation** — all user data scoped by principalId
- **Error boundaries** — graceful error handling on every page

### Billing
- **5 pricing tiers** — Free, Individual ($8), Teams ($25), Business ($79), Enterprise (custom)
- **Stripe integration ready** — checkout, customer portal, invoice history
- **Demo mode** — full platform access for evaluation (passphrase: see INTEGRATION-SETUP.md)

## Backend

**Supabase** (PostgreSQL) — 13 tables with row-level security:

| Table | Purpose |
|-------|---------|
| profiles | User directory |
| vault_entries | Encrypted credentials |
| passkeys | FIDO2 credentials |
| teams / team_members | Team management |
| shared_vault_entries | Shared credentials |
| security_policies | Enforced policies |
| audit_log | Security events |
| hardware_keys | FIDO2 key inventory |
| totp_credentials | Authenticator secrets |
| help_requests | Support tickets |
| directory_connections | SCIM directory configs |
| active_sessions | Session management |

## Environment Variables

```bash
# Required
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

See [INTEGRATION-SETUP.md](INTEGRATION-SETUP.md) for Stripe, Apple SSO, Okta, Entra ID, and email service setup.

## Deployment

```bash
# Build for production
npm run build

# Deploy to Cloudflare Pages
npx wrangler pages deploy dist

# Or deploy to Vercel
npx vercel --prod
```

## Security

- All secrets stored in `.env.local` (gitignored)
- No credentials hardcoded in source code
- Supabase anon key is safe for client-side use (RLS enforces access control)
- AES-256-GCM encryption is quantum-safe (128-bit effective strength post-quantum)
- WebAuthn signatures (ECDSA P-256) will migrate to PQC when FIDO standards update

## License

Proprietary. All rights reserved.
