# Operations and Troubleshooting Guide

## Service Management

Check backend service status:

    docker compose --profile events ps

Start the backend services:

    docker compose --profile events up -d db api consumer

Inspect recent service logs:

    docker compose logs --tail=100 api
    docker compose logs --tail=100 db
    docker compose --profile events logs --tail=100 consumer

Stop backend services without removing stored data:

    docker compose --profile events stop

## Health and Readiness

    curl -fsS http://localhost:3000/health
    curl -fsS http://localhost:3000/ready

Health confirms that the HTTP service is responding.
Readiness checks whether its database dependency is available.

## Troubleshooting

| Problem | Recommended action |
|---|---|
| API unavailable | Check container status and API logs |
| Readiness failure | Check database connectivity and migration status |
| HTTP 401 | Verify API credentials and revocation status |
| HTTP 409 | Check duplicate resources or request IDs |
| HTTP 429 | Reduce request frequency and apply backoff |
| Quota rejection | Inspect account and user allowances |
| Missing authentication email | Check SMTP configuration and delivery |
| Consumer failure | Inspect consumer logs and outbox status |

## Database Maintenance

- Back up the database before significant changes.
- Apply schema changes through the migration runner.
- Never modify previously applied migrations.
- Never remove persistent volumes as a troubleshooting shortcut.
- Validate backup restoration before production deployment.

## Consumer Operations

See the [consumer operations guide](consumer-operations.md)
for event processing, retries and failure investigation.

## Security and Incident Response

- Revoke suspected compromised API keys.
- Rotate exposed administrative credentials.
- Preserve relevant logs without exposing secrets.
- Investigate affected accounts and projects.

See [environment security](environment-security.md)
for credential rotation procedures.

## Production Readiness

Review the [production ingress requirements](production-ingress.md)
before exposing any service publicly.

Production backup restoration, infrastructure monitoring and
deployment-specific failure recovery require further validation.
