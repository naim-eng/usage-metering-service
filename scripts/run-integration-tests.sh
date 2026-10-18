
#!/usr/bin/env bash
set -euo pipefail

# Move to the project's root directory.
cd "$(dirname "$0")/.."

TEST_PORT=3001
TEST_DB="usage_metering_test"

SERVER_PID=""
SERVER_LOG=""

# Always clean up the temporary server.
cleanup() {
    if [[ -n "$SERVER_PID" ]]; then
        echo "Stopping temporary test server..."

        kill "$SERVER_PID" 2>/dev/null || true
        wait "$SERVER_PID" 2>/dev/null || true
    fi

    if [[ -n "$SERVER_LOG" ]]; then
        rm -f "$SERVER_LOG"
    fi
}

trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

echo "Usage Metering Service - Integration Tests"

# Never connect to an already running server.
if (echo > /dev/tcp/127.0.0.1/"$TEST_PORT") 2>/dev/null; then
    echo "ERROR: Port $TEST_PORT is already in use."
    echo "Stop the existing test server before running this script."
    exit 1
fi

# Prepare only the isolated test database.
bash scripts/setup-test-db.sh

# Create a temporary server log.
SERVER_LOG=$(mktemp)

echo "Starting temporary test server..."

PORT="$TEST_PORT" \
DB_NAME="$TEST_DB" \
node --import tsx src/index.ts >"$SERVER_LOG" 2>&1 &

SERVER_PID=$!

# Wait for the backend to become ready.
READY=false

for i in {1..30}; do
    if ! kill -0 "$SERVER_PID" 2>/dev/null; then
        echo "ERROR: Test server exited unexpectedly."
        cat "$SERVER_LOG"
        exit 1
    fi

    if curl --silent --fail \
        "http://127.0.0.1:$TEST_PORT/health" >/dev/null; then
        READY=true
        break
    fi

    sleep 1
done

if [[ "$READY" != true ]]; then
    echo "ERROR: Test server did not start within 30 seconds."
    cat "$SERVER_LOG"
    exit 1
fi

echo "Test server is ready."
echo "Running integration tests..."

# Run the existing API integration tests and
# the monthly-reporting regression test.
# DB_NAME is explicitly restricted to the test database.
DB_NAME="$TEST_DB" npx tsx --test \
    src/integration.test.ts \
    src/monthly-report-regression.test.ts

echo ""
echo "Integration tests completed successfully."
