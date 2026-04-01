# Changelog

## [1.0.0-beta] - 2026-04-01

### Added
- **Supabase backend** — 13 tables with RLS, auto-migration from localStorage
- **Google SSO** — OAuth2 implicit flow, client-side token handling
- **Apple SSO** — configuration ready (requires Apple Developer account)
- **Passwordless vault** — passkey/TOTP gate with 30-minute session window
- **Threat scanning** — 8 detection rules analyzing real vault data
- **User management** — full directory with roles, MFA status, compliance tracking
- **Directory sync** — SCIM 2.0 connectors for Entra ID, Okta, Duo, Workday, Google Workspace
- **Hardware key inventory** — AAGUID auto-detection, bulk CSV import, lifecycle management
- **Security policies** — enforcement engine (password, MFA, session, vault, access)
- **Conditional access** — device trust, MFA requirements, session age rules
- **Break-glass emergency access** — time-limited admin override, rate-limited, audited
- **Session management** — active sessions dashboard, force-terminate
- **Audit logging** — every operation logged to Supabase
- **Post-quantum crypto** — agile architecture with algorithm-tagged payloads
- **Demo mode** — full platform evaluation with realistic seed data
- **Verifiable credentials** — W3C VC issuance with HMAC-SHA256 signatures
- **Liveness detection** — camera-based motion analysis
- **Profile pictures** — upload or URL, stored per user
- **Role-specific onboarding** — admin, individual, team, contractor paths
- **Drag-and-drop sidebar** — custom nav ordering persisted per user
- **Custom dashboard** — pin sections from any page
- **Admin submenus** — expandable navigation for admin sections
- **Billing** — 5 tiers with Stripe integration stubs
- **Error boundaries** — graceful error handling on every page
- **Production logging** — silent in prod, verbose in dev

### Security
- RBAC enforced on all 11 mutation hooks
- Per-user data isolation (notifications, settings, onboarding, billing)
- No auto-admin escalation for SSO users
- Passkey enforcement for returning users
- All demo passwords sanitized (no real API key patterns)
- GitHub push protection validated

### Infrastructure
- Vite + React + TypeScript
- Supabase (PostgreSQL) for persistent backend
- Tailwind CSS with AURA design system
- React Query for data management
- Web Crypto API for all cryptography
