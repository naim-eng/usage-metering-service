
# Performance Test Results

## Overview

This report documents load testing of the Usage Metering and Quota Service.

Two benchmark runs were completed to evaluate request processing under concurrent usage and verify that the quota service correctly records consumption in PostgreSQL.

Both runs completed with 100 accepted requests, zero rejected requests, and zero errors.

## Test Environment

| Component | Configuration |
|---|---|
| Operating system | Ubuntu on WSL2 |
| Backend | Node.js 20, TypeScript, Express 5 |
| Database | PostgreSQL 17 |
| Test database | `usage_metering_test` |
| Test API | `http://localhost:3001` |
| Load-test script | `src/load-test.ts` |

## Workload Configuration

The same workload was used for both benchmarks.

| Parameter | Value |
|---|---:|
| Total requests | 100 |
| Concurrent requests per batch | 10 |
| Credits per request | 1 |
| Account monthly limit | 100 |
| User monthly limit | 1,000 |
| User maximum per request | 10 |

The script creates a new account and a new user for each execution.

Each consumption request uses a unique request ID, ensuring that all 100 requests represent separate operations rather than idempotent retries.

Requests are submitted in batches of up to 10 simultaneous requests. Each batch completes before the next batch begins.

## Benchmark Results

| Metric | Run 1 | Run 2 |
|---|---:|---:|
| Total requests | 100 | 100 |
| Accepted | 100 | 100 |
| Rejected | 0 | 0 |
| Errors | 0 | 0 |
| Total duration | 1.49 s | 1.73 s |
| Throughput | 67.23 req/s | 57.78 req/s |
| Average latency | 91.40 ms | 107.58 ms |
| P50 latency | 89.12 ms | 105.54 ms |
| P95 latency | 155.27 ms | 179.59 ms |
| P99 latency | 200.26 ms | 215.65 ms |

### Observations

Both benchmark executions passed the script's correctness checks.

All 100 consumption requests were accepted, with no HTTP errors or quota rejections.

The second execution recorded lower throughput and higher latency than the first. Such variation may result from local machine load, database activity, and runtime scheduling.

These figures represent measurements from the local test environment, not guaranteed production performance.

## Database Verification

The results were checked against PostgreSQL to confirm that consumption was recorded correctly.

### Run 1

- Load-test account ID: `34`
- Recorded account consumption: `100` credits
- Account monthly limit: `100` credits
- Remaining account credits: `0`

### Run 2

- Load-test account ID: `346`
- Recorded account consumption: `100` credits
- Account monthly limit: `100` credits
- Remaining account credits: `0`

The second run was verified using a read-only SQL query against `usage_metering_test`.

This confirms that the database recorded exactly 100 consumed credits for the latest load-test account.

## Reproducing the Test

The commands below assume the repository has been cloned, dependencies are installed, and Docker Compose is available.

### 1. Start PostgreSQL

From the project root:

```bash
docker compose up -d db
```

The application database is exposed to the local development environment on port `5433`.

### 2. Prepare the test database

```bash
bash scripts/setup-test-db.sh
```

This creates or updates the separate `usage_metering_test` database and applies the required schema and migrations.

### 3. Start the isolated test API

In one terminal:

```bash
PORT=3001 DB_NAME=usage_metering_test node --import tsx src/index.ts
```

Ensure the project's environment variables are configured before starting the server.

The server should report:

```text
Server running on http://localhost:3001
```

### 4. Run the load test

In another terminal:

```bash
npx tsx src/load-test.ts
```

Expected correctness results:

```text
Total requests: 100
Accepted: 100
Rejected: 0
Errors: 0

PASS: All 100 requests were accepted.
PASS: Account quota was not exceeded.
```

Throughput and latency measurements may differ between executions.

### 5. Verify database consumption

Run the following read-only query:

```bash
docker compose exec -T db psql -U metering -d usage_metering_test -c "SELECT a.id, a.name, m.units_used FROM accounts a JOIN monthly_usage m ON m.account_id = a.id AND m.user_id IS NULL WHERE a.name LIKE 'Load Test %' ORDER BY a.id DESC LIMIT 1;"
```

The latest load-test account should show `units_used = 100`.

### 6. Stop the temporary API

Press `Ctrl + C` in the terminal running the API on port `3001`.

Do not delete the main PostgreSQL volume.

## Interpretation

These results demonstrate that the service successfully processed the tested concurrent workload while respecting the configured account quota.

The account's monthly limit was 100 credits, and exactly 100 credits were recorded after each successful run.

The benchmark does not establish the maximum throughput or capacity of the service.

## Limitations

- Testing was conducted on one local WSL2 environment.
- The workload consisted of 100 requests in batches of 10 concurrent operations.
- The test did not evaluate sustained multi-hour traffic.
- The benchmark used one account and one user per run.
- No distributed or multi-instance deployment was tested.
- Network latency and production infrastructure conditions were not simulated.
- Reported throughput and latency may vary across machines.

Additional testing would be required to establish production capacity and service-level objectives.
