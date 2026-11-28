# Usage Metering and Quota Service

A full-stack SaaS platform for tracking application usage,
enforcing quotas, managing credits and monitoring consumption.

## Features

- Customer registration and email verification.
- Organization and workspace management.
- Project creation and API key management.
- Account-level and user-level usage quotas.
- Atomic and idempotent credit consumption.
- Usage dashboards and historical reporting.
- Low-credit notifications and event processing.
- Authentication, authorization and tenant isolation.

## Technology Stack

- Backend: Node.js 22, TypeScript and Express.
- Frontend: Next.js 16 and React 19.
- Database: PostgreSQL 17.
- Authentication: Better Auth.
- Infrastructure: Docker Compose.
- Testing: Playwright and automated backend tests.
- CI: GitHub Actions.

## Documentation

| Guide | Description |
|---|---|
| [Customer user guide](docs/customer-user-guide.md) | Customer onboarding and dashboard usage |
| [Deployment guide](docs/deployment-guide.md) | Production deployment preparation |
| [Operations guide](docs/operations-guide.md) | Service maintenance and troubleshooting |
| [Developer guide](docs/developer-guide.md) | Development and testing workflows |
| [Installation guide](docs/installation.md) | Local setup and configuration |
| [Database guide](docs/database.md) | Database schema and migrations |
| [System architecture](docs/architecture.md) | System design and technical decisions |
| [Technical reference](docs/technical-reference.md) | Detailed implementation and historical reference |
| [Customer API guide](docs/customer-api-guide.md) | API integration instructions |
| [Frontend guide](web/README.md) | Dashboard development |
| [Authentication security](docs/authentication-security.md) | Security and access controls |
| [Environment security](docs/environment-security.md) | Configuration and secrets |
| [Consumer operations](docs/consumer-operations.md) | Event processing and monitoring |
| [Production ingress](docs/production-ingress.md) | Deployment security requirements |
| [Security regression](docs/security-regression-summary.md) | Security validation |
| [Performance results](results/load-test-results.md) | Historical benchmarks |

## Verification

The Step 125 security regression passed:

| Test suite | Passed |
|---|---:|
| Unit tests | 318 |
| Integration tests | 59 |
| Browser tests | 114 |
| Total | 491 |

All three GitHub CI jobs passed at commit 642b1e2.

## Project Status

The application is implemented and locally validated.
Documentation and deployment preparation are ongoing.

The application has not been publicly deployed.
Live payment processing is not implemented.
