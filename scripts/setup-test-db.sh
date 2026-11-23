
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


# Apply the low-credit notification migration to the test database only.
echo "Applying low-credit notifications migration..."

docker compose exec -T "$DB_SERVICE" \
    psql -v ON_ERROR_STOP=1 -U "$DB_USER" -d "$TEST_DB" \
    < sql/005_low_credit_notifications.sql

# Apply the event outbox migration to the test database only.
echo "Applying event outbox migration..."

docker compose exec -T "$DB_SERVICE" \
    psql -v ON_ERROR_STOP=1 -U "$DB_USER" -d "$TEST_DB" \
    < sql/006_event_outbox.sql



# Initialize Better Auth tables in a fresh test database.
echo "Checking Better Auth schema..."

AUTH_TABLE_COUNT=$(docker compose exec -T "$DB_SERVICE"     psql -X -v ON_ERROR_STOP=1 -U "$DB_USER" -d "$TEST_DB" -Atqc     "SELECT COUNT(*) FROM information_schema.tables
     WHERE table_schema = 'auth'
     AND table_name IN
     ('user', 'session', 'account', 'verification',
      'organization', 'member', 'invitation');")

if [[ "$AUTH_TABLE_COUNT" == "0" ]]; then
    echo "Initializing Better Auth schema..."
    docker compose exec -T "$DB_SERVICE"         psql -X -v ON_ERROR_STOP=1 -1         -U "$DB_USER" -d "$TEST_DB"         -f - < sql/007_customer_auth.sql
elif [[ "$AUTH_TABLE_COUNT" == "7" ]]; then
    echo "Better Auth schema already exists."
else
    echo "ERROR: Incomplete Better Auth schema."
    exit 1
fi

# Apply the projects migration only if the table is missing.
echo "Checking customer projects migration..."

PROJECTS_EXISTS=$(docker compose exec -T "$DB_SERVICE" psql -X -v ON_ERROR_STOP=1 -U "$DB_USER" -d "$TEST_DB" -Atqc "SELECT CASE WHEN to_regclass('public.projects') IS NOT NULL THEN 1 ELSE 0 END;")

if [[ "$PROJECTS_EXISTS" == "0" ]]; then
    AUTH_EXISTS=$(docker compose exec -T "$DB_SERVICE" psql -X -v ON_ERROR_STOP=1 -U "$DB_USER" -d "$TEST_DB" -Atqc "SELECT CASE WHEN to_regclass('auth.organization') IS NOT NULL THEN 1 ELSE 0 END;")

    if [[ "$AUTH_EXISTS" != "1" ]]; then
        echo "ERROR: auth.organization is missing from the test database."
        exit 1
    fi

    echo "Applying customer projects migration..."
    docker compose exec -T "$DB_SERVICE" psql -X -v ON_ERROR_STOP=1 -1 -U "$DB_USER" -d "$TEST_DB" -f - < sql/008_customer_projects.sql
else
    echo "Projects table already exists. Skipping migration 008."
fi

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
