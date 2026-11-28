# Database Deployment and Migration Procedures

## Migration architecture

PostgreSQL 17 uses a dedicated persistent production volume.
The one-shot migration service runs before dependent
application services start.

The migration runner provides ordered execution, SHA-256
checksum verification, advisory locking, transactional
execution and atomic migration history recording.

## Deployment procedure

1. Verify the target environment and database identity.
2. Review pending migrations and release compatibility.
3. Stop application writers and block incoming requests.
4. Create and verify a full database backup.
5. Confirm PostgreSQL readiness.
6. Execute the migration service.
7. Confirm successful migration completion.
8. Start application services.
9. Verify readiness and application functionality.
10. Retain the backup according to the recovery policy.

Migration command:

    docker compose -f deploy/compose.production.yml run --rm --no-deps migrate

Never modify an applied migration or bypass checksum checks.
Use a new numbered migration for subsequent schema changes.

## Failure handling

Do not start incompatible application services after failure.
Inspect migration errors and recorded migration history.

Failed migration transactions are rolled back. Earlier
successfully committed migrations remain applied.

A corrective forward migration or database restoration
may be necessary depending on release compatibility.

Never delete the production database volume during deployment.

## Rehearsal verification

- Fresh database migrations: 11/11 passed.
- Migration checksum consistency: 11/11 matched.
- Migration repeatability: passed.
- Existing database content preservation: passed.
- Seed plan preservation: 4/4 passed.
- Modified checksum rejection: passed.
- Unsupported explicit transaction rejection: passed.
- Failed migration transaction rollback: passed.
- Failed migration history exclusion: passed.
- Temporary validation database cleanup: passed.

Advisory locking was verified through source inspection.
Concurrent migration execution was not independently tested.

Full backup and restoration verification follows in the
database recovery rehearsal.
