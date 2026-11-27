# Database Architecture and Migrations

The project uses PostgreSQL as the authoritative source of persistent application data.

Core tables include:

| Table | Purpose |
|---|---|
| `accounts` | Account information and assigned plans |
| `users` | Account-owned users |
| `plans` | Predefined and custom plan definitions |
| `monthly_usage` | Monthly account and user usage totals |
| `usage_requests` | Consumption decisions and idempotency records |
| `plan_limit_history` | Historical plan assignments and revisions |
| `low_credit_notifications` | Account and user threshold notifications |
| `outbox_events` | Transactional quota-threshold events and processing state |
| `projects` | Organization-owned customer projects and metering account references |
| `project_api_keys` | Hashed project credentials and revocation state |
| `schema_migrations` | Applied migration versions and checksums |

Customer authentication and organization membership data are
stored separately in the PostgreSQL `auth` schema.

### SQL Initialization Files

SQL initialization and migration files are located in:

```text
sql/
```

| File | Purpose |
|---|---|
| `001_initial_schema.sql` | Initial database schema |
| `002_seed_plans.sql` | Predefined plan data |
| `003_plan_history.sql` | Historical plan tracking |
| `004_idempotency_balances.sql` | Recorded balances for idempotent retries |
| `005_low_credit_notifications.sql` | Notification table, constraints, and indexes |
| `006_event_outbox.sql` | Transactional outbox table and pending-event index |
| `007_customer_auth.sql` | Customer authentication schema |
| `008_customer_projects.sql` | Customer project management |
| `009_project_api_keys.sql` | Project-scoped API keys |
| `010_auth_rate_limits.sql` | Persistent authentication rate limits |
| `011_unify_project_api_keys.sql` | Unified project credentials |

These files remain part of the project after introducing Prisma.

Prisma's schema models the existing database structure.

### Persistence

PostgreSQL uses named Docker volumes.

Database contents persist across ordinary container restarts.

Database initialization and schema upgrades are managed by the dedicated SQL migration runner:

    npx tsx scripts/migrations/run.ts

The runner uses the configured database connection and records applied migrations in `public.schema_migrations`.

Migrations are applied in version order, protected by PostgreSQL advisory locking, and executed transactionally. Previously applied migrations are validated using their filenames and SHA-256 checksums.

Docker Compose runs the migration service automatically before starting the API or event consumer.

Existing databases without migration history require a validated baseline before the migration runner can proceed. The baseline utility is located at `scripts/migrations/baseline.ts` and supports dry-run validation against a migrated reference database.

Do not modify previously applied migration files.

Do not delete or reset database volumes unless data loss is explicitly intended.

## Database Schema Separation

The public schema stores metering data, projects, API keys,
usage records, plans, notifications and outbox events.

The auth schema stores customer identities, sessions,
authentication credentials, organization membership,
invitations, verification records and authentication rate limits.

Customer identities are distinct from metered users.

## Data Integrity

- Account-scoped external user identifiers.
- Account-scoped consumption request identifiers.
- Organization-scoped project slugs.
- Unique project API key hashes.
- Unique project-to-metering-account associations.
- Transactional consumption and quota enforcement.
- Historical plan snapshots.
- Notification and outbox event deduplication.

## Credential Storage

API key secrets are stored as SHA-256 hashes.
Project key metadata includes a display prefix and revocation state.

Migration 011 consolidates project authentication into managed
project API keys and disables legacy account credentials
for project-linked metering accounts.

## Schema Authority

Versioned SQL migrations define the authoritative database schema.
The Prisma schema does not represent every database constraint,
index or authentication table.

See the [architecture guide](architecture.md) for logical
resource relationships.
