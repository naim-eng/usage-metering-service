
# Performance Test Results

## Test Configuration

- Application: Usage Metering and Quota Service
- Environment: Local development, WSL2 Ubuntu
- Backend: Node.js, TypeScript, Express
- Database: PostgreSQL
- Test database: usage_metering_test
- API port: 3001
- Total requests: 100
- Concurrent requests: 10
- Credits consumed per request: 1
- Account monthly limit: 100
- User monthly limit: 1000

## Measured Results

| Metric | Result |
|---|---:|
| Total requests | 100 |
| Accepted requests | 100 |
| Rejected requests | 0 |
| Errors | 0 |
| Total duration | 1.49 seconds |
| Throughput | 67.23 requests/second |
| Average latency | 91.40 ms |
| P50 latency | 89.12 ms |
| P95 latency | 155.27 ms |
| P99 latency | 200.26 ms |

## Observations

All 100 consumption requests were accepted successfully.

The test reported no HTTP errors or rejected consumption
requests.

The service achieved approximately 67 requests per second
under a workload of 10 concurrent requests.

The results provide a baseline for this local environment.
They do not establish the maximum throughput of the service.

## Reproduction

Start the PostgreSQL database and the test API server,
then run:

    npx tsx src/load-test.ts

The script creates a fresh test account and user and
measures 100 consumption requests.

The test API server must connect to usage_metering_test,
not the main application database.

## Limitations

- Only one load-test execution is reported.
- Results depend on the host machine and test environment.
- Database verification confirmed that load-test account
  ID 34 recorded exactly 100 consumed credits.
- The account's monthly limit was 100 credits, leaving
  0 credits remaining.
