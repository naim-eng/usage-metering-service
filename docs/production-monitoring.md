# Production Monitoring

## Monitoring architecture

The local production rehearsal uses Docker health checks,
structured application logs and an operational monitoring script.

Run the monitoring script from the repository root:

    deploy/scripts/check-health.sh

The script returns zero when all checks pass and a nonzero
exit code when an operational failure is detected.

## Health checks

- PostgreSQL: database readiness.
- API: application and database readiness.
- Frontend: sign-in page availability.
- Consumer: successful polling heartbeat freshness.
- Reverse proxy: Nginx configuration validation.

The operational script additionally checks HTTPS availability
through the reverse proxy using the rehearsal CA certificate.

## Consumer monitoring

Successful polling updates a heartbeat file at intervals
of at least ten seconds.

A missing heartbeat or one aged 120 seconds or more
fails the freshness check.

Docker checks consumer health every 30 seconds and marks
the container unhealthy after three consecutive failures.

An unhealthy container is not automatically restarted
solely because of its Docker health status.

## Logging

All six services use Docker json-file logging with
a maximum file size of 10 MB and three files per container.

Application logs use structured JSON and configured
sensitive-field redaction.

Local log rotation does not provide centralized log
retention or off-host archival.

## Outbox monitoring

The operational script reports pending, processing,
completed and failed event counts.

Any failed event triggers a monitoring failure.

Pending and processing counts require interpretation
against workload, event age and processing latency.

## Incident response

1. Identify the failing monitoring check.
2. Inspect the affected service and recent logs.
3. Determine the underlying failure.
4. Recover the affected service.
5. Repeat the operational monitoring script.
6. Confirm that all checks pass.

Do not delete database volumes or outbox records
as a routine recovery action.

## Verified rehearsal

- Five persistent containers reported healthy.
- Log rotation was verified for all six services.
- Four HTTPS endpoint checks passed.
- Consumer heartbeat freshness was verified.
- Outbox counts were retrieved without interactive authentication.
- A controlled consumer shutdown was detected.
- Consumer restart restored healthy monitoring results.

## Before public deployment

Configure scheduled monitoring and external alert delivery.
Establish workload-specific backlog and latency thresholds.
Monitor disk capacity, resource utilization, certificate
expiry and backup freshness.

Replace rehearsal hostnames and certificates with the
actual deployment configuration.

External monitoring, centralized logging and alert delivery
have not been deployed.
