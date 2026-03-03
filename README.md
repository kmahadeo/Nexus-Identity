# Nexus Identity

## Overview
Nexus Identity is a production-grade identity platform providing an autonomous, self-adapting security layer. The system integrates verified production APIs across authentication, credential management, enterprise identity, MFA, SIEM, and AI-driven security intelligence. 

## Live Deployment
Access the client portal: [Nexus Identity Platform](https://nexus-identity-d1t.caffeine.xyz/)

## Architecture
The repository operates as a monorepo. It separates the user interface from the core identity logic while utilizing a decentralized hosting model.

* **Frontend (TypeScript/React):** Powers the user experience. It manages WebAuthn and passkey prompts to reduce authentication friction for end-users.
* **Backend (TypeScript):** Contains API routing and authentication verification. It enforces strict typing on identity tokens to prevent unauthorized access caused by malformed data payloads.
* **Infrastructure (Motoko/DFINITY ICP):** The `dfx.json` configuration deploys the application as a decentralized canister smart contract. This provides a tamper-proof authentication layer by eliminating centralized points of failure.

## Current Integrations
* **Entra ID:** Manages real-time MFA status syncing and external token verification.

## Architecture Roadmap
* **ServiceNow SecOps & Veza:** (coming-soon) Nexus Identity is architected to serve as the authentication trigger for continuous authorization. The target workflow will utilize the Open Authorization API (OAA) to ingest custom identity metadata and feed anomalous authentication events into the Veza Access Graph via webhook, initiating automated remediation within ServiceNow SIR.
## Repository Structure
* `frontend/`: Client-side logic and interface components.
* `backend/`: Server-side API routing and identity provider integrations.
* `deps/`: Project dependencies.
* `dfx.json`: Deployment configuration for the Internet Computer network.
* `spec.md`: System specifications and architectural blueprint.

## Getting Started
1. Clone the repository and install Node.js dependencies in the root directory.
2. Review `spec.md` for specific environment variable requirements regarding the Entra ID integration.
3. Utilize the DFINITY SDK to initiate the local canister environment.
