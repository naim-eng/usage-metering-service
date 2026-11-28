# Production ingress security requirements

## Deployment topology

- Public HTTPS traffic terminates at a trusted reverse proxy.
- Backend and frontend application ports must not be publicly accessible.
- Direct access to application origins must be blocked.
- PostgreSQL must not be publicly exposed.
- Production database connections require certificate verification.

## Trusted client IP handling

The reverse proxy must overwrite x-metering-client-ip using
the verified client network address.

Client-supplied values must never be preserved.

The backend TRUST_PROXY setting must contain only the actual
trusted proxy IP addresses or narrowly scoped CIDR ranges.

The ingress must sanitize forwarded headers, including
X-Forwarded-For, X-Forwarded-Host and X-Forwarded-Proto.

## Rate limiting

The initial backend deployment supports one API replica.

Backend rate limiting uses process-local memory and therefore
does not provide distributed or restart-persistent enforcement.

Authentication rate limiting uses PostgreSQL storage.

Horizontal API scaling requires a shared rate limit store
and additional concurrency validation.

## Production configuration

Backend:

- DEPLOYMENT_ENV=production
- TRUST_PROXY=<actual trusted proxy addresses>
- PRODUCTION_INGRESS_CONFIGURED=1
- API_REPLICA_COUNT=1

Frontend:

- DEPLOYMENT_ENV=production
- PRODUCTION_INGRESS_CONFIGURED=1

These confirmation variables are operator declarations.
They do not independently verify infrastructure security.

Do not enable them until the ingress configuration and network
isolation have been implemented and tested.

## Required deployment verification

- Reject direct public access to application origins.
- Verify client IP header overwrite behavior.
- Verify HTTPS redirection and certificate validity.
- Verify request body limits and request timeouts.
- Verify independent client rate limit buckets.
- Verify backend replica count.
- Establish authentication rate limit record retention.
- Monitor rate limit storage failures.

Actual infrastructure validation remains a deployment prerequisite.

## Related security documentation

- [Environment security](environment-security.md)
- [Security regression summary](security-regression-summary.md)
