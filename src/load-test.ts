
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";

const BASE_URL = "http://localhost:3001";
const TOTAL_REQUESTS = 100;
const CONCURRENCY = 10;

type ApiResult = {
    status: number;
    data: any;
};

async function apiRequest(
    path: string,
    body: object,
    headers: Record<string, string> = {}
): Promise<ApiResult> {
    const response = await fetch(`${BASE_URL}${path}`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            ...headers
        },
        body: JSON.stringify(body)
    });

    return {
        status: response.status,
        data: await response.json()
    };
}

async function main() {
    const adminKey = process.env.ADMIN_API_KEY;

    if (!adminKey) {
        throw new Error("ADMIN_API_KEY is missing");
    }

    console.log("Starting performance test...");
    console.log(`Requests: ${TOTAL_REQUESTS}`);
    console.log(`Concurrency: ${CONCURRENCY}`);

    // Create a fresh account in the test database.
    const uniqueId = randomUUID();

    const account = await apiRequest(
        "/accounts",
        {
            name: `Load Test ${uniqueId}`,
            planId: 1
        },
        { "X-Admin-Key": adminKey }
    );

    if (account.status !== 201) {
        throw new Error(
            `Account creation failed: ${JSON.stringify(account.data)}`
        );
    }

    const apiKey = account.data.apiKey;
    const auth = { "X-API-Key": apiKey };

    // Create a custom user plan with 1000 monthly credits.
    const customPlan = await apiRequest(
        "/plans",
        {
            name: `Load User Plan ${uniqueId}`,
            planType: "user",
            monthlyLimit: 1000,
            maxPerRequest: 10
        },
        auth
    );

    if (customPlan.status !== 201) {
        throw new Error(
            `Plan creation failed: ${JSON.stringify(customPlan.data)}`
        );
    }

    const userId = `load-user-${uniqueId}`;

    const user = await apiRequest(
        "/users",
        {
            userId,
            planId: Number(customPlan.data.plan.id)
        },
        auth
    );

    if (user.status !== 201) {
        throw new Error(
            `User creation failed: ${JSON.stringify(user.data)}`
        );
    }

    // Starter account has 100 monthly credits.
    // Each request consumes exactly 1 credit.
    const durations: number[] = [];
    let accepted = 0;
    let rejected = 0;
    let errors = 0;

    const startTime = performance.now();

    // Process requests in batches of 10 concurrent requests.
    for (let i = 0; i < TOTAL_REQUESTS; i += CONCURRENCY) {
        const batch = Array.from(
            { length: Math.min(CONCURRENCY, TOTAL_REQUESTS - i) },
            async () => {
                const requestStart = performance.now();

                try {
                    const response = await apiRequest(
                        "/consume",
                        {
                            userId,
                            units: 1,
                            requestId: randomUUID()
                        },
                        auth
                    );

                    if (response.status !== 200) {
                        errors++;
                    } else if (response.data.accepted === true) {
                        accepted++;
                    } else {
                        rejected++;
                    }
                } catch {
                    errors++;
                } finally {
                    durations.push(performance.now() - requestStart);
                }
            }
        );

        await Promise.all(batch);
    }

    const totalSeconds = (performance.now() - startTime) / 1000;

    durations.sort((a, b) => a - b);

    function percentile(p: number): number {
        const index = Math.ceil((p / 100) * durations.length) - 1;
        return durations[Math.max(0, index)];
    }

    console.log("\n--- Performance Results ---");
    console.log(`Total requests: ${TOTAL_REQUESTS}`);
    console.log(`Accepted: ${accepted}`);
    console.log(`Rejected: ${rejected}`);
    console.log(`Errors: ${errors}`);
    console.log(`Duration: ${totalSeconds.toFixed(2)} seconds`);
    console.log(
        `Throughput: ${(TOTAL_REQUESTS / totalSeconds).toFixed(2)} requests/sec`
    );
    console.log(`Average latency: ${
        (durations.reduce((a, b) => a + b, 0) / durations.length).toFixed(2)
    } ms`);
    console.log(`P50 latency: ${percentile(50).toFixed(2)} ms`);
    console.log(`P95 latency: ${percentile(95).toFixed(2)} ms`);
    console.log(`P99 latency: ${percentile(99).toFixed(2)} ms`);

    if (accepted !== 100 || rejected !== 0 || errors !== 0) {
        throw new Error("Performance test failed its correctness checks");
    }

    console.log("\nPASS: All 100 requests were accepted.");
    console.log("PASS: Account quota was not exceeded.");
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
