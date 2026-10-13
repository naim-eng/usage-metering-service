
import "dotenv/config";

import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const BASE_URL = "http://localhost:3001";

async function request(
    method: string,
    path: string,
    body?: object,
    headers: Record<string, string> = {}
) {
    const response = await fetch(`${BASE_URL}${path}`, {
        method,
        headers: {
            "Content-Type": "application/json",
            ...headers
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) })
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

function getAdminKey(): string {
    const adminKey = process.env.ADMIN_API_KEY;
    assert.ok(adminKey, "ADMIN_API_KEY is required");
    return adminKey;
}

async function createTestAccount(name: string) {
    const result = await post(
        "/accounts",
        {
            name: `${name} ${randomUUID()}`,
            planId: 1
        },
        { "X-Admin-Key": getAdminKey() }
    );

    assert.equal(
        result.status,
        201,
        `Account creation failed: ${JSON.stringify(result.data)}`
    );

    return result.data;
}

async function createCustomPlan(
    apiKey: string,
    planType: "account" | "user",
    monthlyLimit: number,
    maxPerRequest: number
) {
    const result = await post(
        "/plans",
        {
            name: `Custom Plan ${randomUUID()}`,
            planType,
            monthlyLimit,
            maxPerRequest
        },
        { "X-API-Key": apiKey }
    );

    assert.equal(
        result.status,
        201,
        `Plan creation failed: ${JSON.stringify(result.data)}`
    );

    return result.data.plan;
}

function currentUtcMonth(): string {
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = String(now.getUTCMonth() + 1).padStart(2, "0");
    return `${year}-${month}`;
}

// TEST 1: Missing API key

test("Rejects consumption without an API key", async () => {
    const result = await post("/consume", {
        userId: "testuser",
        units: 1,
        requestId: randomUUID()
    });

    assert.equal(result.status, 401);
    assert.equal(result.data.error, "Missing or invalid API key");
});

// TEST 2: Invalid API key

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

// TEST 3: Account isolation

test("Prevents one account from accessing another account's user", async () => {
    const uniqueId = randomUUID();

    const accountA = await post(
        "/accounts",
        { name: `Test A ${uniqueId}`, planId: 1 },
        { "X-Admin-Key": getAdminKey() }
    );

    const accountB = await post(
        "/accounts",
        { name: `Test B ${uniqueId}`, planId: 1 },
        { "X-Admin-Key": getAdminKey() }
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

// TEST 4: Monthly user quota

test("Rejects consumption when user monthly credits are exhausted", async () => {
    const uniqueId = randomUUID();

    const account = await post(
        "/accounts",
        { name: `Limit Test ${uniqueId}`, planId: 1 },
        { "X-Admin-Key": getAdminKey() }
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

// TEST 5: Idempotency

test("Does not double-charge repeated requests", async () => {
    const uniqueId = randomUUID();

    const account = await post(
        "/accounts",
        { name: `Idempotency Test ${uniqueId}`, planId: 1 },
        { "X-Admin-Key": getAdminKey() }
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
    assert.equal(third.data.userRemaining, "7");
});

// TEST 6: Concurrency safety

test("Prevents concurrent requests from exceeding account quota", async () => {
    const uniqueId = randomUUID();

    const account = await post(
        "/accounts",
        { name: `Concurrency Test ${uniqueId}`, planId: 1 },
        { "X-Admin-Key": getAdminKey() }
    );

    assert.equal(account.status, 201);

    const apiKey = account.data.apiKey;
    const auth = { "X-API-Key": apiKey };

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

    const userId = `concurrent-user-${uniqueId}`;

    const user = await post(
        "/users",
        { userId, planId: 3 },
        auth
    );

    assert.equal(user.status, 201);

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

    assert.equal(accepted.length, 1);
    assert.equal(rejected.length, 1);
    assert.equal(rejected[0].scope, "account");
    assert.equal(rejected[0].rule, "monthly_limit");
    assert.equal(rejected[0].accountRemaining, "0");
});

// TEST 7: Updating a custom plan preserves usage

test("Updates an owned custom plan without resetting consumed credits", async () => {
    const account = await createTestAccount("Plan Update Test");
    const auth = { "X-API-Key": account.apiKey };

    const customPlan = await createCustomPlan(
        account.apiKey,
        "account",
        5,
        2
    );

    const planId = Number(customPlan.id);
    assert.ok(Number.isSafeInteger(planId) && planId > 0);

    const switched = await request(
        "PATCH",
        "/accounts/plan",
        { planId },
        auth
    );

    assert.equal(switched.status, 200);

    const userId = `update-user-${randomUUID()}`;

    const user = await post(
        "/users",
        { userId, planId: 3 },
        auth
    );

    assert.equal(user.status, 201);

    const firstConsumption = await post(
        "/consume",
        {
            userId,
            units: 2,
            requestId: randomUUID()
        },
        auth
    );

    assert.equal(firstConsumption.status, 200);
    assert.equal(firstConsumption.data.accepted, true);
    assert.equal(firstConsumption.data.accountRemaining, "3");

    const updated = await request(
        "PATCH",
        `/plans/${planId}`,
        {
            name: "Expanded Test Plan",
            monthlyLimit: 10,
            maxPerRequest: 3
        },
        auth
    );

    assert.equal(
        updated.status,
        200,
        `Plan update failed: ${JSON.stringify(updated.data)}`
    );

    assert.equal(updated.data.plan.name, "Expanded Test Plan");
    assert.equal(Number(updated.data.plan.monthly_limit), 10);
    assert.equal(Number(updated.data.plan.max_per_request), 3);

    // The Basic user still has a per-request maximum of 2.
    const secondConsumption = await post(
        "/consume",
        {
            userId,
            units: 2,
            requestId: randomUUID()
        },
        auth
    );

    assert.equal(secondConsumption.status, 200);
    assert.equal(
        secondConsumption.data.accepted,
        true,
        `Unexpected rejection: ${JSON.stringify(secondConsumption.data)}`
    );

    assert.equal(secondConsumption.data.accountRemaining, "6");
    assert.equal(secondConsumption.data.userRemaining, "6");
});

// TEST 8: Custom-plan ownership

test("Prevents an account from updating another account's custom plan", async () => {
    const owner = await createTestAccount("Plan Owner");
    const otherAccount = await createTestAccount("Other Account");

    const customPlan = await createCustomPlan(
        owner.apiKey,
        "account",
        20,
        5
    );

    const planId = Number(customPlan.id);

    const attemptedUpdate = await request(
        "PATCH",
        `/plans/${planId}`,
        { monthlyLimit: 999 },
        { "X-API-Key": otherAccount.apiKey }
    );

    assert.equal(attemptedUpdate.status, 404);

    const ownerUpdate = await request(
        "PATCH",
        `/plans/${planId}`,
        { monthlyLimit: 25 },
        { "X-API-Key": owner.apiKey }
    );

    assert.equal(ownerUpdate.status, 200);
    assert.equal(Number(ownerUpdate.data.plan.monthly_limit), 25);
});

// TEST 9: Predefined-plan protection

test("Prevents modification of predefined system plans", async () => {
    const account = await createTestAccount("System Plan Protection");

    const result = await request(
        "PATCH",
        "/plans/1",
        {
            name: "Modified Starter",
            monthlyLimit: 999999
        },
        { "X-API-Key": account.apiKey }
    );

    assert.equal(result.status, 404);
});

// TEST 10: Usage history includes accepted and rejected requests

test("Usage history records accepted and rejected requests", async () => {
    const account = await createTestAccount("History Test");
    const auth = { "X-API-Key": account.apiKey };
    const userId = `history-user-${randomUUID()}`;

    const user = await post(
        "/users",
        { userId, planId: 3 },
        auth
    );

    assert.equal(user.status, 201);

    const acceptedId = randomUUID();
    const rejectedId = randomUUID();

    const accepted = await post(
        "/consume",
        { userId, units: 2, requestId: acceptedId },
        auth
    );

    const rejected = await post(
        "/consume",
        { userId, units: 3, requestId: rejectedId },
        auth
    );

    assert.equal(accepted.status, 200);
    assert.equal(accepted.data.accepted, true);
    assert.equal(rejected.status, 200);
    assert.equal(rejected.data.accepted, false);
    assert.equal(rejected.data.scope, "user");
    assert.equal(rejected.data.rule, "max_per_request");

    const history = await request(
        "GET",
        "/usage/history?page=1&limit=10",
        undefined,
        auth
    );

    assert.equal(history.status, 200);
    assert.equal(history.data.page, 1);

    const acceptedRecord = history.data.history.find(
        (record: any) => record.request_id === acceptedId
    );

    const rejectedRecord = history.data.history.find(
        (record: any) => record.request_id === rejectedId
    );

    assert.ok(acceptedRecord, "Accepted request should appear in history");
    assert.ok(rejectedRecord, "Rejected request should appear in history");

    assert.equal(acceptedRecord.accepted, true);
    assert.equal(Number(acceptedRecord.units_requested), 2);

    assert.equal(rejectedRecord.accepted, false);
    assert.equal(rejectedRecord.rejection_scope, "user");
    assert.equal(rejectedRecord.rejection_rule, "max_per_request");
});

// TEST 11: Account isolation in usage history

test("Usage history does not expose another account's requests", async () => {
    const accountA = await createTestAccount("History Owner");
    const accountB = await createTestAccount("History Other");

    const userId = `private-user-${randomUUID()}`;
    const requestId = randomUUID();

    const user = await post(
        "/users",
        { userId, planId: 3 },
        { "X-API-Key": accountA.apiKey }
    );

    assert.equal(user.status, 201);

    const consumed = await post(
        "/consume",
        { userId, units: 1, requestId },
        { "X-API-Key": accountA.apiKey }
    );

    assert.equal(consumed.status, 200);
    assert.equal(consumed.data.accepted, true);

    const otherHistory = await request(
        "GET",
        "/usage/history",
        undefined,
        { "X-API-Key": accountB.apiKey }
    );

    assert.equal(otherHistory.status, 200);
    assert.equal(
        otherHistory.data.history.some(
            (record: any) => record.request_id === requestId
        ),
        false
    );

    const ownerHistory = await request(
        "GET",
        "/usage/history",
        undefined,
        { "X-API-Key": accountA.apiKey }
    );

    assert.equal(ownerHistory.status, 200);
    assert.equal(
        ownerHistory.data.history.some(
            (record: any) => record.request_id === requestId
        ),
        true
    );
});

// TEST 12: Monthly report totals and tenant isolation

test("Monthly reporting returns accurate account and user usage", async () => {
    const account = await createTestAccount("Monthly Report Test");
    const otherAccount = await createTestAccount("Monthly Report Other");

    const auth = { "X-API-Key": account.apiKey };
    const userA = `monthly-a-${randomUUID()}`;
    const userB = `monthly-b-${randomUUID()}`;

    const createdA = await post(
        "/users",
        { userId: userA, planId: 3 },
        auth
    );

    const createdB = await post(
        "/users",
        { userId: userB, planId: 3 },
        auth
    );

    assert.equal(createdA.status, 201);
    assert.equal(createdB.status, 201);

    for (const userId of [userA, userB]) {
        const result = await post(
            "/consume",
            {
                userId,
                units: 2,
                requestId: randomUUID()
            },
            auth
        );

        assert.equal(result.status, 200);
        assert.equal(result.data.accepted, true);
    }

    const month = currentUtcMonth();

    const report = await request(
        "GET",
        `/usage/monthly?month=${month}`,
        undefined,
        auth
    );

    assert.equal(report.status, 200);
    assert.equal(report.data.month, month);

    // Starter account limit: 100.
    // Two users have consumed 2 credits each.
    assert.equal(Number(report.data.account.monthly_limit), 100);
    assert.equal(Number(report.data.account.units_used), 4);

    const rowA = report.data.users.find(
        (row: any) => row.user_id === userA
    );

    const rowB = report.data.users.find(
        (row: any) => row.user_id === userB
    );

    assert.ok(rowA);
    assert.ok(rowB);
    assert.equal(Number(rowA.units_used), 2);
    assert.equal(Number(rowB.units_used), 2);

    // A different account must not see the first account's usage.
    const otherReport = await request(
        "GET",
        `/usage/monthly?month=${month}`,
        undefined,
        { "X-API-Key": otherAccount.apiKey }
    );

    assert.equal(otherReport.status, 200);
    assert.equal(Number(otherReport.data.account.units_used), 0);
    assert.equal(
        otherReport.data.users.some(
            (row: any) => row.user_id === userA || row.user_id === userB
        ),
        false
    );
});

// TEST 13: Invalid reporting parameters

test("Rejects invalid reporting parameters", async () => {
    const account = await createTestAccount("Reporting Validation");
    const auth = { "X-API-Key": account.apiKey };

    const invalidHistory = await request(
        "GET",
        "/usage/history?page=0&limit=50",
        undefined,
        auth
    );

    const excessiveLimit = await request(
        "GET",
        "/usage/history?page=1&limit=101",
        undefined,
        auth
    );

    const invalidMonth = await request(
        "GET",
        "/usage/monthly?month=2026-13",
        undefined,
        auth
    );

    assert.equal(invalidHistory.status, 400);
    assert.equal(excessiveLimit.status, 400);
    assert.equal(invalidMonth.status, 400);
});
