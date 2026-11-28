# System Architecture

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

## Related Documentation

- [Technical reference](technical-reference.md)
- [Authentication security](authentication-security.md)
- [Consumer operations](consumer-operations.md)
- [Production ingress](production-ingress.md)

## Tenant and Resource Relationships

    Customer identity
        |
    Organization membership
        |
    Organization
        |
    Project
        |-- Project API keys
        |
    Metering account
        |-- Account plan
        |-- Metered users
        |-- Usage records
        |-- Notifications

Customer identities authenticate to the dashboard.
Metered users represent resource consumers within a project.

Each project maps to a metering account.
External applications authenticate using project API keys.
Administrative credentials remain server-side.

These are logical resource relationships, not exact
database foreign-key definitions.

See the [database guide](database.md) for persistence details.
