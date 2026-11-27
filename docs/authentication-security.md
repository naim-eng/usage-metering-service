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
