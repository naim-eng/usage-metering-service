# Usage Metering Customer Dashboard

The customer-facing web application for the Usage Metering and Quota Service.

## Features

- Customer registration and sign-in.
- Email verification and password recovery.
- Organization workspace switching.
- Organization creation.
- Customer project creation and listing.
- Project usage and quota dashboards.
- Project API key management.
- Server-side authorization and backend API integration.

## Technology

- Next.js 16 and React 19.
- TypeScript and Tailwind CSS.
- Better Auth with PostgreSQL.
- Kysely and node-postgres.

## Local Development

Start the backend and PostgreSQL using the [installation guide](../docs/installation.md).

From the web directory, install dependencies:

    npm ci

Create the local environment configuration:

    cp -n .env.example .env.local

Configure the following environment variables:

| Variable | Purpose |
|---|---|
| DEPLOYMENT_ENV | Use local for local development |
| PRODUCTION_INGRESS_CONFIGURED | Production ingress confirmation |
| AUTH_DATABASE_URL | PostgreSQL connection to the migrated database |
| BETTER_AUTH_SECRET | Random authentication secret of at least 32 characters |
| BETTER_AUTH_URL | Frontend URL, normally http://localhost:3002 |
| METERING_API_URL | Backend URL, normally http://localhost:3000 |
| METERING_ADMIN_API_KEY | Must match the backend ADMIN_API_KEY |
| BETTER_AUTH_TRUSTED_ORIGINS | Optional additional trusted origins |

Configure SMTP using the local environment template.
For local email testing, use Mailpit as described in the
[installation guide](../docs/installation.md).

URL-encode special characters in database connection credentials.

Generate a strong authentication secret using:

    openssl rand -hex 32

Preserve existing environment files and credentials.

The authentication database must have the required SQL migrations applied.

Start the frontend:

    npm run dev -- --port 3002

Open http://localhost:3002 in your browser.

## Security

- Keep database credentials and administrative API keys server-side.
- Never commit .env.local or real credentials.
- Never expose administrative credentials through NEXT_PUBLIC_ variables.
- Customer authentication uses the PostgreSQL auth schema.

## Validation

Run linting:

    npm run lint

Check the application build:

    npm run build

Run browser end-to-end tests:

    npm run test:e2e -- --fail-on-flaky-tests

The E2E suite uses isolated database and email infrastructure.

## Related Documentation

- [Main project documentation](../README.md)
- [Customer API integration guide](../docs/customer-api-guide.md)
- [Event consumer operations](../docs/consumer-operations.md)

- [Customer user guide](../docs/customer-user-guide.md)
- [Developer and testing guide](../docs/developer-guide.md)
- [Authentication security](../docs/authentication-security.md)
