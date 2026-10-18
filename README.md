
# Usage Metering and Quota Service

A backend service for tracking resource consumption and enforcing configurable usage quotas across accounts and individual users.

Built with **TypeScript, Node.js, Express 5, Prisma ORM, and PostgreSQL 17**, the service demonstrates transactional quota enforcement, account isolation, idempotency, concurrent request handling, custom plan management, historical reporting, and a DDD-inspired Clean Architecture.

The project was developed as a backend engineering capstone and includes automated tests, an example client, Docker Compose deployment, an isolated demonstration environment, and reproducible performance testing.

## Features

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
- Prisma ORM for application database operations.
- DDD-inspired Clean Architecture.
- Automated unit, integration, and regression tests.
- Docker Compose deployment with an isolated demo environment.

## Technology Stack

| Component | Technology |
|---|---|
| Runtime | Node.js 20 |
| Language | TypeScript |
| HTTP framework | Express 5 |
| ORM | Prisma 6.12 |
| Database | PostgreSQL 17 |
| Database utilities | node-postgres (`pg`) |
| TypeScript execution | `tsx` |
| Containerization | Docker and Docker Compose |
| Testing | Node.js test runner |
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

### Infrastructure Layer

The Infrastructure layer provides database connectivity and repository implementations.

Key directories include:

```text
src/infrastructure/database/
src/infrastructure/repositories/
```

The application uses Prisma ORM for typed database access.

Infrastructure repositories support credit consumption and related transactional operations.

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

The existing SQL initialization scripts remain responsible for creating and initializing database tables.

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

Authenticated API operations use account API keys.

A newly created account receives an API key that must be sent in the request header:

```http
X-API-Key: <account-api-key>
```

API keys are generated using cryptographically secure random values.

Only SHA-256 hashes of API keys are stored in PostgreSQL.

Authentication uses Prisma to retrieve the account associated with the hashed key.

### Administrative Authentication

Account creation requires a separate administrative key:

```http
X-Admin-Key: <admin-api-key>
```

The administrative key is configured through the `ADMIN_API_KEY` environment variable.

### Tenant Isolation

Every authenticated operation is scoped to its account.

The application prevents accounts from:

- Consuming another account's user's credits.
- Viewing another account's usage history.
- Accessing another account's user allowances.
- Modifying another account's custom plans.
- Assigning inaccessible custom plans.

API keys and administrative credentials must never be committed to version control.

## API Reference

The default local API URL is:

```text
http://localhost:3000
```

### Service and Plan Information

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/health` | Service health check |
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
- Node.js 20 and npm for local development.

### 1. Clone the Repository

```bash
git clone https://github.com/naim-eng/usage-metering-service.git
cd usage-metering-service
```

### 2. Configure Environment Variables

Create a local environment configuration:

```bash
cp .env.example .env
```

Configure a strong database password and administrative API key.

The Docker Compose configuration requires:

```text
DB_PASSWORD
ADMIN_API_KEY
```

Additional database environment variables are used when running the application directly on the host.

Do not commit `.env`, `prisma/.env`, or real credentials.

### 3. Start PostgreSQL

For local development:

```bash
docker compose up -d db
```

The primary PostgreSQL container exposes its database on:

```text
127.0.0.1:5433
```

The main database is:

```text
usage_metering
```

### 4. Install Dependencies

```bash
npm ci
```

### 5. Generate Prisma Client

```bash
npx prisma generate
```

Prisma generates the typed client from:

```text
prisma/schema.prisma
```

The client output is excluded from Git.

### 6. Start the API

```bash
npm start
```

The default API port is 3000.

Verify the health endpoint:

```bash
curl http://localhost:3000/health
```

Expected response:

```json
{
  "status": "ok"
}
```

## Docker Deployment

The Docker Compose configuration provides separate main and demonstration services.

### Main Services

| Service | Purpose |
|---|---|
| `db` | Primary PostgreSQL database |
| `api` | Main HTTP API |

Start the main application:

```bash
docker compose up -d --build db api
```

The main API is accessible at:

```text
http://localhost:3000
```

### Isolated Demo Services

| Service | Purpose |
|---|---|
| `demo-db` | Isolated demonstration PostgreSQL database |
| `demo-api` | Demonstration API |
| `demo-client` | Example client |

The demo database is named:

```text
usage_metering_demo
```

It has a separate persistent Docker volume from the primary database.

### Run the Docker Demo

Build the demo images:

```bash
docker compose build demo-api demo-client
```

Execute the demonstration:

```bash
docker compose run --rm --build demo-client
```

The example client connects to:

```text
http://demo-api:3000
```

A successful demonstration ends with:

```text
Demo completed successfully!
```

### Stop Docker Services

```bash
docker compose down
```

This removes containers while preserving named database volumes.

**Do not run `docker compose down -v` unless you intentionally want to delete the stored database data.**

## Automated Tests

The project contains multiple automated test suites.

| Suite | Tests |
|---|---:|
| Quota unit tests | 6 |
| Domain policy tests | 6 |
| Prisma consumption integration tests | 5 |
| API integration tests, including the reporting regression test | 25 |

Total: **42 automated test cases** across these suites.

The monthly-reporting regression test performs 30 account-creation and reporting iterations within one test case.

### TypeScript Validation

```bash
npm run typecheck
```

### Run Standard Project Tests

```bash
npm test
```

This runs the quota unit tests and API integration tests.

### Run Quota Unit Tests

```bash
npm run test:unit
```

### Run API Integration Tests

```bash
npm run test:integration
```

The script:

1. Prepares the isolated test database.
2. Starts a temporary API on port 3001.
3. Runs the main API integration tests.
4. Runs the monthly-reporting regression test.
5. Stops the temporary server.

### Run Domain Tests

```bash
npx tsx --test src/domain/services/QuotaPolicy.test.ts
```

### Run Prisma Integration Tests

```bash
npx tsx --test src/application/services/ConsumeCreditsService.integration.test.ts
```

Prisma integration tests require an appropriately configured test-only `DATABASE_URL`.

They validate that the target database is `usage_metering_test` before running database operations.

### Test Database Safety

The integration tests must run against:

```text
usage_metering_test
```

They must not run against:

```text
usage_metering
```

Database safety checks are implemented in the test runner and test infrastructure.

The temporary integration-test API uses port 3001 to avoid interfering with the main API on port 3000.

### Test Coverage

The tests cover:

- API-key authentication.
- Account isolation.
- Account and user quota enforcement.
- Concurrent consumption.
- Atomic transaction rollback.
- Idempotent retries.
- Conflicting request IDs.
- Account and user plan switching.
- Custom plan ownership.
- Custom plan revisions.
- Historical plan records.
- Usage history.
- Monthly reporting.
- Account and user allowances.
- Immediate reporting after account creation.

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

These files remain part of the project after introducing Prisma.

Prisma's schema models the existing database structure.

### Persistence

PostgreSQL uses named Docker volumes.

Database contents persist across ordinary container restarts.

Initialization scripts execute when a new empty PostgreSQL data volume is initialized.

Do not delete or reset database volumes unless data loss is explicitly intended.

## Project Structure

```text
usage-metering-service/
|
|-- prisma/
|   |-- schema.prisma
|
|-- sql/
|   |-- 001_initial_schema.sql
|   |-- 002_seed_plans.sql
|   |-- 003_plan_history.sql
|   |-- 004_idempotency_balances.sql
|
|-- src/
|   |-- index.ts
|   |-- auth.ts
|   |-- api-keys.ts
|   |-- plans.ts
|   |-- allowances.ts
|   |-- history.ts
|   |-- reports.ts
|   |-- db.ts
|   |
|   |-- domain/
|   |   |-- services/
|   |       |-- QuotaPolicy.ts
|   |       |-- QuotaPolicy.test.ts
|   |
|   |-- application/
|   |   |-- services/
|   |       |-- ConsumeCreditsService.ts
|   |       |-- CreateAccountService.ts
|   |       |-- CreateUserService.ts
|   |       |-- ChangeAccountPlanService.ts
|   |       |-- ChangeUserPlanService.ts
|   |       |-- CustomPlanService.ts
|   |       |-- ListPlansService.ts
|   |       |-- GetUsageHistoryService.ts
|   |       |-- GetAllowancesService.ts
|   |       |-- GetMonthlyReportService.ts
|   |       |-- ConsumeCreditsService.integration.test.ts
|   |
|   |-- infrastructure/
|   |   |-- database/
|   |   |-- repositories/
|   |
|   |-- generated/
|   |   |-- prisma/
|   |
|   |-- integration.test.ts
|   |-- monthly-report-regression.test.ts
|   |-- test-quota.ts
|   |-- test-db.ts
|   |-- load-test.ts
|
|-- scripts/
|   |-- setup-test-db.sh
|   |-- run-integration-tests.sh
|
|-- examples/
|   |-- demo-client.ts
|
|-- results/
|   |-- load-test-results.md
|
|-- backups/
|
|-- Dockerfile
|-- docker-compose.yml
|-- prisma.config.ts
|-- package.json
|-- tsconfig.json
|-- README.md
```

Generated Prisma files, local secrets, and environment-specific files are not intended to be committed.

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
- Account API keys must be kept secret.
- Usage is nonnegative.
- The current API does not support reversing previously consumed credits.

The service is a usage-metering backend rather than a complete subscription billing platform.

## Limitations

Current limitations include:

- No subscription billing or payment processing.
- No graphical administration dashboard.
- No production-scale performance testing.
- Account-level locking may reduce throughput under heavy concurrent traffic.

## Project Verification

The refactored implementation has successfully completed:

- TypeScript validation.
- 6 quota unit tests.
- 6 Domain policy tests.
- 5 Prisma consumption integration tests.
- 25 HTTP integration tests, including the new monthly-reporting regression test.
- 30 immediate account-creation/reporting checks within the regression test.
- Five consecutive successful runs of the original 24-test integration suite during stability verification.
- A successful isolated Docker Compose demo with six passing checks.

The project demonstrates practical backend engineering concepts including transactional consistency, account isolation, idempotency, atomic quota enforcement, Prisma ORM integration, and DDD-inspired separation of responsibilities.


## Project Status

The Usage Metering and Quota Service has been completed and published on GitHub.

The application implements DDD-inspired Clean Architecture, Prisma ORM, atomic quota enforcement without version counters, transactional concurrency protection, and historical usage reporting.

The implementation has passed TypeScript validation, automated unit and integration tests, and an isolated Docker Compose demonstration.

