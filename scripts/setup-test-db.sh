
#!/usr/bin/env bash
set -euo pipefail

DB_SERVICE="db"
DB_USER="metering"
TEST_DB="usage_metering_test"

echo "Usage Metering Service - Test Database Setup"

# Make sure PostgreSQL is running.
if ! docker compose exec -T "$DB_SERVICE" \
    pg_isready -U "$DB_USER" -d postgres >/dev/null 2>&1; then
    echo "ERROR: PostgreSQL is not running."
    echo "Start it using: docker compose up -d db"
    exit 1
fi

# Check whether the test database exists.
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

# Check whether the five core application tables exist.
TABLE_COUNT=$(docker compose exec -T "$DB_SERVICE" \
    psql -U "$DB_USER" -d "$TEST_DB" -Atqc \
    "SELECT COUNT(*) FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_name IN
       ('plans', 'accounts', 'users', 'monthly_usage', 'usage_requests');")

if [[ "$TABLE_COUNT" == "0" ]]; then
    echo "Initializing database schema..."

    docker compose exec -T "$DB_SERVICE" \
        psql -v ON_ERROR_STOP=1 -U "$DB_USER" -d "$TEST_DB" \
        < sql/001_initial_schema.sql

    echo "Adding predefined plans..."

    docker compose exec -T "$DB_SERVICE" \
        psql -v ON_ERROR_STOP=1 -U "$DB_USER" -d "$TEST_DB" \
        < sql/002_seed_plans.sql

elif [[ "$TABLE_COUNT" == "5" ]]; then
    echo "All five core application tables already exist."

else
    echo "ERROR: Test database contains only $TABLE_COUNT of 5 expected tables."
    echo "Stopping to avoid overwriting existing data."
    exit 1
fi

# Always run the history migration after the core tables exist.
# Migration 003 is designed to be repeatable:
# it creates missing objects and avoids duplicate baseline events.
echo "Applying plan history migration..."

docker compose exec -T "$DB_SERVICE" \
    psql -v ON_ERROR_STOP=1 -U "$DB_USER" -d "$TEST_DB" \
    < sql/003_plan_history.sql

echo "Applying idempotency balances migration..."

docker compose exec -T "$DB_SERVICE" \
    psql -v ON_ERROR_STOP=1 -U "$DB_USER" -d "$TEST_DB" \
    < sql/004_idempotency_balances.sql


# Verify that the history table is available.
HISTORY_EXISTS=$(docker compose exec -T "$DB_SERVICE" \
    psql -U "$DB_USER" -d "$TEST_DB" -Atqc \
    "SELECT CASE
       WHEN to_regclass('public.plan_limit_history') IS NOT NULL
       THEN 1 ELSE 0
     END;")

if [[ "$HISTORY_EXISTS" != "1" ]]; then
    echo "ERROR: Plan history migration did not create the required table."
    exit 1
fi

echo ""
echo "Test database setup complete."
echo "Database: $TEST_DB"
echo "Plan history migration verified."
echo "Existing data has been preserved."
