
# Usage Metering and Quota Service

A backend service for tracking resource consumption and enforcing configurable usage limits across accounts and individual users.

Built using **TypeScript, Node.js, Express, and PostgreSQL**, the service supports account-level and user-level quotas, custom plans, API-key authentication, idempotent requests, concurrent consumption, usage history, and dynamic plan changes.

The project includes automated tests, an example client, an isolated Docker demonstration environment, and reproducible performance testing.

## Features

- Separate accounts and users with account-scoped authentication.
- Predefined account and user plans.
- Account-owned custom plans that can be created, listed, and updated.
- Monthly UTC consumption limits and per-request limits.
- Shared account quotas enforced across all users.
- Individual user quotas enforced independently.
- Atomic acceptance or rejection of consumption requests.
- Rejection responses identifying the responsible quota rule and scope.
- Idempotency protection against duplicate consumption.
- Transactional quota enforcement under concurrent requests.
- Immediate plan changes without resetting previously consumed credits.
- Historical records of consumption requests and plan changes.
- Account and user allowance inspection.
- Monthly usage reports.
- Automated unit and integration tests.
- Docker Compose deployment with an isolated example client.

## Technology Stack

| Component | Technology |
|---|---|
| Runtime | Node.js 20 |
| Language | TypeScript |
| HTTP framework | Express 5 |
| Database | PostgreSQL 17 |
| Database driver | node-postgres (`pg`) |
| TypeScript execution | `tsx` |
| Containerization | Docker and Docker Compose |
| Testing | Node.js test runner and integration tests |

## Architecture

The system uses a relational database as the authoritative source of plan configuration, consumption totals, and request decisions.

```text
                       API Client
                           |
                           | X-API-Key
                           v
                 Express / TypeScript API
                           |
                 Account Authentication
                           |
                           v
                   Quota Evaluation
                    /           \
             Account Rules    User Rules
                    \           /
                     \         /
                  PostgreSQL Transaction
                           |
              +------------+------------+
              |            |            |
          Plans and     Monthly      Request
           Accounts      Usage       History
```

Accounts own users and custom plans. Every authenticated request is associated with an account, and account ownership is enforced when accessing user records or modifying custom plans.

Each accepted consumption request updates the applicable account and user totals in a database transaction.

Rejected requests do not consume credits, but their decisions are recorded for auditing and idempotent retries.

## Quota Model

The service evaluates two types of limits at both the account and user levels.

### Monthly limit

The maximum number of credits that may be consumed during a UTC calendar month.

An account's monthly consumption includes usage from all users registered under that account.

Each user also has an independent monthly consumption total.

### Maximum per request

The maximum number of credits that may be requested in a single operation.

A request must satisfy both the account's and user's per-request limits.

### Consumption decision

A request is accepted only when all applicable account-level and user-level rules permit it.

If any rule is exceeded, the entire request is rejected. Partial credit consumption is not supported.

A rejection identifies the relevant scope (`account` or `user`) and rule (`monthly_limit` or `max_per_request`).

### Monthly accounting

Usage is tracked by UTC calendar month.

Historical monthly records are retained when a new month begins. Consumption is not carried into the following month's totals.

### Remaining allowances

Current remaining credits are calculated from the assigned plan's monthly limit and consumption already recorded for the current month.

A user can have remaining individual credits while being unable to consume them because the shared account quota has been exhausted.

## Predefined Plans

The database automatically seeds four predefined plans.

| Scope | Plan | Monthly credits | Maximum per request |
|---|---|---:|---:|
| Account | Starter | 100 | 20 |
| Account | Pro | 1,000 | 100 |
| User | Basic | 10 | 2 |
| User | Premium | 100 | 10 |

Accounts can also create custom account or user plans.

Custom plans are owned by the creating account. Other accounts cannot access or modify them.

## Authentication and Account Isolation

The service uses account API keys for authenticated operations.

A newly created account receives an API key. The key is provided to the client and must be sent in the `X-API-Key` request header.

Account API keys are generated using cryptographically secure random values, and only their SHA-256 hashes are stored in PostgreSQL.

The account creation endpoint requires a separate administrative credential supplied through the `X-Admin-Key` header.

API keys must be treated as secrets. Do not commit real credentials to version control.

User lookups, plan ownership checks, usage inspection, and historical reporting are scoped to the authenticated account.

## API Reference

The default local API address is:

`http://localhost:3000`

### Service and plan information

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/health` | Service health check |
| GET | `/plans` | List predefined plans |
| GET | `/plans/custom` | List the account's custom plans |

### Accounts and users

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/accounts` | Create an account and issue an API key |
| POST | `/users` | Register a user under an account |
| GET | `/account` | Inspect the authenticated account's current plan and allowance |
| GET | `/users` | Inspect users, assigned plans, and allowances |
| PATCH | `/accounts/plan` | Change an account's assigned plan |
| PATCH | `/users/plan` | Change a user's assigned plan |

### Custom plan management

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/plans` | Create a custom plan |
| GET | `/plans/custom` | List account-owned custom plans |
| PATCH | `/plans/:planId` | Update an owned custom plan |

### Consumption and reporting

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/consume` | Evaluate and record a consumption request |
| GET | `/usage/history` | Retrieve historical request decisions |
| GET | `/usage/monthly` | Retrieve monthly account and user usage |

Authenticated endpoints require:

`X-API-Key: <account-api-key>`

Administrative account creation requires:

`X-Admin-Key: <admin-api-key>`

### Example: Consume credits

```http
POST /consume
Content-Type: application/json
X-API-Key: <account-api-key>

{
  "userId": "ahmed",
  "units": 2,
  "requestId": "a-unique-request-id"
}
```

The service evaluates account and user quotas and returns a decision.

The response indicates whether the request was accepted, the applicable rejection rule when relevant, and the resulting available allowances.

Each logical consumption operation should use a unique request ID. When retrying the same operation, reuse its original request ID.

## Idempotency and Concurrency

### Idempotency

Consumption requests are identified by a client-supplied request ID scoped to an account.

If an identical request is retried, the service returns the previously recorded decision instead of consuming credits again.

If the same request ID is reused with conflicting parameters, the service rejects the conflict.

For recent requests, the recorded remaining balances are returned with the original decision.

### Concurrent requests

Quota evaluation and accepted consumption are performed within PostgreSQL transactions.

The service locks the relevant account record so requests sharing an account cannot independently approve consumption against the same outdated balance.

This prevents concurrent requests from overspending the shared account quota.

Usage updates and request-history records are committed atomically.

## Plan Changes and Historical Records

Account and user plan assignments can be changed without deleting or resetting usage recorded for the current month.

Updated limits take effect on subsequent requests.

Custom plan updates also affect accounts or users currently assigned to those plans.

The service records plan changes in PostgreSQL and provides monthly reporting that includes relevant plan history.

Historical reporting distinguishes available recorded plan history from periods for which historical plan limits cannot be established.

## Getting Started

### Prerequisites

- Docker Engine or Docker Desktop
- Docker Compose
- Git

Node.js 20 and npm are additionally required for running development commands directly on the host.

### 1. Clone the repository

```bash
git clone <repository-url>
cd usage-metering-service
```

Replace `<repository-url>` with the final GitHub repository URL.

### 2. Configure environment variables

Copy the example configuration:

```bash
cp .env.example .env
```

Edit `.env` and provide a strong PostgreSQL password and a secure administrative API key.

Do not commit `.env`.

For the Docker deployment, the required Compose variables are:

- `DB_PASSWORD`
- `ADMIN_API_KEY`

The remaining variables in `.env.example` support direct local execution of the API.

### 3. Start the complete application

```bash
docker compose up --build
```

Docker Compose starts the main PostgreSQL database, the main API, and a separate demonstration environment.

The demonstration environment contains its own PostgreSQL database, API, and client.

The demo client runs automatically after its API becomes healthy.

The primary API is accessible at:

`http://localhost:3000`

Check its health:

```bash
curl http://localhost:3000/health
```

### 4. Inspect the demonstration results

In another terminal:

```bash
docker compose logs demo-client
```

A successful execution ends with:

```text
Demo completed successfully!
```

The demonstration includes users assigned to different plans, successful consumption, user-level rejection, shared account rejection, idempotent retries, and a plan upgrade.

The demo API connects to its own database, so its consumption does not affect the main account database.

### 5. Stop the application

```bash
docker compose down
```

This stops and removes containers while preserving named database volumes.

**Do not use `docker compose down -v` unless you intentionally want to delete the stored database data.**

## Local Development

Install dependencies:

```bash
npm ci
```

The application reads its database configuration and administrative key from environment variables.

With PostgreSQL running and the local configuration supplied, start the API:

```bash
npm start
```

Run TypeScript validation:

```bash
npm run typecheck
```

## Automated Tests

The project includes five quota-logic unit tests and 24 database-backed integration tests.

Run all tests:

```bash
npm test
```

Run unit tests only:

```bash
npm run test:unit
```

Run integration tests only:

```bash
npm run test:integration
```

The integration-test script prepares a separate database named `usage_metering_test`, starts a temporary API on port 3001, runs the integration tests, and stops the temporary server.

The tests cover authentication, tenant isolation, account and user quotas, idempotency, concurrent requests, plan changes, reporting, and allowance inspection.

**Never run integration tests against the main application database.**

## Example Client

The example client is located at:

`examples/demo-client.ts`

It demonstrates two users under one account with different plans:

- Ahmed: Premium user plan.
- Sara: Basic user plan.

The example creates a custom account plan with a shared limit of five credits.

It demonstrates successful requests, rejection by a user-specific rule, rejection by the shared account quota, idempotent retries, and an account plan upgrade that preserves previously consumed credits.

It also queries the current account and user allowances.

The client supports two isolated destinations:

- `http://localhost:3001` for local test execution.
- `http://demo-api:3000` inside Docker Compose.

It intentionally rejects direct execution against the main API on port 3000.

## Performance Testing

A repeatable load-test script is provided at:

`src/load-test.ts`

The test submits 100 consumption requests in batches of 10 concurrent operations.

Two successful local benchmark runs were recorded.

| Metric | Run 1 | Run 2 |
|---|---:|---:|
| Requests | 100 | 100 |
| Accepted | 100 | 100 |
| Errors | 0 | 0 |
| Throughput | 67.23 req/s | 57.78 req/s |
| P95 latency | 155.27 ms | 179.59 ms |

Both runs recorded exactly 100 consumed credits, with no rejected requests or errors.

Detailed results, database verification, limitations, and reproduction instructions are available in:

`results/load-test-results.md`

These results provide a baseline for the local environment and do not establish maximum production throughput.

## Database Schema and Initialization

SQL initialization and migration files are stored in `sql/`.

| File | Purpose |
|---|---|
| `001_initial_schema.sql` | Creates the core database schema |
| `002_seed_plans.sql` | Inserts predefined plans |
| `003_plan_history.sql` | Adds plan-limit history tracking |
| `004_idempotency_balances.sql` | Stores original remaining balances for idempotent retries |

Core tables include accounts, users, plans, monthly usage, and usage requests.

A separate plan-history table records relevant plan assignment changes and updates.

PostgreSQL named volumes preserve database data across ordinary container restarts.

Initialization scripts run automatically when PostgreSQL initializes a new empty database volume.


## Product Assumptions

The service is designed around the following product assumptions:

- **Credits represent usage, not money.** A credit is an abstract unit of resource consumption. The service does not manage payments, refunds, or monetary balances.
- **Each user belongs to one account.** User identifiers are scoped to their parent account, allowing different accounts to use the same external user identifier.
- **Every consumption request belongs to a registered user.** The request is evaluated against both the user's assigned plan and the parent account's assigned plan.
- **Account credits are shared.** All users under an account consume from the same account-level monthly allowance, while retaining separate user-level allowances.
- **Monthly limits follow UTC calendar months.** Consumption is tracked separately for each month. Previous months remain available for historical reporting.
- **Plan changes apply to subsequent requests immediately.** Changing a plan does not erase, refund, or reset credits already consumed during the current month.
- **Consumption is all-or-nothing.** Requests exceeding any applicable quota are rejected entirely; partial consumption is not supported.
- **Clients provide unique request IDs.** Retrying the same logical operation must reuse its original request ID to prevent duplicate charging.
- **API keys identify accounts.** The service assumes clients protect their account API keys and that administrative account creation uses a separate secret.
- **Usage is nonnegative and irreversible through the current API.** The service does not provide credit-refund or consumption-reversal operations.

These assumptions define the scope of the project and distinguish usage metering from a complete subscription billing platform.





## Design Decisions and Trade-offs

### PostgreSQL as the source of truth

Consumption totals and decisions are stored in PostgreSQL rather than in process memory.

This allows consumption to survive API restarts and supports transactional enforcement.

### Account-level locking

The implementation prioritizes quota correctness by serializing quota-changing operations within an account.

This simplifies enforcement of the shared account quota, although very high traffic concentrated on one account may experience lock contention.

### Separate monthly aggregates

The database stores account-level and user-level monthly consumption totals.

This supports shared account enforcement and individual user allowance inspection without scanning every historical request for each decision.

### Explicit idempotency keys

Clients provide request IDs so retries can be recognized without charging credits twice.

Conflicting reuse of the same request ID is rejected.

### Historical plan snapshots

Plan history is retained so historical reports can describe known plan changes without assuming that current limits always applied in the past.

### Isolated Docker demonstration

The Compose stack uses separate main and demonstration databases.

This adds deployment complexity but makes the example reproducible without modifying the main account's credits.

## Limitations and Future Improvements

This project focuses on quota enforcement rather than billing or payment processing.

Current limitations include:

- No payment processing, invoicing, or subscription billing.
- No graphical administration dashboard.
- No role-based administration system beyond the existing account and administrative credentials.
- No distributed multi-instance or high-availability testing.
- No production-scale benchmark or service-level objective.
- The performance test uses a limited local workload.
- Account-level serialization may limit throughput for a single heavily used account.
- Historical reporting depends on the plan-history information available in the database.

Possible future improvements include production observability, additional benchmark workloads, pagination or filtering enhancements, and more extensive deployment testing.

## Project Status

The implementation has passed:

- 5 unit tests.
- 24 integration tests.
- TypeScript validation.
- An end-to-end Docker Compose demonstration.
- Two reproducible load-test executions.
- Production dependency security auditing with zero reported vulnerabilities.

The application is intended as a backend engineering capstone demonstrating transactional quota enforcement, account isolation, idempotency, and practical deployment and testing.
