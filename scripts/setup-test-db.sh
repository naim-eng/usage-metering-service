#!/usr/bin/env bash
set -euo pipefail

DB_SERVICE="db"
DB_USER="metering"
TEST_DB="usage_metering_test"

echo "Usage Metering Service - Test Database Setup"

# Ensure PostgreSQL is running.
if ! docker compose exec -T "$DB_SERVICE" \
    pg_isready -U "$DB_USER" -d postgres >/dev/null 2>&1; then
    echo "ERROR: PostgreSQL is not running."
    echo "Start it using: docker compose up -d db"
    exit 1
fi

# Create the test database if it does not exist.
EXISTS=$(docker compose exec -T "$DB_SERVICE" \
    psql -U "$DB_USER" -d postgres -Atqc \
    "SELECT 1 FROM pg_database WHERE datname = '$TEST_DB';")

if [[ "$EXISTS" != "1" ]]; then
    echo "Creating test database..."

    docker compose exec -T "$DB_SERVICE" \
        createdb -U "$DB_USER" "$TEST_DB"
else
    echo "Test database already exists."
fi

# Apply pending migrations using the tracked migration runner.
# Existing databases without migration history are rejected safely.
echo "Checking database migrations..."

DB_NAME="$TEST_DB" npx tsx scripts/migrations/run.ts

# Verify the required plan history table exists.
HISTORY_EXISTS=$(docker compose exec -T "$DB_SERVICE" \
    psql -U "$DB_USER" -d "$TEST_DB" -Atqc \
    "SELECT CASE
       WHEN to_regclass('public.plan_limit_history') IS NOT NULL
       THEN 1 ELSE 0
     END;")

if [[ "$HISTORY_EXISTS" != "1" ]]; then
    echo "ERROR: Required plan history table is missing."
    exit 1
fi

echo ""
echo "Test database setup complete."
echo "Database: $TEST_DB"
echo "Migration history verified."
echo "Existing data has been preserved."
