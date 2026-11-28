# Deployment Rollback and Recovery

## Rollback preparation

Before deploying a new application version:

- Record the current Git commit and container image identifiers.
- Preserve the previous application images using versioned tags.
- Retain the corresponding deployment configuration.
- Create and verify a full database backup.
- Review database migration compatibility.
- Confirm that operational monitoring passes.

Do not overwrite the only available rollback image.

## Application rollback procedure

1. Suspend incoming writes when required for consistency.
2. Confirm database compatibility with the previous version.
3. Select the previous verified application images.
4. Use the corresponding deployment configuration.
5. Recreate the affected application services.
6. Refresh reverse proxy upstream connections.
7. Verify application readiness and HTTPS endpoints.
8. Validate database integrity and application functionality.
9. Resume traffic only after successful verification.

Preserve persistent database volumes throughout the procedure.

## Database recovery

Application rollback does not reverse database migrations.

If the previous application version is incompatible with
the current database schema, assess a corrective forward
migration or restoration from a verified full backup.

Follow the procedures in:

- [Database deployment](database-deployment.md)
- [Database recovery](database-recovery.md)

Database restoration can lose writes made after the backup.
Assess the recovery point before authorizing restoration.

Never use volume deletion as a routine rollback procedure.

## Verified local rollback rehearsal

Previous source commit: dbc5891.

The original previous image was no longer available
under a usable local image reference.

A replacement rollback image was rebuilt from the
previous committed source using an isolated Git worktree.

Rollback image tag:

    usage-metering-backend:rollback-127

The previous Compose configuration was used because
the older consumer did not implement heartbeat monitoring.

Verified results:

- Previous API image deployed successfully.
- Previous consumer image deployed successfully.
- Three HTTPS API endpoints returned HTTP 200.
- Current application version was restored.
- All five persistent containers reported healthy.
- Operational monitoring detected zero failures.
- Database data fingerprints matched before and after.
- Temporary rollback configuration was removed.

## Recovery verification

Run the operational monitoring script:

    deploy/scripts/check-health.sh

Confirm service health, HTTPS availability, consumer
heartbeat freshness and outbox event status.

See [Production monitoring](production-monitoring.md).

## Rehearsal limitations

The rebuilt rollback image is source-equivalent but
not guaranteed to be byte-identical to the original image.

The rehearsal used an unchanged database schema and
local rehearsal data.

It did not establish zero-downtime rollback, recovery
across incompatible migrations or recovery under live traffic.

Production recovery time and recovery point objectives
require representative workloads and infrastructure.

Before public deployment, retain versioned images in
a suitable registry and maintain encrypted off-host backups.
