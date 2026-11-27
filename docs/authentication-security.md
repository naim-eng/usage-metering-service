# Customer Authentication Security

## Authentication architecture

Customer authentication uses Better Auth with PostgreSQL.
Authentication records are stored in the dedicated auth schema.

Customer credentials are separate from metering API keys
and administrative API credentials.

## Password security

- Minimum password length: 15 characters under the implemented
  raw-length and normalized Unicode validation rules.
- Maximum password length: 128 UTF-16 code units.
- Unicode normalization: NFKC.
- Password hashing: versioned scrypt with random salts.
- Legacy password hashes remain supported.
- Production password establishment uses compromised-password
  screening through the Have I Been Pwned range API.
- Screening failures prevent password establishment.
- Local development and isolated E2E tests do not require
  external password screening services.

## Registration and email verification

- Registration does not automatically create a session.
- Email verification is required before password authentication.
- Verification tokens expire after 60 minutes.
- Verification does not automatically authenticate customers.
- Initial registration credentials are invalidated during
  email verification.
- Email owners establish their final password through recovery.
- Duplicate registration responses use generic confirmation.
- Verification resend responses suppress account existence
  information within the tested scenarios.

## Password recovery

- Password reset tokens expire after 30 minutes.
- Invalid, expired and consumed reset tokens are rejected.
- Successful password reset revokes existing sessions.
- Previous passwords cannot authenticate after successful reset.
- Password reset requests use generic confirmation.
- Password establishment follows the server-side password policy.

## Email delivery

- Local email delivery uses Mailpit on loopback interfaces.
- Development and E2E email infrastructure are isolated.
- Production SMTP requires authenticated encrypted transport.
- Authentication email URLs are restricted to the configured
  application origin.
- Automated tests use synthetic email recipients.

## Automated security coverage

Authentication regression coverage includes:

- Registration and duplicate registration.
- Password length and Unicode normalization boundaries.
- Legacy password compatibility.
- Credential integrity and password changes.
- Authentication error response equivalence.
- Email verification and verification token expiration.
- Tampered verification token rejection.
- Verification resend behavior.
- Concurrent verification requests.
- Original registration credential invalidation.
- Password reset token expiration and replay rejection.
- Session revocation following password reset.

## Session and cookie security

- Sessions have a fixed lifetime of 24 hours.
- Automatic session lifetime extension is disabled.
- Session cookie caching is disabled.
- Session cookies use HttpOnly and SameSite=Lax.
- Secure cookies are enabled for HTTPS application origins.
- Cookies are host-scoped without cross-subdomain sharing.
- Password changes require a session younger than 15 minutes
  and verification of the current password.
- Expired sessions cannot authenticate or renew.
- Fresh authentication generates a new session token.
- Revoked session tokens cannot authenticate.
- Customers can revoke other sessions while preserving
  their current session through the authentication API.
- Password recovery revokes existing sessions.
- Signing out invalidates the current session.

### Session security validation

Automated local E2E tests cover cookie attributes, fixed
expiration, expired sessions, revoked token replay, password
change freshness, selective session revocation and logout.

Production HTTPS cookie behavior requires separate validation.
The freshness requirement is explicitly enforced for password
changes and is not a universal restriction on every endpoint.

## Rate limiting and abuse protection

### Customer authentication

Authentication rate limiting is explicitly enabled and uses
PostgreSQL-backed storage outside the isolated E2E environment.

Migration 010 creates the auth.rateLimit table with unique
rate limit keys and an indexed last-request timestamp.

| Endpoint | Maximum requests | Window |
| --- | ---: | ---: |
| General authentication | 100 | 60 seconds |
| Sign-in | 5 | 60 seconds |
| Registration | 5 | 300 seconds |
| Password change | 5 | 300 seconds |
| Password reset request | 3 | 300 seconds |
| Password reset submission | 5 | 300 seconds |
| Verification email resend | 3 | 300 seconds |
| Email change | 3 | 300 seconds |

These are configured endpoint rules. Better Auth applies its
native rate limiting window semantics.

Untrusted forwarded IP headers are deliberately ignored.
Until trusted ingress is configured, requests share a
per-path rate limit bucket. This prevents header spoofing
but can cause service-wide authentication throttling.

IPv6 subnet normalization is configured at /64.

The isolated E2E environment retains relaxed, memory-based
limits for ordinary functional tests. A dedicated database
test exercises concurrent requests, cross-instance enforcement,
spoofed headers and expired rate limit records.

### Backend API

Existing backend limits remain unchanged:

- Management API: 300 requests per 15 minutes.
- Consumption pre-authentication: 10,000 requests per minute.
- Authenticated consumption: 3,000 requests per account per minute.

Consumption limits are associated with authenticated account
identity rather than individual API keys.

Proxy trust is disabled by default. Explicit IP addresses
and CIDR ranges are supported. Unrestricted proxy trust,
numeric hop counts and invalid address ranges are rejected.

Backend rate limiting remains process-local.

### Verified enforcement

Automated tests cover:

- Persistent authentication rate limit storage.
- Concurrent and cross-instance authentication enforcement.
- Authentication rate limit expiration.
- Untrusted forwarded IP header rotation.
- Independent trusted client IP buckets.
- Spoofed leftmost forwarded IP addresses.
- IPv6 address rotation within a subnet.
- Account isolation across multiple API keys.
- Pre-authentication request throttling.
- HTTP 429 responses and retry information.
- Health endpoint availability after limit exhaustion.

### Outstanding rate limiting production safeguards

Before public deployment:

- Configure trusted ingress that overwrites client-supplied
  forwarding headers and prevents direct origin access.
- Validate client IP identification through the actual ingress.
- Replace shared authentication fallback buckets with verified
  client identification.
- Evaluate account-targeted and distributed authentication
  abuse protection beyond per-IP endpoint limits.
- Validate the complete application authentication policy,
  including alternate endpoint paths and route normalization.
- Establish rate limit record retention and scheduled cleanup.
- Validate storage failure behavior and operational monitoring.
- Restrict backend deployment to one API replica until shared
  rate limiting storage is implemented and validated.
- Review thresholds against realistic customer traffic.

These are production readiness requirements, not completed
deployment validations.

## Outstanding production security requirements

The following remain required before production approval:

- Make credential invalidation and email verification atomic,
  or implement an equivalent race-safe activation mechanism.
- Review overlapping verification and password reset requests.
- Review account enumeration through response timing,
  delivery failures and response metadata.
- Review authentication logging and sensitive data exposure.
- Validate production HTTPS cookie enforcement and transport security.
- Validate authentication rate limits and abuse protection.
- Validate HTTP security headers and CSRF protection.
- Validate production SMTP connectivity and delivery.

Passing local tests does not establish production readiness.

## API key and administrative endpoint security

### API credential generation and storage

- API keys contain 256 bits of cryptographically secure randomness.
- Credentials use the format `um_` followed by 64 lowercase
  hexadecimal characters.
- Only SHA-256 credential hashes are persisted.
- Complete credentials are returned during creation or rotation.
- Managed project key listings expose metadata, not credential
  hashes or complete credentials.
- Credential-bearing administrative responses use Cache-Control:
  no-store.

### Administrative authentication

Administrative endpoints require the X-Admin-Key header.

The shared administrative authentication middleware rejects missing,
malformed, duplicated and incorrect credentials. Credential
comparison uses fixed-length SHA-256 digests and timing-safe
comparison.

The administrative credential must remain server-side and must
never be distributed to customer applications.

### Managed project credentials

Every newly provisioned project receives an initial managed
credential named Original project key.

Additional credentials can be generated and revoked independently.
Revoked credentials and credentials belonging to inactive projects
cannot authenticate new requests.

Project-linked metering accounts cannot authenticate directly
through their underlying account credential.

Migration 011 transfers existing project account credential hashes
into the managed project credential table and replaces the
underlying account hashes. Existing standalone account credentials
remain unchanged.

Production migration requires coordinated application deployment
and suspension of credential-related writes during migration.

### Standalone account credential rotation

Endpoint:

    POST /accounts/:accountId/api-key/rotate

Required header:

    X-Admin-Key: <administrative credential>

A successful request returns HTTP 200 with accountId and apiKey.

The replacement credential invalidates the previous credential
for subsequent authentication attempts. Rotation updates only
the credential hash and does not recreate the account.

Project-linked accounts are excluded from standalone rotation.

Invalid account identifiers return HTTP 400. Missing accounts
and project-linked accounts return HTTP 404. Invalid
administrative credentials return HTTP 401.

Rotation has no grace period. Applications must replace their
stored credential immediately.

Concurrent rotations use last-write-wins semantics. Operators
must serialize rotation requests for the same account.
Requests authenticated before rotation or revocation may
still complete.

### Security validation

Stage 7 validation includes:

- 11 new API credential and administrative authentication unit tests.
- 59 passing backend integration tests.
- Four successful legacy migration verification checks.
- Three passing targeted project and credential browser tests.
- Successful backend and frontend TypeScript validation.
- Successful frontend lint validation.
- Migration 011 applied to development, backend integration
  and isolated E2E databases.

Full regression testing remains required at GitHub Checkpoint 3.

Production transport security, administrative credential lifecycle,
security audit logging and deployment safeguards remain subject
to subsequent security stages.

## Tenant isolation and authorization

### Tenant security boundaries

- Customer project operations require an authenticated session and valid organization membership.
- Active workspace selection does not independently grant access to organization resources.
- Membership and role authorization are checked server-side.
- Project creation and API key management require owner or administrator permissions.
- Ordinary members are denied access to the current owner/admin project API endpoints, including project listings and dashboards.
- Removed memberships cannot continue accessing project APIs through stale workspace selections.
- Customer-supplied organization identifiers do not override server-resolved tenant context.

### Backend tenant isolation

- Administrative project endpoints require administrative authentication.
- Project lookups are scoped to both organization and project identifiers.
- Project API key operations are scoped to the authorized project.
- Dashboard queries use the metering account associated with the authorized project.
- Metering API credentials cannot grant access to unrelated accounts.
- Administrative credentials remain server-side.
- Administrative frontend requests reject backend redirects.

### API response protection

- Project creation responses validate organization ownership and expected project metadata.
- API key creation responses validate project identity and credential format.
- Dashboard responses validate organization and project identity.
- Explicit response field allowlists prevent unexpected backend fields from being forwarded.
- Nested dashboard records are filtered according to their expected response contracts.
- Missing or incorrectly typed required dashboard fields cause response rejection.
- API key listings expose credential metadata rather than plaintext credentials or stored hashes.

### Organization privilege escalation protection

The existing Better Auth organization permission policy is retained.

Direct endpoint tests verify that ordinary members cannot:

- Promote themselves to administrator or owner.
- Modify organization metadata.
- Create an unauthorized owner invitation.
- Remove their own membership through the administrative removal endpoint.

Membership remains unchanged after the tested unauthorized operations.

### Security validation

Targeted validation includes independent customer isolation, isolation between workspaces owned by the same customer, unauthorized workspace activation, forged organization identifiers, stale membership authorization, role enforcement and credential metadata protection.

Eight dashboard response unit tests cover valid response contracts, unexpected sensitive fields, malformed records, missing sections, incorrect field types and unavailable historical limits.

### Remaining security considerations

- Nested dashboard records without tenant identifiers rely on backend account-scoped queries for ownership enforcement.
- Response filtering validates field structure and types but does not independently establish the ownership of every nested record.
- Dashboard malformed-response tests exercise the filtering function directly rather than a simulated compromised backend.
- Complete invitation, membership removal and ownership transfer lifecycle validation remains necessary before introducing customer-facing team management.
- Concurrent membership revocation and already-authorized in-flight requests require separate consideration.
- Production trusted client IP configuration remains part of production configuration hardening.
- Full regression testing and remote CI validation will be performed at GitHub checkpoint 3.


## Input validation and request protection

The application implements the following request protection controls:

- Backend and frontend JSON payload limits of 16 KiB.
- Rejection of unsupported JSON content types and compressed request bodies.
- Rejection of malformed JSON and invalid backend JSON structures.
- Frontend rejection of malformed UTF-8 and inconsistent content lengths.
- Consumption authentication before JSON payload parsing.
- Canonical positive integer validation for backend history and project pagination.
- Maximum history page size of 100 and maximum offset of 100,000.
- Duplicate frontend dashboard query parameter rejection.
- Reporting month validation using YYYY-MM with year zero rejected.
- Control character and malformed Unicode rejection for account names,
  plan names, external user identifiers, consumption request identifiers
  and managed API key names.
- Authentication response cache protection using Cache-Control: no-store.
- Compatibility with empty authentication POST requests.

Targeted validation includes payload boundaries, malformed JSON,
unsupported encodings, pagination boundaries, Unicode validation,
authentication precedence and session security compatibility.

Remaining production safeguards:

- Trusted ingress request size limits and request timeouts.
- Trusted client IP configuration and distributed rate limiting.
- Authentication request parsing before native rate limiting.
- Explicit rate-limit exhaustion and middleware ordering regression tests.
- Additional authenticated pagination and identifier endpoint coverage.
- Resource limits for large reporting datasets.
- Further validation of empty and streamed authentication requests.

These controls have been validated locally. Production infrastructure
and deployment-specific protections require separate verification.

## HTTP security headers, CORS and CSRF

The frontend applies baseline HTTP security headers, including
Content-Security-Policy, frame protection, MIME sniffing protection,
referrer restrictions, permissions restrictions and cross-origin
opener protection. The Next.js identification header is disabled.

Frontend API responses use no-store cache protection. The backend
uses Helmet and explicit cache and permissions protection.

The backend and frontend project APIs do not grant cross-origin
access through permissive CORS response headers.

Project creation, API key creation and API key revocation require
an explicitly trusted HTTP or HTTPS Origin before authorization.
Missing, opaque, malformed and untrusted origins are rejected.
Host and forwarded headers cannot establish origin trust.

Validation completed:
- Six origin validation unit tests.
- Eleven HTTP security browser/API tests.
- Nine authenticated CSRF rejection scenarios.
- Project and API key state preservation assertions.
- Project creation and API key lifecycle regression.
- Owner, admin and member authorization regression.
- Tenant isolation and stale membership authorization regression.
- Backend and frontend TypeScript and frontend lint checks.

Remaining production and regression considerations:
- The baseline CSP permits inline scripts and styles. A stricter
  nonce-based policy requires further architectural evaluation.
- Production HTTPS and HSTS behavior require deployment validation.
- Backend Helmet HSTS and frame policy alignment remains pending.
- Trusted ingress and client IP handling remain production blockers.
- Full application regression remains required before checkpoint closure.

## Error handling and sensitive data protection

Backend structured logging redacts known credential fields,
including passwords, API keys, session tokens, cookies and
database connection credentials through four object levels.

Unexpected late-response errors are sanitized before delegation
to the Express default error handler.

Frontend project API handlers no longer log raw exceptions.
Customer-facing project, dashboard and API key errors use
an explicit public message allowlist.

Better Auth warning and error logs exclude raw arguments.
Unexpected authentication handler exceptions return generic
HTTP 500 responses with no-store cache protection.

Validation completed:
- 21 logging and error handling tests.
- Four public error policy unit tests.
- Three project and API key browser regression tests.
- Nine authentication security regression tests.
- Backend and frontend TypeScript validation.
- Frontend lint and Git diff validation.

Remaining considerations:
- Structured redaction is limited to known fields and depths.
- Authentication logging intentionally limits diagnostic detail.
- Actual infrastructure failure injection remains outstanding.
- Full security regression remains required.

## Related security documentation

- [Environment security](environment-security.md)
- [Production ingress requirements](production-ingress.md)
- [Security regression summary](security-regression-summary.md)
