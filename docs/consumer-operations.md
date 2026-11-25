# Event Consumer Operations Guide

## 1. Purpose

The event consumer processes quota-threshold events stored
in the transactional PostgreSQL outbox.

It runs independently of the API without requiring an
external message broker.

The default handler does not perform external notification
delivery.

## 2. Processing Lifecycle

| Status | Meaning |
| --- | --- |
| pending | Waiting for processing or retry |
| processing | Claimed under a processing lease |
| completed | Handler and database update succeeded |
| failed | Processing attempts exhausted |

Events are claimed using PostgreSQL FOR UPDATE SKIP LOCKED.

The default polling interval is two seconds when an
iteration does not successfully complete an event.

Successful processing allows immediate continued polling.

## 3. Leases and Retries

Each claimed event receives a 60-second processing lease.
Expired leases can be reclaimed if attempts remain.

The maximum number of processing attempts is five.

| Failed attempt | Retry delay |
| --- | --- |
| 1 | 5 seconds |
| 2 | 10 seconds |
| 3 | 20 seconds |
| 4 | 40 seconds |
| 5 | No further automatic retry |

Attempt-number and lease checks prevent stale workers
from overwriting newer processing results.

Exhausted processing leases are marked as failed.

Processing uses at-least-once semantics. External
handlers must implement idempotency safeguards.

## 4. Docker Configuration

- Optional profile: events.
- Restart policy: unless-stopped.
- Shutdown grace period: 75 seconds.
- Database: usage_metering.
- Successful migration completion required before startup.

Inspect the consumer without restarting it:

    docker compose ps consumer
    docker compose logs --tail=100 consumer

Source changes do not automatically update running containers.

## 5. Structured Consumer Logs

Consumer logs use structured JSON through Pino.

| Event | Level |
| --- | --- |
| consumer_worker_started | info |
| consumer_worker_heartbeat | info |
| consumer_event_processing | info |
| consumer_event_completed | info |
| consumer_event_failed | error |
| consumer_lease_lost | warn |
| consumer_exhausted_leases | warn |
| consumer_shutdown_requested | info |
| consumer_worker_stopped | info |
| consumer_worker_failed | fatal |

Event logs include event identifiers and attempt numbers
where applicable.

Completion, failure and lease-loss logs include durationMs.
Exhausted lease warnings include the affected event count.
Failure logs avoid raw exception details and event payloads.

## 6. Worker Heartbeat

Heartbeats are emitted after completed polling iterations
when at least 60 seconds have elapsed.

Heartbeat fields:

- pollCount: completed polling iterations.
- processedCount: successfully completed events.
- uptimeSeconds: elapsed worker runtime in seconds.

Polling and processing counters reset after each heartbeat.
A stalled processing operation cannot emit heartbeats.

Zero completed events does not necessarily indicate an
empty queue or a worker failure.

Heartbeat timing is approximate and subject to the logging
level. It indicates polling progress, not overall system
health or external notification delivery.

## 7. Read-Only Outbox Monitoring

The monitoring script is scripts/monitor-outbox.ts.

With the appropriate database connection settings configured,
run from the repository root:

    DB_NAME=usage_metering_test ./node_modules/.bin/tsx scripts/monitor-outbox.ts

The example targets the test database.

The script requires an explicit DB_NAME and verifies the
connected database identity before collecting statistics.

It does not modify event records.

| Metric | Meaning |
| --- | --- |
| Status counts | Event counts grouped by status |
| Expired processing leases | Processing events with expired leases |
| Permanently failed events | Events in failed status |
| Ready pending events | Pending events available for processing |
| Oldest pending event age | Age of oldest pending event in seconds |

The oldest pending age includes scheduled retries.
If no pending events exist, the age is reported as none.

Statuses without matching records may be absent.

Queries execute separately, so concurrent processing may
cause differences between reported counts.

Test database statistics include accumulated test fixtures
and must not be interpreted as primary database health.

The monitor does not provide automatic alerts.

## 8. Troubleshooting

| Observation | Recommended investigation |
| --- | --- |
| Missing heartbeat | Check container status, image version and logging level |
| Zero completed events | Check ready backlog and failure logs |
| Increasing backlog | Check processing progress and database connectivity |
| Expired leases | Investigate crashes or long-running handlers |
| Repeated lease loss | Investigate processing duration |
| Increasing failed events | Review failure logs and handler behavior |
| Fatal worker failure | Check configuration and database availability |

Do not manually reset failed events or processing leases
without investigating duplicate processing risks.

## 9. Graceful Shutdown and Recovery

The worker handles SIGINT and SIGTERM.

Shutdown interrupts idle polling and waits for active
processing to return before disconnecting Prisma.

Docker allows a 75-second shutdown grace period.

After forced termination, abandoned events can be
reclaimed following lease expiry if attempts remain.

A stalled handler may exceed the shutdown grace period.

## 10. Operational Limitations

- External notification delivery is not implemented.
- Exactly-once processing is not guaranteed.
- Processing leases are not automatically renewed.
- Heartbeats are not independent health checks.
- Monitoring does not provide automatic alerts.
- Failed events have no automatic replay mechanism.
- Demo database migrations require prior schema verification.
