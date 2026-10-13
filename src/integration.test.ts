
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const BASE_URL = "http://localhost:3001";

async function request(
    method: string,
    path: string,
    body: object,
    headers: Record<string, string> = {}
) {
    const response = await fetch(`${BASE_URL}${path}`, {
        method,
        headers: {
            "Content-Type": "application/json",
            ...headers
        },
        body: JSON.stringify(body)
    });

    return {
        status: response.status,
        data: await response.json() as any
    };
}

async function post(
    path: string,
    body: object,
    headers: Record<string, string> = {}
) {
    return request("POST", path, body, headers);
}

test("Rejects consumption without an API key", async () => {
    const result = await post("/consume", {
        userId: "testuser",
        units: 1,
        requestId: randomUUID()
    });

    assert.equal(result.status, 401);
    assert.equal(result.data.error, "Missing or invalid API key");
});

test("Rejects consumption with an invalid API key", async () => {
    const result = await post(
        "/consume",
        {
            userId: "testuser",
            units: 1,
            requestId: randomUUID()
        },
        { "X-API-Key": "um_invalid_test_key" }
    );

    assert.equal(result.status, 401);
    assert.equal(result.data.error, "Invalid API key");
});

test("Prevents one account from accessing another account's user", async () => {
    const adminKey = process.env.ADMIN_API_KEY;
    assert.ok(adminKey, "ADMIN_API_KEY is required");

    const uniqueId = randomUUID();

    const accountA = await post(
        "/accounts",
        { name: `Test A ${uniqueId}`, planId: 1 },
        { "X-Admin-Key": adminKey }
    );

    const accountB = await post(
        "/accounts",
        { name: `Test B ${uniqueId}`, planId: 1 },
        { "X-Admin-Key": adminKey }
    );

    assert.equal(accountA.status, 201);
    assert.equal(accountB.status, 201);

    const userId = `user-${uniqueId}`;

    const user = await post(
        "/users",
        { userId, planId: 3 },
        { "X-API-Key": accountA.data.apiKey }
    );

    assert.equal(user.status, 201);

    const result = await post(
        "/consume",
        {
            userId,
            units: 1,
            requestId: randomUUID()
        },
        { "X-API-Key": accountB.data.apiKey }
    );

    assert.equal(result.status, 404);
    assert.equal(result.data.error, "User not found in account");
});

test("Rejects consumption when user monthly credits are exhausted", async () => {
    const adminKey = process.env.ADMIN_API_KEY;
    assert.ok(adminKey, "ADMIN_API_KEY is required");

    const uniqueId = randomUUID();

    const account = await post(
        "/accounts",
        { name: `Limit Test ${uniqueId}`, planId: 1 },
        { "X-Admin-Key": adminKey }
    );

    assert.equal(account.status, 201);

    const apiKey = account.data.apiKey;
    const userId = `limit-user-${uniqueId}`;

    const user = await post(
        "/users",
        { userId, planId: 3 },
        { "X-API-Key": apiKey }
    );

    assert.equal(user.status, 201);

    // Basic plan: 10 monthly credits, maximum 2 per request.
    for (let i = 0; i < 5; i++) {
        const result = await post(
            "/consume",
            {
                userId,
                units: 2,
                requestId: randomUUID()
            },
            { "X-API-Key": apiKey }
        );

        assert.equal(result.status, 200);
        assert.equal(result.data.accepted, true);
    }

    const rejected = await post(
        "/consume",
        {
            userId,
            units: 1,
            requestId: randomUUID()
        },
        { "X-API-Key": apiKey }
    );

    assert.equal(rejected.status, 200);
    assert.equal(rejected.data.accepted, false);
    assert.equal(rejected.data.scope, "user");
    assert.equal(rejected.data.rule, "monthly_limit");
    assert.equal(rejected.data.userRemaining, "0");
});

test("Does not double-charge repeated requests", async () => {
    const adminKey = process.env.ADMIN_API_KEY;
    assert.ok(adminKey, "ADMIN_API_KEY is required");

    const uniqueId = randomUUID();

    const account = await post(
        "/accounts",
        { name: `Idempotency Test ${uniqueId}`, planId: 1 },
        { "X-Admin-Key": adminKey }
    );

    assert.equal(account.status, 201);

    const apiKey = account.data.apiKey;
    const userId = `idempotency-user-${uniqueId}`;

    const user = await post(
        "/users",
        { userId, planId: 3 },
        { "X-API-Key": apiKey }
    );

    assert.equal(user.status, 201);

    // First request consumes 2 credits.
    const repeatedRequest = {
        userId,
        units: 2,
        requestId: randomUUID()
    };

    const first = await post(
        "/consume",
        repeatedRequest,
        { "X-API-Key": apiKey }
    );

    // Repeating the same request must not deduct more credits.
    const second = await post(
        "/consume",
        repeatedRequest,
        { "X-API-Key": apiKey }
    );

    assert.equal(first.status, 200);
    assert.equal(first.data.accepted, true);

    assert.equal(second.status, 200);
    assert.equal(second.data.accepted, true);
    assert.equal(second.data.replayed, true);

    // Consume 1 more credit to verify the actual balance.
    const third = await post(
        "/consume",
        {
            userId,
            units: 1,
            requestId: randomUUID()
        },
        { "X-API-Key": apiKey }
    );

    assert.equal(third.status, 200);
    assert.equal(third.data.accepted, true);

    // 10 - 2 - 0 - 1 = 7.
    assert.equal(third.data.userRemaining, "7");
});

test("Prevents concurrent requests from exceeding account quota", async () => {
    const adminKey = process.env.ADMIN_API_KEY;
    assert.ok(adminKey, "ADMIN_API_KEY is required");

    const uniqueId = randomUUID();

    // Step 1: Create a new account.
    const account = await post(
        "/accounts",
        { name: `Concurrency Test ${uniqueId}`, planId: 1 },
        { "X-Admin-Key": adminKey }
    );

    assert.equal(account.status, 201);

    const apiKey = account.data.apiKey;
    const auth = { "X-API-Key": apiKey };

    // Step 2: Create a custom plan with only 2 monthly credits.
    const customPlan = await post(
        "/plans",
        {
            name: `Two Credit Plan ${uniqueId}`,
            planType: "account",
            monthlyLimit: 2,
            maxPerRequest: 2
        },
        auth
    );

    assert.equal(customPlan.status, 201);

    // Step 3: Switch the account to the custom plan.
    // PostgreSQL may return an ID as a string.
    // Number() converts it into the integer expected by the API.
    const planId = Number(customPlan.data.plan.id);

    assert.ok(Number.isSafeInteger(planId) && planId > 0);

    const planSwitch = await request(
        "PATCH",
        "/accounts/plan",
        { planId },
        auth
    );

    assert.equal(
        planSwitch.status,
        200,
        `Plan switch failed: ${JSON.stringify(planSwitch.data)}`
    );

    // Step 4: Create a Basic user with 10 personal credits.
    const userId = `concurrent-user-${uniqueId}`;

    const user = await post(
        "/users",
        { userId, planId: 3 },
        auth
    );

    assert.equal(user.status, 201);

    // Step 5: Send two requests at the same time.
    // Each requests the entire remaining account balance.
    const [first, second] = await Promise.all([
        post(
            "/consume",
            { userId, units: 2, requestId: randomUUID() },
            auth
        ),
        post(
            "/consume",
            { userId, units: 2, requestId: randomUUID() },
            auth
        )
    ]);

    assert.equal(first.status, 200);
    assert.equal(second.status, 200);

    const results = [first.data, second.data];

    const accepted = results.filter(
        result => result.accepted === true
    );

    const rejected = results.filter(
        result => result.accepted === false
    );

    // Exactly one request must succeed.
    assert.equal(accepted.length, 1);
    assert.equal(rejected.length, 1);

    // The rejected request must identify the account quota.
    assert.equal(rejected[0].scope, "account");
    assert.equal(rejected[0].rule, "monthly_limit");

    // The accepted request consumed all 2 account credits.
    assert.equal(rejected[0].accountRemaining, "0");
});
