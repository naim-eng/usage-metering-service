# Environment Security and Secret Management

## Deployment environments

The application supports two deployment environments:

- `local`: development, demonstrations, integration tests and E2E tests.
- `production`: an actual production deployment.

`DEPLOYMENT_ENV` defaults to `local`.

Production infrastructure must explicitly configure
`DEPLOYMENT_ENV=production` for every application process.

`NODE_ENV=production` alone does not activate deployment safeguards.
Local Next.js production builds remain supported.

Production deployments prohibit `NODE_ENV=test` and
`E2E_AUTH_RATE_LIMIT` overrides.

## Backend configuration

| Variable | Requirement |
| --- | --- |
| DEPLOYMENT_ENV | local or production |
| PORT | Valid TCP port; defaults to 3000 |
| ADMIN_API_KEY | At least 32 printable non-whitespace ASCII characters |
| DB_HOST | Valid database host |
| DB_PORT | Valid decimal TCP port |
| DB_USER | Database username |
| DB_PASSWORD | Database password |
| DB_NAME | Database name |
| DB_SSL_MODE | disable or verify-full |
| DB_SSL_ROOT_CERT | Optional CA certificate path for verified TLS |
| DB_CONNECT_TIMEOUT_MS | Database connection timeout |
| DB_POOL_MAX | Maximum database pool size |

Production requires verified database TLS and strong administrative
and database credentials.

Custom CA certificates are not currently supported by the Prisma
configuration builder. Production database certificate compatibility
must be verified before deployment.

## Frontend configuration

| Variable | Requirement |
| --- | --- |
| DEPLOYMENT_ENV | local or production |
| AUTH_DATABASE_URL | PostgreSQL connection URL |
| BETTER_AUTH_SECRET | Authentication signing secret |
| BETTER_AUTH_URL | Authentication origin |
| BETTER_AUTH_TRUSTED_ORIGINS | Optional comma-separated trusted origins |
| METERING_API_URL | Backend API origin |
| METERING_ADMIN_API_KEY | Backend administrative credential |

Production authentication and metering API origins must use HTTPS.

Production authentication database URLs must contain exactly one
query parameter: `sslmode=verify-full`.

Additional database URL parameters are currently prohibited in
production authentication configuration.

The frontend metering administrative key must match the backend
administrative key. It must remain server-side and must never use
a NEXT_PUBLIC_ environment variable.

## Secret generation

Generate independent cryptographically random credentials using:

    openssl rand -hex 32

Generate separate values for:

- Backend administrative API key.
- Better Auth signing secret.
- Database passwords for each database role.

The frontend metering administrative credential is the intentional
exception: it must match the backend administrative API key.

Do not reuse credentials between development, testing and production.

Configuration validation rejects several weak credential patterns,
but cannot establish whether a credential was generated randomly.

## Local secret storage

Use the public environment templates as configuration references.

Private local configuration files include:

- .env
- web/.env.local
- prisma/.env

Restrict access using:

    chmod 600 .env web/.env.local prisma/.env

Never commit actual credentials, private environment files,
database backups or secret scanning reports.

Git ignore rules do not protect files that are already tracked
or deliberately force-added.

Production credentials should be injected through an appropriate
secret management mechanism rather than embedded in images,
source code or deployment manifests.

## Environment isolation

Development and E2E environments use separate PostgreSQL databases,
Docker Compose projects, volumes and application ports.

Integration tests use a dedicated test database.

CI and E2E credentials are disposable testing fixtures and must
never be used in production.

Never execute destructive E2E cleanup procedures against development
or production databases.

## Administrative key rotation

1. Generate a new independent administrative key.
2. Prepare updated backend and frontend secret configuration.
3. Coordinate the backend and frontend configuration changes.
4. Restart or redeploy the affected application processes.
5. Verify authorized administrative operations with the new key.
6. Verify that the previous key is rejected.
7. Remove obsolete copies from secret storage.

The current administrative authentication mechanism supports one
active key. Rotation may require a coordinated maintenance window.

Do not assume zero-downtime rotation is supported.

## Authentication secret rotation

1. Generate a new authentication signing secret.
2. Prepare the updated frontend secret configuration.
3. Assess the impact on existing sessions and authentication tokens.
4. Restart or redeploy the frontend.
5. Verify sign-in, sign-out and session handling.
6. Remove obsolete secret copies.

Existing sessions may be invalidated. Seamless signing-secret
rotation has not been implemented or verified.

## Database credential rotation

1. Identify every application process using the affected credential.
2. Prepare a database backup and a controlled maintenance procedure.
3. Rotate the database role password using an authorized connection.
4. Update the corresponding application secret configurations.
5. Restart affected application processes and connection pools.
6. Verify database connectivity and application readiness.
7. Verify that obsolete credentials no longer authenticate.

Changing a Docker Compose environment variable does not automatically
change the password of an existing PostgreSQL role.

Do not delete database volumes as a credential rotation mechanism.

## Suspected credential exposure

- Revoke or rotate the affected credential promptly.
- Identify affected services and environments.
- Review relevant access and application logs.
- Remove exposed material from accessible locations.
- Assess whether repository history remediation is required.
- Verify that obsolete credentials no longer work.

Deleting a credential from the latest Git commit does not remove
it from repository history.

## Verification before production deployment

Before an actual production deployment:

- Confirm production mode reaches every application process.
- Confirm HTTPS and verified database TLS connectivity.
- Confirm certificate trust and hostname verification.
- Confirm database role separation and least-privilege access.
- Confirm production credentials are independently generated.
- Verify backup restoration and credential rotation procedures.
- Verify authentication, authorization and application readiness.

Configuration tests do not establish live production readiness.
No public deployment or production credential rotation is required
for local development.

## Production configuration safeguards

Production startup requires explicit trusted ingress
confirmation and trusted backend proxy configuration.

Authentication uses a dedicated validated client IP header
in production. Local development retains its existing
authentication IP configuration.

The initial backend deployment is restricted by configuration
to a single API replica because API rate limiting uses
process-local memory. Authentication rate limiting uses
PostgreSQL storage outside isolated E2E execution.

Account activation uses a PostgreSQL transaction and customer
row locking to coordinate credential invalidation and email
verification. Repeated activation does not invalidate an
already established replacement password.

Backend HTTP security configuration denies framing and enables
HSTS and HTTPS upgrade directives in production only.

### Validation

- 57 configuration and client IP tests passed.
- 41 targeted browser security tests passed.
- Enhanced concurrent verification replay regression passed.
- Backend HTTP security header checks passed.
- Backend and frontend TypeScript validation passed.
- Frontend lint validation passed.

### Deployment prerequisites

Actual reverse proxy header sanitization, origin network
isolation, TLS certificate verification, request timeouts,
rate limit retention and replica enforcement require
deployment-level verification.

Operator confirmation variables do not independently
establish infrastructure security.

Distributed backend rate limiting requires a shared store
before horizontal scaling.

Better Auth native verification processing continues outside
the custom account activation transaction. Full native
verification lifecycle atomicity is not established.

Concurrent replay coverage does not prove every possible
interleaving of password reset and account activation.

See production-ingress.md for the deployment security contract.
