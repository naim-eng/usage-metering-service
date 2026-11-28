#!/usr/bin/env bash

set -uo pipefail

cd "$(dirname "$0")/../.."

C=deploy/compose.production.yml
FAILURES=0

report() {
    if [ "$1" = "0" ]; then
        echo "PASS: $2"
    else
        echo "FAIL: $2"
        FAILURES=$((FAILURES + 1))
    fi
}

echo "=== CONTAINER HEALTH ==="

for SERVICE in db api consumer frontend proxy; do
    CID=$(docker compose -f "$C" ps -q "$SERVICE")

    HEALTH=$(docker inspect --format \
        '{{.State.Health.Status}}' "$CID" 2>/dev/null)

    test "$HEALTH" = "healthy"
    report "$?" "$SERVICE health"
done

echo "=== HTTPS AVAILABILITY ==="

for ENDPOINT in health ready plans; do
    curl -fsS --max-time 10 \
        --cacert deploy/certificates/ca.pem \
        --resolve api.metering.test:8443:127.0.0.1 \
        -o /dev/null \
        "https://api.metering.test:8443/$ENDPOINT"

    report "$?" "API /$ENDPOINT"
done

curl -fsS --max-time 10 \
    --cacert deploy/certificates/ca.pem \
    --resolve app.metering.test:8443:127.0.0.1 \
    -o /dev/null \
    https://app.metering.test:8443/sign-in

report "$?" "Frontend sign-in"

echo "=== CONSUMER HEARTBEAT ==="

docker compose -f "$C" exec -T consumer node -e '
const fs = require("fs");
const t = Number(fs.readFileSync("/tmp/metering-consumer-heartbeat", "utf8"));
const age = Date.now() - t;
console.log("Heartbeat age (ms):", age);
process.exit(Number.isFinite(t) && age >= 0 && age < 120000 ? 0 : 1);
'

report "$?" "Consumer heartbeat freshness"

echo "=== OUTBOX BACKLOG ==="

COUNTS=$(docker compose -f "$C" exec -T db \
    sh -c 'export PGPASSWORD="$DB_PASSWORD"; exec psql "$@"' sh \
    -w -X -v ON_ERROR_STOP=1 -U metering \
    -d usage_metering -At -F '|' -c "
    SELECT
        COUNT(*) FILTER (WHERE status = 'pending'),
        COUNT(*) FILTER (WHERE status = 'processing'),
        COUNT(*) FILTER (WHERE status = 'completed'),
        COUNT(*) FILTER (WHERE status = 'failed')
    FROM public.outbox_events;
")

if [ "$?" -eq 0 ]; then
    IFS='|' read -r PENDING PROCESSING COMPLETED FAILED <<< "$COUNTS"

    echo "Pending: $PENDING"
    echo "Processing: $PROCESSING"
    echo "Completed: $COMPLETED"
    echo "Failed: $FAILED"

    test "$FAILED" -eq 0
    report "$?" "No failed outbox events"
else
    report 1 "Outbox database query"
fi

echo "=== MONITORING SUMMARY ==="
echo "Detected failures: $FAILURES"

test "$FAILURES" -eq 0
