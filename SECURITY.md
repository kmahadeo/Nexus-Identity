# Security Policy

## Reporting Vulnerabilities

If you discover a security vulnerability, please report it responsibly. Do NOT open a public GitHub issue.

Email: security@nexus-identity.io

## Security Architecture

### Authentication
- FIDO2/WebAuthn passkeys (ECDSA P-256)
- TOTP MFA (HMAC-SHA-1, RFC 6238)
- OAuth2 with PKCE (Google, Apple)
- No passwords stored — fully passwordless architecture

### Encryption
- **Data at rest**: AES-256-GCM via Web Crypto API
- **Key derivation**: PBKDF2-SHA-256 (310,000 iterations)
- **Transport**: TLS 1.3 with X25519MLKEM768 hybrid PQC (browser-native)

### Access Control
- Role-based access control (RBAC) with 5 roles and 24 permissions
- Just-in-time (JIT) access grants with expiration
- Conditional access policies (device trust, MFA, session age)
- Break-glass emergency access (rate-limited, audited)

### Data Isolation
- All user data scoped by principal_id
- Supabase row-level security (RLS) enabled on all tables
- No cross-user data access possible through the API

### Post-Quantum Readiness
- Crypto-agile architecture: every encrypted payload tagged with algorithm ID
- AES-256-GCM is quantum-safe (128-bit effective strength post-quantum)
- Ready for ML-KEM (FIPS 203) hybrid encryption when browser support arrives
- FIDO2 PQC signatures expected 2028+ per FIDO Alliance roadmap

### Audit Trail
- Every security-relevant operation logged
- Immutable audit log synced to Supabase
- Actor, resource, action, result, timestamp, IP address captured

## Sensitive Data Handling

- `.env.local` contains Supabase credentials — NEVER committed to version control
- OAuth client IDs are semi-public by design (visible in redirect URLs)
- OAuth tokens/secrets stored server-side only (not in browser localStorage)
- Stripe publishable key is safe for client-side use
- TOTP secrets encrypted at rest in Supabase
