# Developer and Testing Guide

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

End-to-end checks include:

- Playwright browser tests.
- Customer authentication and project workflows.
- API key management and tenant isolation.
- Isolated E2E database and email infrastructure.
- Database cleanup verification.

CI uses Node.js 22 for the backend and frontend.

### Verified Regression Baseline

| Test suite | Passed |
|---|---:|
| Unit tests | 318 |
| Integration tests | 59 |
| Browser end-to-end tests | 114 |
| Total | 491 |

This baseline was established during Step 125.
All three CI jobs subsequently passed for commit 80a8159.

The E2E suite uses separate infrastructure and must not
target the primary development database.

## Development Workflow

- Work on a dedicated feature branch.
- Install dependencies using npm ci.
- Keep database migrations backward-compatible where possible.
- Add regression tests for behavioral changes.
- Run relevant tests before committing.
- Review staged changes and scan for secrets.
- Confirm GitHub CI passes before merging.

## Frontend Verification

From the web directory:

    npm ci
    npx tsc --noEmit
    npm run lint
    npm run build
    npm run test:e2e -- --fail-on-flaky-tests

## Security Verification

Run dependency audits in both package directories:

    npm audit --audit-level=high

Scan staged changes before committing:

    gitleaks git --staged --redact

## Related Documentation

- [Installation guide](installation.md)
- [System architecture](architecture.md)
- [Database documentation](database.md)
- [Operations guide](operations-guide.md)
- [Security regression summary](security-regression-summary.md)
