# Installation and Local Development

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

Configure the frontend environment using the instructions in [web/README.md](../web/README.md).

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

See the [consumer operations guide](consumer-operations.md)
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

## Environment Configuration

Use the root .env.example and web/.env.example templates.

For local development:

- Set DEPLOYMENT_ENV=local.
- Configure strong database and administrative credentials.
- Generate a unique BETTER_AUTH_SECRET.
- Match METERING_ADMIN_API_KEY to the backend ADMIN_API_KEY.
- Configure AUTH_DATABASE_URL for the local database.
- Keep production ingress settings disabled locally.
- Never commit populated environment files.

## Local Email Service

Start Mailpit from the repository root:

    docker compose -f docker-compose.mail.yml up -d

Configure the frontend environment:

    SMTP_HOST=127.0.0.1
    SMTP_PORT=1025
    SMTP_SECURE=false
    SMTP_FROM=no-reply@example.test

Leave SMTP_USER and SMTP_PASSWORD empty for local Mailpit.

Open http://localhost:8025 to inspect verification and
password recovery emails.

Production requires a properly configured SMTP provider.

## Further Configuration

- [Environment security](environment-security.md)
- [Authentication security](authentication-security.md)
- [Production ingress](production-ingress.md)
