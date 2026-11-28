# Production Infrastructure Rehearsal

## Purpose

Validate production-style infrastructure locally without
public hosting, paid services or production customer data.

## Infrastructure

Compose configuration: deploy/compose.production.yml

Project: usage-metering-production

Services:
- PostgreSQL 17
- One-shot database migration runner
- Backend API
- Event consumer
- Next.js frontend
- Nginx reverse proxy

The rehearsal uses a dedicated persistent database volume
and separate ingress, backend, frontend and database networks.

## HTTPS endpoints

- Frontend: https://app.metering.test:8443
- Public API: https://api.metering.test:8443
- Private API: https://internal.metering.test:8443

Host ingress is restricted to 127.0.0.1.
HTTP port 8080 redirects to HTTPS port 8443.

The private HTTPS listener restricts access to the
designated frontend container address.

## Database security

PostgreSQL requires encrypted network connections
and SCRAM-SHA-256 password authentication.

Server certificates are signed by a local private CA.
Application database connections use certificate verification.

## Verified results

- Backend and frontend production image builds passed.
- All 11 database migrations applied successfully.
- PostgreSQL TLS 1.3 connectivity passed.
- Unencrypted database connections were rejected.
- PostgreSQL certificate hostname verification passed.
- Backend PostgreSQL driver rejected untrusted certificates.
- Backend PostgreSQL driver rejected incorrect identities.
- Frontend PostgreSQL driver rejected untrusted certificates.
- Nginx runtime configuration validation passed.
- All four HTTPS smoke tests passed.
- All five public API restriction tests passed.
- Private HTTPS connectivity passed.
- Unauthorized private listener access returned HTTP 403.
- Authentication session endpoint returned HTTP 200.
- Missing trusted ingress header returned HTTP 503.
- No database, API, frontend or consumer host ports published.
- HTTP-to-HTTPS redirection passed.

## Secrets and certificates

Environment files and certificate material remain outside Git.
The CA private key must never be mounted into application
containers or distributed to clients.

## Remaining requirements

This rehearsal is not a public production deployment.

Before commercial deployment:
- Configure real hosting, DNS and publicly trusted certificates.
- Replace rehearsal credentials and domain configuration.
- Configure and verify authenticated SMTP delivery.
- Independently verify Prisma certificate rejection.
- Validate complete authenticated workflows over production HTTPS.
- Verify ingress header replacement and direct-origin restrictions.
- Complete backup, restoration, monitoring and recovery procedures.
- Review network trust boundaries for the selected hosting platform.

Ingress confirmation variables are operator declarations,
not independent proof of infrastructure security.


## Subsequent Rehearsal Verification

The subsequent deployment preparation work completed
independent Prisma TLS certificate and hostname rejection
checks, additional network isolation, operational monitoring,
database backup and restoration, and application rollback
rehearsals.

These results supersede earlier pending verification items
where applicable.

See [deployment readiness](deployment-readiness.md) and
[project completion assessment](project-completion.md)
for the consolidated results and remaining limitations.
