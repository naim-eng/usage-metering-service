# Database Backup and Recovery

## Backup strategy

Use full PostgreSQL custom-format logical backups containing
schema, data, indexes, constraints and migration history.

Data-only backups are unsuitable as the primary recovery
method because accounts and plans have circular foreign keys.

Store backup archives under deploy/backups with directory
permissions 700 and file permissions 600.

## Backup procedure

1. Confirm the source database and deployment identity.
2. Create a full custom-format archive using pg_dump.
3. Check archive readability using pg_restore --list.
4. Generate and verify a SHA-256 checksum.
5. Confirm restricted permissions and Git exclusion.
6. Retain the archive according to the recovery policy.

Backup command:

    docker compose -f deploy/compose.production.yml exec -T db sh -ec 'export PGPASSWORD="$DB_PASSWORD"; pg_dump -U metering -d usage_metering --format=custom --no-owner --no-privileges'

Redirect the command output to a protected backup file.
Never print binary backup contents to the terminal.

## Restoration procedure

1. Verify the backup checksum.
2. Create a separate empty recovery database.
3. Restore using pg_restore with --exit-on-error,
   --single-transaction, --no-owner and --no-privileges.
4. Compare restored schema, constraints and data.
5. Verify migration history and seed records.
6. Run the migration runner against the recovery database.
7. Validate application functionality before any cutover.

Never overwrite the original database during a rehearsal.

## Rehearsal results

- Full backup creation: passed.
- Backup disk usage: 56 KB.
- Archive inventory: 135 entries.
- SHA-256 integrity: passed.
- Restricted permissions and Git exclusion: passed.
- Full restoration: passed.
- Observed restoration duration: approximately one second.
- Restored migration inventory: 11/11.
- Restored seed plans: 4/4.
- Restored migration runner validation: passed.
- Temporary recovery database cleanup: passed.
- Original database preservation: passed.

Raw SQL dump checksums differed because PostgreSQL
represented five CHECK constraint array casts differently
after restoration. The displayed expressions retained
equivalent permitted values.

## Production requirements

The rehearsal used a small local database on the same
PostgreSQL instance. Its restoration duration is not a
production recovery-time guarantee.

Before commercial deployment:
- Establish encrypted off-site backup storage.
- Define backup frequency and retention.
- Define recovery point and recovery time objectives.
- Monitor backup failures and archive integrity.
- Rehearse recovery with representative customer data.
- Verify recovery onto a separate database server.
- Manage database roles and privileges separately.
- Validate application functionality against restored data.

Logical backups do not provide point-in-time recovery
without additional PostgreSQL backup and WAL infrastructure.

Never commit backup archives or customer data to Git.
