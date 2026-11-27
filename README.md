# Usage Metering and Quota Service

A full-stack usage metering and quota management platform for tracking resource consumption and enforcing configurable account and user quotas through customer projects.

Built with **TypeScript, Node.js, Express 5, Prisma ORM, and PostgreSQL 17**, the service demonstrates transactional quota enforcement, account isolation, idempotency, concurrent request handling, custom plan management, historical reporting, and a DDD-inspired Clean Architecture.

The project was developed as a backend engineering capstone and includes automated tests, an example client, Docker Compose deployment, an isolated demonstration environment, and reproducible performance testing.

## Features

- Customer authentication and organization creation.
- Customer project management and dashboard.
- Project-scoped API keys with hashed storage.
- Versioned database migrations and migration tracking.
- API readiness checks and graceful shutdown.
- Security headers and API rate limiting.
- Structured logging and consumer heartbeat monitoring.
- Read-only outbox monitoring.
- Automated GitHub Actions CI.

- Account-level and user-level quota management.
- Predefined and account-owned custom plans.
- Monthly consumption limits using UTC calendar months.
- Maximum credits allowed per request.
- Shared account quotas across multiple users.
- Independent user quotas.
- Atomic quota enforcement using PostgreSQL transactions.
- Concurrency protection through account-level row locking.
- Atomic conditional updates without optimistic version counters.
- API-key authentication using SHA-256 hashes.
- Account isolation and custom plan ownership checks.
- Idempotent consumption requests with conflict detection.
- Plan upgrades and changes without resetting consumed credits.
- Historical tracking of consumption and plan revisions.
- Account and user allowance inspection.
- Monthly reporting with historical plan snapshots.
- Database-backed low-credit notifications at 80%, 90%, and 100% usage.
- Transactional event outbox for account and user quota-threshold events.
- Independent Event Consumer with retry scheduling, crash recovery, and concurrent worker safety.
- Prisma ORM for application database operations.
- DDD-inspired Clean Architecture.
- Automated unit, integration, and regression tests.
- Docker Compose deployment with an isolated demo environment.

## Technology Stack

| Component | Technology |
|---|---|
| Runtime | Node.js 22 (backend and frontend) |
| Language | TypeScript |
| HTTP framework | Express 5 |
| ORM | Prisma 6.12 |
| Database | PostgreSQL 17 |
| Database utilities | node-postgres (`pg`) |
| TypeScript execution | `tsx` |
| Containerization | Docker and Docker Compose |
| Testing | Node.js test runner |
| Frontend | Next.js 16.4.6 |
| UI library | React 19.3 |
| Styling | Tailwind CSS 4.3.3 |
| Customer authentication | Better Auth |
| API security | Helmet and Express Rate Limit |
| Structured logging | Pino |
| Continuous integration | GitHub Actions |
| Version control | Git and GitHub |

Prisma is the primary database access layer for the application. The `pg` driver remains available for integration-test verification and database utilities.

## Architecture

The service follows a **DDD-inspired Clean Architecture** approach.

Responsibilities are separated into HTTP, Application, Domain, and Infrastructure layers.

```text
                    API Client
                        |
                        v
                 Express HTTP API
                  (HTTP Layer)
                        |
                        v
                Application Services
                 (Use-Case Layer)
                        |
              +---------+---------+
              |                   |
              v                   v
         Domain Layer       Infrastructure
         QuotaPolicy         Prisma ORM
                             Repositories
                                   |
                                   v
                              PostgreSQL
```

### Full-Stack Integration

The Next.js customer dashboard uses Better Auth for customer
sessions and organization membership.

Server-side frontend routes communicate with the Express API
using administrative authentication.

Each customer project maps to a metering account. External
applications use project API keys to access account-scoped
metering operations.

The independent event consumer processes transactional outbox
events stored in PostgreSQL.

### HTTP Layer

The HTTP layer is responsible for:

- Routing incoming requests.
- API-key authentication.
- Request validation.
- Returning HTTP status codes.
- Formatting JSON responses.
- Converting application errors into HTTP responses.

Principal files include:

```text
src/index.ts
src/auth.ts
src/plans.ts
src/history.ts
src/reports.ts
src/allowances.ts
src/notifications.ts
```

The HTTP layer delegates business workflows to application services.

### Application Layer

The Application layer coordinates business use cases.

Its services are located in:

```text
src/application/services/
```

Services include:

| Service | Responsibility |
|---|---|
| ConsumeCreditsService | Evaluate and record credit consumption |
| CreateAccountService | Create accounts and initial plan-history records |
| CreateUserService | Register users under authenticated accounts |
| ChangeAccountPlanService | Change account plans transactionally |
| ChangeUserPlanService | Change individual user plans |
| CustomPlanService | Create, list, and update custom plans |
| ListPlansService | Retrieve predefined plans |
| GetUsageHistoryService | Retrieve paginated consumption history |
| GetAllowancesService | Calculate account and user allowances |
| GetMonthlyReportService | Generate historical monthly usage reports |
| GetNotificationsService | Retrieve low-credit notifications |

Application services coordinate validation of business rules, database operations, transactions, and the preparation of results.

### Domain Layer

The Domain layer contains business rules that can operate independently of HTTP and database infrastructure.

The quota policy is implemented in:

```text
src/domain/services/QuotaPolicy.ts
```

`QuotaPolicy.evaluate()` determines whether a consumption request satisfies the applicable account and user limits.

It evaluates:

1. Account maximum per request.
2. User maximum per request.
3. Account monthly remaining credits.
4. User monthly remaining credits.

The policy returns an acceptance or rejection decision identifying the relevant scope and rule.

The Domain layer does not require Express, Prisma, or PostgreSQL to evaluate these rules.

The `LowCreditNotificationPolicy` detects when accepted consumption crosses a monthly usage threshold of 80%, 90%, or 100%. It uses integer arithmetic and does not depend on HTTP or database infrastructure.

### Infrastructure Layer

The Infrastructure layer provides database connectivity and repository implementations.

Key directories include:

```text
src/infrastructure/database/
src/infrastructure/repositories/
src/infrastructure/events/
```

The application uses Prisma ORM for typed database access.

Infrastructure repositories support credit consumption and related transactional operations. The `LowCreditNotificationRepository` stores notifications within the existing consumption transaction.

The `QuotaEventProducer` also writes threshold events into PostgreSQL within that transaction. The independent `QuotaEventConsumer` claims and processes queued events.

PostgreSQL-specific SQL is retained where necessary for database row locking and in test utilities used to verify database state independently.

### Prisma ORM

The Prisma schema is located at:

```text
prisma/schema.prisma
```

The project uses Prisma Client to interact with the existing PostgreSQL tables.

The generated Prisma Client is located under:

```text
src/generated/prisma/
```

Generated Prisma files are excluded from Git and regenerated during setup or Docker image builds.

Prisma is used for:

- Account and user management.
- Authentication.
- Predefined and custom plan management.
- Usage consumption.
- Historical request retrieval.
- Allowance inspection.
- Monthly reporting.
- Low-credit notification storage and retrieval.
- Transactional outbox event creation and processing.

Versioned SQL migrations remain authoritative for database initialization and schema changes.

### Architecture Trade-offs

This implementation is DDD-inspired rather than a strict implementation of every Clean Architecture dependency rule.

Some application services use Prisma directly, while consumption workflows use dedicated Infrastructure repositories.

This approach provides useful separation of responsibilities without introducing excessive abstraction for the project's scope.

## Quota Model

The service enforces quotas at two levels:

- Account.
- Individual user.

Each level has two limits:

- Monthly limit.
- Maximum credits per request.

### Monthly Limit

The monthly limit defines the maximum number of credits available during a UTC calendar month.

Account consumption includes usage by all users belonging to the account.

Each user also has an independent monthly limit.

For example:

An account has 100 monthly credits.

User A has 10 monthly credits.

User B has 100 monthly credits.

Both users share the account's 100-credit allowance while also respecting their individual limits.

### Maximum Per Request

The maximum-per-request limit restricts how many credits can be consumed by one operation.

A request must satisfy both the account's and user's maximum-per-request limits.

### Consumption Decision

A request is accepted only when all applicable limits permit it.

If any applicable limit is exceeded, the entire request is rejected.

Partial consumption is not supported.

A rejected request identifies:

- The rejection scope: `account` or `user`.
- The rejection rule: `monthly_limit` or `max_per_request`.

Rejected requests do not consume credits.

### Monthly Accounting

Consumption is tracked by UTC calendar month.

New months receive separate usage totals.

Previous monthly usage records are preserved for reporting and auditing.

### Remaining Credits

Remaining credits are calculated as:

```text
remaining = max(monthly_limit - units_used, 0)
```

A user may have remaining individual credits but still be unable to consume them when the shared account quota is exhausted.

## Predefined Plans

Four predefined plans are seeded into PostgreSQL.

| Scope | Plan | Monthly credits | Maximum per request |
|---|---|---:|---:|
| Account | Starter | 100 | 20 |
| Account | Pro | 1,000 | 100 |
| User | Basic | 10 | 2 |
| User | Premium | 100 | 10 |

Accounts may also create custom account or user plans.

Custom plans belong to their creating account and cannot be accessed or modified by other accounts.

## Authentication and Account Isolation

The platform separates customer authentication, metering API
authentication, and administrative authentication.

### Customer Authentication

The customer dashboard uses Better Auth with PostgreSQL.

Project creation requires an authenticated customer, an active
organization, verified organization membership, and an owner
or administrator role.

### Account and Project API Keys

Authenticated metering operations use the following request header:

    X-API-Key: YOUR_API_KEY

Existing account API keys remain supported.

Project API keys resolve to the associated project's metering
account and support operations protected by account authentication.

Project keys must not be revoked, and their associated project
must be active with an available metering account.

API keys are generated using cryptographically secure random
values. Only SHA-256 hashes are stored in PostgreSQL.

New project API key secrets are returned during creation and
are not returned by the key-listing endpoint.

### Administrative Authentication

Account creation and project management endpoints require:

    X-Admin-Key: YOUR_ADMIN_API_KEY

The administrative key is configured through ADMIN_API_KEY.

The frontend uses server-side API routes to communicate with
privileged backend endpoints.

Administrative credentials must never be exposed to the browser.

### Tenant Isolation

Account-authenticated operations are scoped to the resolved
metering account.

Project management operations use organization and project
identifiers to restrict resource access.

The administrative API key is privileged and is not itself
restricted to an individual customer organization.

Keep API keys, database credentials, and authentication secrets
out of version control and browser-side JavaScript.

See the [Customer API Integration Guide](docs/customer-api-guide.md)
for project API key usage and integration examples.

## API Reference

The default local API URL is:

```text
http://localhost:3000
```

### Service and Plan Information

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/health` | Service health check |
| GET | `/ready` | Database readiness check |
| GET | `/plans` | List predefined plans |
| GET | `/plans/custom` | List account-owned custom plans |

### Account and User Management

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/accounts` | Create an account and issue an API key |
| POST | `/users` | Register a user under an account |
| GET | `/account` | Inspect account allowance |
| GET | `/users` | Inspect user allowances |
| PATCH | `/accounts/plan` | Change the account's plan |
| PATCH | `/users/plan` | Change an individual user's plan |

### Custom Plans

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/plans` | Create a custom plan |
| GET | `/plans/custom` | List custom plans |
| PATCH | `/plans/:planId` | Update an owned custom plan |

### Consumption and Reporting

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/consume` | Evaluate and record consumption |
| GET | `/usage/history` | Retrieve paginated request history |
| GET | `/usage/monthly` | Retrieve monthly usage and plan history |
| GET | `/notifications` | Retrieve account and user low-credit notifications |

### Customer Project Management

All endpoints in this section require X-Admin-Key.

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/projects` | List organization projects |
| POST | `/projects` | Create a project |
| GET | `/projects/:projectId/dashboard` | Retrieve project dashboard data |
| POST | `/projects/:projectId/api-keys` | Generate a project API key |
| GET | `/projects/:projectId/api-keys` | List project API keys |
| DELETE | `/projects/:projectId/api-keys/:keyId` | Revoke a project API key |

GET and DELETE requests require an organizationId query parameter.
POST requests require organizationId in the request body.

The dashboard endpoint supports month, page, and limit parameters.

Project dashboard data includes account and user allowances,
monthly reporting, usage history, and low-credit notifications.

These privileged endpoints are intended for trusted server-side
integration, not direct browser-side access.

### Example: Create a User

```http
POST /users
Content-Type: application/json
X-API-Key: <account-api-key>

{
  "userId": "ahmed",
  "planId": 4
}
```

This registers a user under the authenticated account using the selected user plan.

### Example: Consume Credits

```http
POST /consume
Content-Type: application/json
X-API-Key: <account-api-key>

{
  "userId": "ahmed",
  "units": 2,
  "requestId": "unique-request-001"
}
```

The service evaluates account-level and user-level quotas.

If the request is accepted, credits are deducted atomically and the decision is recorded.

If rejected, no credits are consumed.

### Usage History

```http
GET /usage/history?page=1&limit=50
X-API-Key: <account-api-key>
```

The endpoint returns paginated request history belonging to the authenticated account.

The default page is 1.

The default page size is 50, and the maximum is 100.

Records are ordered from newest to oldest.

### Monthly Reporting

```http
GET /usage/monthly?month=2026-10
X-API-Key: <account-api-key>
```

The report includes account and user usage totals, available historical plan limits, and plan-change events.

Historical limits are not invented when the required plan-history information is unavailable.

## Low-Credit Notifications

The service creates notifications when an account or individual user reaches 80%, 90%, or 100% of its monthly credit limit through accepted consumption.

| Usage threshold | Notification |
|---|---|
| 80% | Low credits |
| 90% | Critical credits |
| 100% | Credits exhausted |

Notifications are created when usage crosses a threshold. If a request crosses multiple thresholds, a notification is recorded for each one.

For example, with a monthly limit of five credits, consuming the fourth credit triggers the 80% notification. Consuming the fifth credit triggers both the 90% and 100% notifications.

Notifications are stored in the `low_credit_notifications` table in PostgreSQL.

Each notification records:

- Account ID and optional user ID.
- Month and threshold percentage.
- Monthly limit.
- Credits used and remaining.
- Creation timestamp.

The `LowCreditNotificationPolicy` identifies crossed thresholds, while `LowCreditNotificationRepository` saves them using the existing consumption transaction.

Unique database indexes prevent duplicate notifications for the same account or user, month, and threshold.

Rejected requests and idempotent retries do not create additional notifications.

### Retrieve Notifications

```http
GET /notifications
X-API-Key: <account-api-key>
```

The endpoint returns up to 100 notifications, ordered from newest to oldest.

Notifications are restricted to the authenticated account.

The response includes account-level and user-level notifications, their thresholds, remaining credits, and timestamps.

Notifications are currently stored and retrieved through the API. Email, SMS, and push notification delivery are not implemented.

Notifications are created when accepted consumption crosses a threshold. Existing usage is not checked retroactively, and plan changes alone do not generate notifications.

### Database Migration

The notification schema is defined in
`sql/005_low_credit_notifications.sql`.

This migration is managed by the tracked SQL migration runner.
Docker Compose applies pending migrations automatically before
starting the dependent application services.

## Event Producer and Consumer

For operational guidance, see the [Event Consumer Operations Guide](docs/consumer-operations.md).

The service uses a **transactional PostgreSQL outbox** to decouple quota-threshold event production from asynchronous processing. It does not require Kafka or RabbitMQ.

When accepted consumption crosses an account or user threshold of 80%, 90%, or 100%, `QuotaEventProducer` writes a `quota.threshold.reached` event to the `outbox_events` table in the **same database transaction** as the usage update and low-credit notification. If the transaction rolls back, the event is not published.

Each event includes the account ID, optional user ID, scope, UTC month, threshold percentage, monthly limit, credits used, and remaining credits. A unique deduplication key identifies the account or user, month, and threshold. Idempotent request replays do not publish additional events.

### Event Consumer

`QuotaEventConsumer` runs independently of the API and polls PostgreSQL for available events. It atomically claims an event using `FOR UPDATE SKIP LOCKED`, allowing concurrent consumers to avoid claiming the same event simultaneously.

The consumer uses the event statuses `pending`, `processing`, `completed`, and `failed`. Successfully handled events are marked `completed` with a processing timestamp.

Failure handling includes:

- A 60-second processing lease and recovery of events abandoned by a crashed worker.
- Up to five processing attempts.
- Exponential retry delays of 5, 10, 20, and 40 seconds after unsuccessful attempts.
- Terminal `failed` status and a recorded error after retries are exhausted.
- Attempt-number and lease checks to prevent stale workers from marking superseded attempts as completed.

The default event handler performs no external side effects.
The consumer records structured processing logs and updates
event status in PostgreSQL.

External notification delivery is not implemented.
Processing follows an at-least-once model, so future external
side-effect handlers require idempotency safeguards.

### Implementation Files

```text
src/infrastructure/events/QuotaEventProducer.ts
src/infrastructure/events/QuotaEventConsumer.ts
src/infrastructure/events/run-consumer.ts
src/infrastructure/events/run-test-consumer.ts
src/infrastructure/events/QuotaEventConsumer.integration.test.ts
```

### Run the Consumer Locally

```bash
npm run consumer
```

The worker uses the configured PostgreSQL connection, checks for available events, and continues polling until stopped. Use `Ctrl+C` for graceful shutdown. For isolated development and tests, explicitly select `DB_NAME=usage_metering_test`.

### Outbox Migration

The outbox schema is defined in `sql/006_event_outbox.sql`.

The tracked migration runner creates and maintains the required
schema through versioned SQL migrations.

Do not apply individual migration files manually to databases
managed by the migration runner.

## Idempotency

Every logical consumption request includes a client-supplied `requestId`.

The request ID is scoped to the account.

If an identical request is retried, the service returns the previously recorded decision without consuming credits again.

If the same request ID is reused with conflicting parameters, the service rejects the conflict.

Idempotency protects clients against duplicate consumption caused by:

- Network retries.
- Timeouts.
- Repeated submissions.
- Uncertain responses.

Recorded remaining balances are returned for idempotent retries when available.

Clients should reuse the original request ID when retrying the same logical operation.

## Concurrency and Atomic Updates

Concurrent credit consumption is handled using PostgreSQL transactions.

The service uses account-level locking to coordinate operations sharing an account quota.

Within a transaction, the service evaluates limits and performs atomic conditional updates.

This prevents multiple requests from independently approving consumption based on the same outdated balance.

### Atomic Conditional Updates

Consumption updates are conditional on the applicable quota still permitting the operation.

This allows quota correctness without requiring optimistic version counters.

### Account-Level Locking

Transactions acquire account-level row locks to coordinate:

- Consumption requests.
- Account plan changes.
- User plan changes.
- Custom plan modifications.

A consistent locking order helps reduce concurrency conflicts.

### Transactional Consistency

Accepted consumption updates the necessary account and user usage records within one transaction.

Consumption decisions and idempotency records are also stored transactionally.

Low-credit notifications are stored within the same transaction when applicable.

Quota-threshold outbox events are written in that same transaction when applicable.

If a transaction fails, its incomplete operations are rolled back.

The design prioritizes quota correctness over maximizing throughput for a single heavily used account.

## Plan Changes and Historical Records

Plan assignments can change without resetting the credits already consumed during the current month.

Updated limits affect subsequent requests.

### Account Plan Changes

An account may switch to an accessible account plan.

The service records the limits that become effective following the switch.

Reassigning the existing plan does not create a duplicate history event.

### User Plan Changes

An individual user may switch to an accessible user plan.

The change preserves previously consumed credits.

The new plan limits are recorded in the user's history.

### Custom Plan Revisions

Accounts may update their owned custom plans.

If an updated custom account plan is assigned to the account, the new limits are recorded.

If an updated custom user plan is assigned to multiple users, each affected user receives a new history record.

Unchanged plans do not generate duplicate history events.

All changes are handled transactionally.

## Historical Monthly Reporting

Monthly reporting reconstructs the plan limits effective at the applicable reporting cutoff.

The reporting implementation is located in:

```text
src/application/services/GetMonthlyReportService.ts
```

It uses Prisma and PostgreSQL transactions.

### Reporting Consistency

The service uses:

```text
RepeatableRead
```

transaction isolation to retrieve a consistent view of account, user, usage, and plan-history data.

The reporting cutoff uses PostgreSQL's:

```sql
transaction_timestamp()
```

The cutoff is stable within the reporting transaction.

### Historical Snapshots

The service retrieves plan-history records applicable at the cutoff and identifies the latest effective record.

It also returns applicable plan-change events in chronological order.

When historical limits cannot be established, the report indicates that they are unavailable rather than substituting current limits.

### Regression Protection

An additional regression test checks whether a newly created account can immediately retrieve its initial monthly plan limits.

The test repeats account creation and immediate reporting 30 times.

This targets a previously observed intermittent issue involving missing historical limits.

The regression test is retained as an automated safeguard. The original intermittent failure's precise root cause has not been conclusively established.

## Getting Started

### Prerequisites

- Docker Engine or Docker Desktop.
- Docker Compose.
- Git.
- Node.js 22 for backend development.
- Node.js 22 for frontend development, matching CI.
- npm.

### 1. Clone the Repository

    git clone https://github.com/naim-eng/usage-metering-service.git
    cd usage-metering-service
    git checkout feature/saas-platform

### 2. Configure the Backend

    cp -n .env.example .env

Replace the placeholder database password and administrative API key with strong credentials.

Do not commit environment files or real credentials.

### 3. Start the Backend Services

    docker compose up -d --build db api consumer

The migration service applies pending SQL migrations before the API and consumer start.

Local service addresses:

- PostgreSQL: 127.0.0.1:5433
- Backend API: http://localhost:3000
- Database: usage_metering

### 4. Verify Backend Readiness

    docker compose ps
    curl http://localhost:3000/health
    curl http://localhost:3000/ready

Both HTTP endpoints should return status 200.

### 5. Start the Customer Dashboard

    cd web
    npm ci
    cp -n .env.example .env.local

Configure the frontend environment using the instructions in [web/README.md](web/README.md).

The database connection must target the migrated database, and the administrative API key must match the backend configuration.

    npm run dev -- --port 3002

Open http://localhost:3002 in your browser.

## Native Backend Development

The backend can also run directly from source while PostgreSQL
runs in Docker.

From the repository root, install dependencies:

    npm ci

Generate the Prisma client:

    npx prisma generate

Configure the backend environment using .env.example as a reference.
Preserve existing environment files and credentials.

Start PostgreSQL if it is not already running:

    docker compose up -d db

Apply pending database migrations:

    npx tsx scripts/migrations/run.ts

Start the backend:

    npm start

The native backend requires port 3000 to be available.
Do not start it alongside a Docker API using the same port.

Runtime database connections use the DB_* environment variables.

## Docker Deployment

Docker Compose provides isolated primary and demonstration environments.

### Main Services

| Service | Purpose |
|---|---|
| `db` | Primary PostgreSQL database |
| `migrate` | One-time SQL migration runner |
| `api` | Main HTTP API |
| `consumer` | Independent event consumer |

Start the backend and consumer:

    docker compose up -d --build db api consumer

The migration service waits for PostgreSQL to become healthy.
The API and consumer require successful migration completion.

The API and database ports are bound to the local loopback interface.

### Event Consumer

The consumer belongs to the optional `events` profile.

Inspect its logs:

    docker compose logs --tail=30 consumer

See the [consumer operations guide](docs/consumer-operations.md)
for monitoring, recovery, retries, and operational limitations.

### Isolated Demo Services

| Service | Purpose |
|---|---|
| `demo-db` | Isolated demonstration database |
| `demo-migrate` | Demonstration database migrations |
| `demo-api` | Demonstration HTTP API |
| `demo-client` | Example demonstration client |

The demonstration database is `usage_metering_demo`.
It uses a separate persistent Docker volume.

For a fresh or correctly migrated demonstration database:

    docker compose --profile demo run --rm --build demo-client

Existing demonstration databases without migration history require
schema validation and appropriate baselining before startup.

### Stop Docker Services

    docker compose stop

To remove primary containers while preserving named volumes:

    docker compose down

Never use `docker compose down -v` unless database deletion
is explicitly intended.

## Automated Tests

The backend includes automated unit, integration, and regression tests.

### TypeScript Validation

    npm run typecheck

### Run All Backend Tests

    npm test

### Run Unit Tests

    npm run test:unit

### Run Integration Tests

    npm run test:integration

The integration test runner:

1. Checks that port 3001 is available.
2. Prepares the isolated usage_metering_test database.
3. Applies pending database migrations.
4. Starts a temporary API on port 3001.
5. Executes the integration and regression suites.
6. Stops the temporary API when finished.

### Test Database Safety

Integration tests must use usage_metering_test, never the primary
usage_metering database.

The test setup preserves existing test data. Test execution may
create additional records in the isolated database.

### Test Coverage

- Account authentication and tenant isolation.
- Account and user quota enforcement.
- Concurrent consumption and transactional consistency.
- Idempotency and conflicting request identifiers.
- Custom plans and historical plan revisions.
- Usage history, allowances, and monthly reporting.
- Low-credit notifications and deduplication.
- Transactional outbox event production.
- Consumer retries, lease recovery, and crash recovery.
- Customer project creation and API key management.
- Project-scoped API key authentication.
- Database configuration and startup validation.
- Security middleware and trusted proxy configuration.
- Readiness checks and graceful shutdown.
- Structured logging and consumer heartbeat reporting.
- Read-only outbox monitoring.

### Continuous Integration

GitHub Actions validates both backend and frontend changes.

Backend checks include:

- Prisma client generation.
- TypeScript validation.
- Database migration history verification.
- Migration idempotency verification.
- Automated unit and integration tests.

Frontend checks include:

- ESLint validation.
- Next.js type generation and TypeScript validation.
- Application build verification.

CI uses Node.js 22 for the backend and frontend.

### Frontend Validation

From the web directory:

    npm run lint
    npm run build

## Example Client

The example client is located at:

```text
examples/demo-client.ts
```

It demonstrates two users under one account:

- Ahmed using the Premium user plan.
- Sara using the Basic user plan.

The example uses a custom shared account quota.

It demonstrates:

- Successful credit consumption.
- User maximum-per-request enforcement.
- Shared account quota enforcement.
- Idempotent retries.
- Account plan upgrades.
- Preserved consumed credits following plan changes.
- Account and user allowance inspection.

The Docker demo runs against the isolated demonstration database.

The example client is intentionally configured to avoid performing demonstration consumption against the main production-style API.

## Performance Testing

A repeatable load-test script is available at:

```text
src/load-test.ts
```

The recorded workload contains 100 consumption requests submitted in batches of 10 concurrent operations.

Two local benchmark runs were recorded before the application-wide Prisma migration.

| Metric | Run 1 | Run 2 |
|---|---:|---:|
| Requests | 100 | 100 |
| Accepted | 100 | 100 |
| Errors | 0 | 0 |
| Throughput | 67.23 req/s | 57.78 req/s |
| P95 latency | 155.27 ms | 179.59 ms |

Both runs recorded exactly 100 consumed credits without rejected requests or errors.

Detailed results are located at:

```text
results/load-test-results.md
```

These results establish a historical local benchmark baseline.

They should not be interpreted as verified performance measurements of the final Prisma-refactored implementation.

The benchmark also does not establish maximum production throughput.

## Database Schema and Initialization

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

## Project Structure

The repository is organized around the backend, customer dashboard,
database migrations, operational tooling, and documentation.

| Path | Responsibility |
|---|---|
| `src/index.ts` | Express API entry point |
| `src/auth.ts` | Account and project API key authentication |
| `src/projects.ts` | Customer project management endpoints |
| `src/domain/services/` | Quota and notification business rules |
| `src/application/services/` | Application workflows |
| `src/infrastructure/database/` | Database access and configuration |
| `src/infrastructure/repositories/` | Persistence and transaction operations |
| `src/infrastructure/events/` | Event production, processing, and monitoring |
| `src/infrastructure/logging/` | Structured logging and error handling |
| `prisma/` | Prisma database schema |
| `sql/` | Versioned SQL migrations |
| `scripts/migrations/` | Migration runner and baseline utility |
| `scripts/monitor-outbox.ts` | Read-only event monitoring |
| `scripts/` | Integration testing and database setup |
| `web/src/app/` | Next.js pages, components, and server-side API routes |
| `web/src/lib/` | Customer authentication and authorization |
| `web/.env.example` | Frontend environment configuration template |
| `docs/` | Customer integration and operational guides |
| `examples/` | Example API client |
| `results/` | Historical performance testing results |
| `.github/workflows/` | Continuous integration |
| `Dockerfile` | Backend container image |
| `docker-compose.yml` | Local and demonstration environments |
| `.env.example` | Backend environment configuration template |

Automated tests are located alongside the relevant backend modules.

Generated Prisma files, local secrets, and environment-specific
configuration files must not be committed.

## Design Decisions and Trade-offs

### PostgreSQL as Source of Truth

All persistent usage records, quota totals, and consumption decisions are stored in PostgreSQL.

This allows consumption decisions to survive API restarts.

### Prisma ORM

Prisma provides typed database access and reduces repetitive SQL in application workflows.

The existing SQL schema remains authoritative for initialization.

### DDD-Inspired Clean Architecture

The code separates HTTP concerns, business workflows, domain rules, and database infrastructure.

The architecture is deliberately pragmatic rather than strictly enforcing every possible abstraction boundary.

### Account-Level Serialization

Quota-changing operations coordinate through account-level locking.

This improves correctness for shared quotas but can reduce throughput for accounts with very high concurrent traffic.

### Atomic Conditional Updates

Quota updates are conditional on remaining credits and operate within transactions.

No optimistic version counters are required.

### Separate Monthly Aggregates

The database maintains account-level and user-level usage totals.

This supports efficient quota evaluation without scanning every consumption request.

### Explicit Idempotency Keys

Client-supplied request IDs allow retries to return existing decisions without charging credits again.

### Historical Plan Snapshots

Plan history is retained to support reports that distinguish past effective limits from current plan settings.

### Low-Credit Notification Deduplication

Notifications are recorded once per account or user, threshold, and UTC month.

Notification records are saved in the same transaction as accepted consumption.

### Transactional Event Outbox

Quota-threshold events are committed together with accepted consumption and low-credit notifications. A separate PostgreSQL-backed consumer handles events asynchronously, using deduplication keys, leases, retries, and concurrent-safe claims without introducing an external message broker.

### Isolated Demonstration Environment

The Docker demo has a separate database, allowing end-to-end examples without consuming credits from the primary application database.

## Product Assumptions

The service is built around the following assumptions:

- Credits represent resource consumption, not money.
- Each user belongs to one account.
- User identifiers are scoped to their account.
- Every consumption request references a registered user.
- Account quotas are shared across their users.
- Each user also has independent quotas.
- Monthly accounting uses UTC calendar months.
- Plan changes preserve previously consumed credits.
- Consumption is all-or-nothing.
- Every logical consumption request has a unique request ID.
- Account and project API keys must be kept secret.
- Usage is nonnegative.
- The current API does not support reversing previously consumed credits.

Each customer project is associated with a metering account.

## Dependency Security and Maintenance

### Runtime Standardization

The backend and frontend use Node.js 22. Local development is pinned
to Node.js 22.23.5 through the repository's `.nvmrc` file.

Both package manifests declare Node.js 22 compatibility. Docker
and GitHub Actions use the Node.js 22 release line.

Node.js 20 was replaced because it reached end of life. Future runtime
upgrades should be completed before the selected release line reaches
the end of its security support period.

### Dependency Security Assessment

The dependency security assessment completed on November 26, 2026,
reported the following results:

| Audit | Known vulnerabilities |
|---|---:|
| Backend full dependency tree | 0 |
| Backend production dependencies | 0 |
| Frontend full dependency tree | 0 |
| Frontend production dependencies | 0 |

Selected dependency updates included:

- dotenv 18.0.10.
- Better Auth 1.7.28.
- Node.js type definitions aligned with Node.js 22.
- React type definitions updated to 19.3.3.

All four npm security audits completed successfully. These results
represent the known vulnerabilities reported at the time of assessment
and do not guarantee the absence of security vulnerabilities.

### Regression Validation

Following the runtime and dependency updates, the complete automated
regression suite passed:

| Test suite | Passed | Failed |
|---|---:|---:|
| Backend unit tests | 95 | 0 |
| Backend integration tests | 57 | 0 |
| Frontend end-to-end tests | 63 | 0 |
| Total | 215 | 0 |

Backend and frontend TypeScript validation, frontend ESLint validation,
application builds, container readiness, and isolated E2E database
cleanup verification also passed.

### Known Dependency Maintenance Limitations

**ESLint 9**

The frontend currently retains ESLint 9.39.5, which is no longer
supported upstream.

An ESLint 10 upgrade was evaluated but encountered dependency
compatibility conflicts within the existing frontend linting stack.

ESLint 9 is retained temporarily as a development tooling limitation.
The upgrade should be reassessed when the relevant dependencies
provide compatible peer dependency declarations.

Dependency compatibility checks must not be bypassed using
forced installation or legacy peer dependency resolution.

**Optional Sharp-related packages**

Following a clean frontend dependency installation, npm reports
the following packages as extraneous:

- @emnapi/runtime 1.11.3.
- @img/sharp-wasm32 0.35.5.

Both packages appear in the lockfile as optional dependencies.
The exact reason for npm's extraneous classification remains
unconfirmed.

Neither package was reported as vulnerable by the completed audits.
They are retained without manual dependency tree modification
pending further investigation.

### Ongoing Dependency Maintenance

- Review dependency security advisories regularly.
- Run full and production-only npm audits for both applications.
- Review runtime support periods before production deployment.
- Evaluate major dependency upgrades independently.
- Preserve reproducible installations through committed lockfiles.
- Run automated regression tests after dependency changes.
- Reassess documented maintenance limitations before production release.

## Environment Security

See [Environment Security and Secret Management](docs/environment-security.md)
for deployment configuration, credential requirements, environment
isolation and secret rotation procedures.

## Limitations

Current limitations include:

- No dedicated platform administration dashboard.
- No production-scale performance validation.
- No external email, SMS, or push notification delivery.
- Account-level locking may limit throughput under heavy concurrency.
- API rate limiting is not distributed across multiple instances.
- Event processing provides at-least-once semantics.
- The default event handler performs no external side effects.
- No automatic replay of permanently failed events.
- No automated monitoring alerts.
- Hosted PostgreSQL TLS connectivity has not been validated.
- The existing demonstration database requires migration verification.

## Project Verification

The implementation has been validated through:

- Backend TypeScript checks.
- Automated unit, integration, and regression tests.
- Database migration history and idempotency checks.
- Concurrent quota enforcement and transaction rollback tests.
- Project API key authentication and isolation tests.
- Event consumer crash recovery and graceful shutdown tests.
- Frontend linting, TypeScript checks, and build verification.
- Automated GitHub Actions workflows.

The latest recorded backend test baseline contains 152 passing
tests: 95 unit tests and 57 integration tests.

Historical performance results are documented in
[load-test-results.md](results/load-test-results.md).

## Project Status

The Usage Metering and Quota Service has evolved from a backend
quota enforcement service into a full-stack usage metering platform.

The implementation includes a customer dashboard, organization-based
project management, project API keys, transactional quota enforcement,
historical reporting, asynchronous event processing, database migration
tracking, and operational monitoring.

Current development takes place on the feature/saas-platform branch.

The platform is configured for local development and validation.

Further frontend review, end-to-end system testing, security review,
and backup and restoration verification remain part of the
local development roadmap.

- [Customer authentication security](docs/authentication-security.md)
