
import "dotenv/config";

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { pool } from "./db.js";

// Never allow direct integration-test database access
// unless the isolated test database is selected.
if (process.env.DB_NAME !== "usage_metering_test") {
    throw new Error(
        "Integration tests must use usage_metering_test"
    );
}

// Close PostgreSQL connections after all tests complete.
after(async () => {
    await pool.end();
});

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
        ...(body === undefined
            ? {}
            : { body: JSON.stringify(body) })
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

// ------------------------------------------------------------
// TEST 1: Missing API key
// ------------------------------------------------------------

test("Rejects consumption without an API key", async () => {
    const result = await post("/consume", {
        userId: "testuser",
        units: 1,
        requestId: randomUUID()
    });

    assert.equal(result.status, 401);
    assert.equal(result.data.error, "Invalid API key");
});

// ------------------------------------------------------------
// TEST 2: Invalid API key
// ------------------------------------------------------------

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

// ------------------------------------------------------------
// TEST 3: Account isolation
// ------------------------------------------------------------

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

// ------------------------------------------------------------
// TEST 4: Monthly user quota
// ------------------------------------------------------------

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

    // Basic: 10 monthly credits, maximum 2 per request.
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

// ------------------------------------------------------------
// TEST 5: Idempotency
// ------------------------------------------------------------

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

// ------------------------------------------------------------
// TEST 6: Concurrency safety
// ------------------------------------------------------------

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

// ------------------------------------------------------------
// TEST 7: Updating a custom plan preserves usage
// ------------------------------------------------------------

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

// ------------------------------------------------------------
// TEST 8: Custom-plan ownership
// ------------------------------------------------------------

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

// ------------------------------------------------------------
// TEST 9: Predefined-plan protection
// ------------------------------------------------------------

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

// ------------------------------------------------------------
// TEST 10: Usage history
// ------------------------------------------------------------

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

    assert.ok(
        acceptedRecord,
        "Accepted request should appear in history"
    );

    assert.ok(
        rejectedRecord,
        "Rejected request should appear in history"
    );

    assert.equal(acceptedRecord.accepted, true);
    assert.equal(Number(acceptedRecord.units_requested), 2);
    assert.equal(rejectedRecord.accepted, false);
    assert.equal(rejectedRecord.rejection_scope, "user");
    assert.equal(rejectedRecord.rejection_rule, "max_per_request");
});

// ------------------------------------------------------------
// TEST 11: Usage-history isolation
// ------------------------------------------------------------

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

// ------------------------------------------------------------
// TEST 12: Monthly reporting
// ------------------------------------------------------------

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
            (row: any) =>
                row.user_id === userA ||
                row.user_id === userB
        ),
        false
    );
});

// ------------------------------------------------------------
// TEST 13: Reporting validation
// ------------------------------------------------------------

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

// ------------------------------------------------------------
// TEST 14: Account plan-switch history in PostgreSQL
// ------------------------------------------------------------

test("Records account plan switches in PostgreSQL history", async () => {
    // Create a fresh account on the Starter plan.
    const account = await createTestAccount("Plan History Test");

    const accountId = String(account.account.id);
    const auth = { "X-API-Key": account.apiKey };

    // Starter is plan 1. Pro is predefined account plan 2.
    const proPlanId = 2;

    // Verify the initial baseline exists.
    const baseline = await pool.query(
        `SELECT
            plan_id,
            plan_name,
            monthly_limit,
            max_per_request,
            change_type
         FROM plan_limit_history
         WHERE account_id = $1
           AND user_id IS NULL
           AND change_type = 'baseline'`,
        [accountId]
    );

    assert.equal(baseline.rowCount, 1);
    assert.equal(baseline.rows[0].plan_name, "Starter");
    assert.equal(Number(baseline.rows[0].monthly_limit), 100);
    assert.equal(Number(baseline.rows[0].max_per_request), 20);

    // Switch the account from Starter to Pro using the API.
    const switched = await request(
        "PATCH",
        "/accounts/plan",
        { planId: proPlanId },
        auth
    );

    assert.equal(
        switched.status,
        200,
        `Plan switch failed: ${JSON.stringify(switched.data)}`
    );

    // Verify the change was recorded in PostgreSQL.
    const history = await pool.query(
        `SELECT
            account_id,
            user_id,
            plan_id,
            plan_name,
            monthly_limit,
            max_per_request,
            change_type,
            effective_at
         FROM plan_limit_history
         WHERE account_id = $1
           AND user_id IS NULL
           AND change_type = 'account_plan_switch'
         ORDER BY id DESC`,
        [accountId]
    );

    assert.equal(history.rowCount, 1);

    const event = history.rows[0];

    assert.equal(String(event.account_id), accountId);
    assert.equal(event.user_id, null);
    assert.equal(Number(event.plan_id), proPlanId);
    assert.equal(event.plan_name, "Pro");
    assert.equal(Number(event.monthly_limit), 1000);
    assert.equal(Number(event.max_per_request), 100);
    assert.equal(event.change_type, "account_plan_switch");
    assert.ok(event.effective_at);

    // Selecting the same plan again should not create
    // another history event.
    const repeated = await request(
        "PATCH",
        "/accounts/plan",
        { planId: proPlanId },
        auth
    );

    assert.equal(repeated.status, 200);

    const count = await pool.query(
        `SELECT COUNT(*) AS total
         FROM plan_limit_history
         WHERE account_id = $1
           AND user_id IS NULL
           AND change_type = 'account_plan_switch'`,
        [accountId]
    );

    assert.equal(Number(count.rows[0].total), 1);

    // Verify the actual account assignment was updated.
    const assignedPlan = await pool.query(
        "SELECT plan_id FROM accounts WHERE id = $1",
        [accountId]
    );

    assert.equal(assignedPlan.rowCount, 1);
    assert.equal(Number(assignedPlan.rows[0].plan_id), proPlanId);
});

// ------------------------------------------------------------
// TEST 15: User plan-switch history in PostgreSQL
// ------------------------------------------------------------

test("Records user plan switches without resetting usage", async () => {
    // Create a fresh account on the Starter plan.
    const account = await createTestAccount("User Plan History Test");

    const accountId = String(account.account.id);
    const auth = { "X-API-Key": account.apiKey };
    const userId = `history-switch-user-${randomUUID()}`;

    // Create a Basic user: 10 credits/month, max 2/request.
    const created = await post(
        "/users",
        { userId, planId: 3 },
        auth
    );

    assert.equal(created.status, 201);

    const internalUserId = String(created.data.user.id);

    // Verify the user's initial quota snapshot.
    const baseline = await pool.query(
        `SELECT plan_id, plan_name, monthly_limit,
                max_per_request, change_type
         FROM plan_limit_history
         WHERE account_id = $1
           AND user_id = $2
           AND change_type = 'baseline'`,
        [accountId, internalUserId]
    );

    assert.equal(baseline.rowCount, 1);
    assert.equal(baseline.rows[0].plan_name, "Basic");
    assert.equal(Number(baseline.rows[0].monthly_limit), 10);
    assert.equal(Number(baseline.rows[0].max_per_request), 2);

    // Consume 2 credits before switching plans.
    const first = await post(
        "/consume",
        {
            userId,
            units: 2,
            requestId: randomUUID()
        },
        auth
    );

    assert.equal(first.status, 200);
    assert.equal(first.data.accepted, true);
    assert.equal(first.data.userRemaining, "8");

    // Switch from Basic (3) to Premium (4).
    const switched = await request(
        "PATCH",
        "/users/plan",
        { userId, planId: 4 },
        auth
    );

    assert.equal(
        switched.status,
        200,
        `User plan switch failed: ${JSON.stringify(switched.data)}`
    );

    // Verify the new quota limits were saved.
    const history = await pool.query(
        `SELECT plan_id, plan_name, monthly_limit,
                max_per_request, change_type, effective_at
         FROM plan_limit_history
         WHERE account_id = $1
           AND user_id = $2
           AND change_type = 'user_plan_switch'
         ORDER BY id DESC`,
        [accountId, internalUserId]
    );

    assert.equal(history.rowCount, 1);

    const event = history.rows[0];

    assert.equal(Number(event.plan_id), 4);
    assert.equal(event.plan_name, "Premium");
    assert.equal(Number(event.monthly_limit), 100);
    assert.equal(Number(event.max_per_request), 10);
    assert.equal(event.change_type, "user_plan_switch");
    assert.ok(event.effective_at);

    // Switching to the same plan again must not
    // generate another history event.
    const repeated = await request(
        "PATCH",
        "/users/plan",
        { userId, planId: 4 },
        auth
    );

    assert.equal(repeated.status, 200);

    const eventCount = await pool.query(
        `SELECT COUNT(*) AS total
         FROM plan_limit_history
         WHERE account_id = $1
           AND user_id = $2
           AND change_type = 'user_plan_switch'`,
        [accountId, internalUserId]
    );

    assert.equal(Number(eventCount.rows[0].total), 1);

    // Consume 1 additional credit after upgrading.
    // Premium has 100 monthly credits, and 2 were
    // already used before the upgrade.
    const second = await post(
        "/consume",
        {
            userId,
            units: 1,
            requestId: randomUUID()
        },
        auth
    );

    assert.equal(second.status, 200);
    assert.equal(second.data.accepted, true);

    // Premium: 100 - 2 - 1 = 97.
    assert.equal(second.data.userRemaining, "97");

    // Starter account: 100 - 2 - 1 = 97.
    assert.equal(second.data.accountRemaining, "97");

    // Verify the database still stores all 3 used credits.
    const usage = await pool.query(
        `SELECT units_used
         FROM monthly_usage
         WHERE account_id = $1
           AND user_id = $2
           AND month_start =
               DATE_TRUNC('month', NOW() AT TIME ZONE 'UTC')::date`,
        [accountId, internalUserId]
    );

    assert.equal(usage.rowCount, 1);
    assert.equal(Number(usage.rows[0].units_used), 3);
});

//
// TEST 16: Custom account-plan revision history
//

test("Records custom account-plan updates without duplicate events", async () => {
    const account = await createTestAccount("Account Revision History");
    const accountId = String(account.account.id);
    const auth = { "X-API-Key": account.apiKey };

    const plan = await createCustomPlan(
        account.apiKey,
        "account",
        5,
        2
    );

    const planId = Number(plan.id);

    const assigned = await request(
        "PATCH",
        "/accounts/plan",
        { planId },
        auth
    );

    assert.equal(assigned.status, 200);

    const userId = `account-revision-user-${randomUUID()}`;

    const created = await post(
        "/users",
        { userId, planId: 3 },
        auth
    );

    assert.equal(created.status, 201);

    const consumed = await post(
        "/consume",
        { userId, units: 2, requestId: randomUUID() },
        auth
    );

    assert.equal(consumed.status, 200);
    assert.equal(consumed.data.accepted, true);
    assert.equal(consumed.data.accountRemaining, "3");

    const updated = await request(
        "PATCH",
        `/plans/${planId}`,
        {
            name: "Revised Account Plan",
            monthlyLimit: 15,
            maxPerRequest: 5
        },
        auth
    );

    assert.equal(updated.status, 200);

    const history = await pool.query(
        `SELECT plan_name, monthly_limit, max_per_request
         FROM plan_limit_history
         WHERE account_id = $1
           AND user_id IS NULL
           AND plan_id = $2
           AND change_type = 'custom_plan_update'`,
        [accountId, planId]
    );

    assert.equal(history.rowCount, 1);
    assert.equal(history.rows[0].plan_name, "Revised Account Plan");
    assert.equal(Number(history.rows[0].monthly_limit), 15);
    assert.equal(Number(history.rows[0].max_per_request), 5);

    // Repeating an unchanged update must not add another event.
    const repeated = await request(
        "PATCH",
        `/plans/${planId}`,
        {
            name: "Revised Account Plan",
            monthlyLimit: 15,
            maxPerRequest: 5
        },
        auth
    );

    assert.equal(repeated.status, 200);

    const count = await pool.query(
        `SELECT COUNT(*) AS total
         FROM plan_limit_history
         WHERE account_id = $1
           AND user_id IS NULL
           AND plan_id = $2
           AND change_type = 'custom_plan_update'`,
        [accountId, planId]
    );

    assert.equal(Number(count.rows[0].total), 1);

    // Previously consumed credits must remain deducted.
    const afterUpdate = await post(
        "/consume",
        { userId, units: 2, requestId: randomUUID() },
        auth
    );

    assert.equal(afterUpdate.status, 200);
    assert.equal(afterUpdate.data.accepted, true);

    // Account: 15 - 2 - 2 = 11.
    assert.equal(afterUpdate.data.accountRemaining, "11");
});

//
// TEST 17: Custom user-plan revision history
//

test("Records custom user-plan updates for all assigned users", async () => {
    const account = await createTestAccount("User Revision History");
    const accountId = String(account.account.id);
    const auth = { "X-API-Key": account.apiKey };

    const plan = await createCustomPlan(
        account.apiKey,
        "user",
        5,
        2
    );

    const planId = Number(plan.id);
    const userIds = [
        `revision-a-${randomUUID()}`,
        `revision-b-${randomUUID()}`
    ];

    const internalIds: string[] = [];

    for (const userId of userIds) {
        const created = await post(
            "/users",
            { userId, planId },
            auth
        );

        assert.equal(created.status, 201);
        internalIds.push(String(created.data.user.id));
    }

    // Each user consumes credits on the original plan.
    for (const userId of userIds) {
        const consumed = await post(
            "/consume",
            { userId, units: 2, requestId: randomUUID() },
            auth
        );

        assert.equal(consumed.status, 200);
        assert.equal(consumed.data.accepted, true);
        assert.equal(consumed.data.userRemaining, "3");
    }

    const updated = await request(
        "PATCH",
        `/plans/${planId}`,
        {
            name: "Revised User Plan",
            monthlyLimit: 20,
            maxPerRequest: 5
        },
        auth
    );

    assert.equal(updated.status, 200);

    // Both assigned users must receive their own history event.
    const history = await pool.query(
        `SELECT user_id, plan_name,
                monthly_limit, max_per_request
         FROM plan_limit_history
         WHERE account_id = $1
           AND plan_id = $2
           AND change_type = 'custom_plan_update'
         ORDER BY user_id`,
        [accountId, planId]
    );

    assert.equal(history.rowCount, 2);

    const recordedIds = history.rows.map(
        row => String(row.user_id)
    );

    for (const internalId of internalIds) {
        assert.ok(recordedIds.includes(internalId));
    }

    for (const event of history.rows) {
        assert.equal(event.plan_name, "Revised User Plan");
        assert.equal(Number(event.monthly_limit), 20);
        assert.equal(Number(event.max_per_request), 5);
    }

    // Verify the original consumption remains recorded.
    const afterUpdate = await post(
        "/consume",
        {
            userId: userIds[0],
            units: 3,
            requestId: randomUUID()
        },
        auth
    );

    assert.equal(afterUpdate.status, 200);
    assert.equal(afterUpdate.data.accepted, true);

    // First user: 20 - 2 - 3 = 15.
    assert.equal(afterUpdate.data.userRemaining, "15");

    // Starter account: 100 - 2 - 2 - 3 = 93.
    assert.equal(afterUpdate.data.accountRemaining, "93");

    // An unchanged update must not create duplicate events.
    const repeated = await request(
        "PATCH",
        `/plans/${planId}`,
        {
            name: "Revised User Plan",
            monthlyLimit: 20,
            maxPerRequest: 5
        },
        auth
    );

    assert.equal(repeated.status, 200);

    const count = await pool.query(
        `SELECT COUNT(*) AS total
         FROM plan_limit_history
         WHERE account_id = $1
           AND plan_id = $2
           AND change_type = 'custom_plan_update'`,
        [accountId, planId]
    );

    assert.equal(Number(count.rows[0].total), 2);
});

//
// TEST 18: Monthly report after account plan switch
//

test("Monthly report tracks account plan switches", async () => {
    const account = await createTestAccount("Historical Account Report");
    const auth = { "X-API-Key": account.apiKey };
    const month = currentUtcMonth();

    const before = await request(
        "GET",
        `/usage/monthly?month=${month}`,
        undefined,
        auth
    );

    assert.equal(before.status, 200);
    assert.equal(Number(before.data.account.monthly_limit), 100);
    assert.equal(before.data.account.historical_limits_available, true);

    const switched = await request(
        "PATCH",
        "/accounts/plan",
        { planId: 2 },
        auth
    );

    assert.equal(switched.status, 200);

    const after = await request(
        "GET",
        `/usage/monthly?month=${month}`,
        undefined,
        auth
    );

    assert.equal(after.status, 200);
    assert.equal(after.data.account.plan_name, "Pro");
    assert.equal(Number(after.data.account.monthly_limit), 1000);

    const events = after.data.account.plan_changes;

    assert.ok(Array.isArray(events));
    assert.ok(
        events.some(
            (event: any) =>
                event.change_type === "account_plan_switch" &&
                Number(event.monthly_limit) === 1000
        )
    );
});

//
// TEST 19: Monthly report after user plan switch
//

test("Monthly report tracks user plan switches and preserves usage", async () => {
    const account = await createTestAccount("Historical User Report");
    const auth = { "X-API-Key": account.apiKey };
    const month = currentUtcMonth();
    const userId = `historical-report-${randomUUID()}`;

    const created = await post(
        "/users",
        { userId, planId: 3 },
        auth
    );

    assert.equal(created.status, 201);

    const consumed = await post(
        "/consume",
        {
            userId,
            units: 2,
            requestId: randomUUID()
        },
        auth
    );

    assert.equal(consumed.status, 200);
    assert.equal(consumed.data.accepted, true);

    const switched = await request(
        "PATCH",
        "/users/plan",
        { userId, planId: 4 },
        auth
    );

    assert.equal(switched.status, 200);

    const report = await request(
        "GET",
        `/usage/monthly?month=${month}`,
        undefined,
        auth
    );

    assert.equal(report.status, 200);

    const user = report.data.users.find(
        (row: any) => row.user_id === userId
    );

    assert.ok(user);
    assert.equal(user.plan_name, "Premium");
    assert.equal(Number(user.monthly_limit), 100);
    assert.equal(Number(user.units_used), 2);
    assert.equal(user.historical_limits_available, true);

    assert.ok(
        user.plan_changes.some(
            (event: any) =>
                event.change_type === "user_plan_switch" &&
                Number(event.monthly_limit) === 100
        )
    );
});

//
// TEST 20: Custom revisions and unknown historical limits
//

test("Monthly reports include custom revisions and do not invent older limits", async () => {
    const account = await createTestAccount("Historical Revision Report");
    const auth = { "X-API-Key": account.apiKey };
    const month = currentUtcMonth();

    const plan = await createCustomPlan(
        account.apiKey,
        "account",
        5,
        2
    );

    const planId = Number(plan.id);

    const assigned = await request(
        "PATCH",
        "/accounts/plan",
        { planId },
        auth
    );

    assert.equal(assigned.status, 200);

    const updated = await request(
        "PATCH",
        `/plans/${planId}`,
        {
            monthlyLimit: 15,
            maxPerRequest: 5
        },
        auth
    );

    assert.equal(updated.status, 200);

    const report = await request(
        "GET",
        `/usage/monthly?month=${month}`,
        undefined,
        auth
    );

    assert.equal(report.status, 200);
    assert.equal(Number(report.data.account.monthly_limit), 15);
    assert.equal(Number(report.data.account.max_per_request), 5);

    assert.ok(
        report.data.account.plan_changes.some(
            (event: any) =>
                event.change_type === "custom_plan_update" &&
                Number(event.monthly_limit) === 15
        )
    );

    // The account was created this month. Its historical
    // limits are unknown for the previous month.
    const [year, monthNumber] = month.split("-").map(Number);

    const previousMonth = new Date(
        Date.UTC(year, monthNumber - 2, 1)
    ).toISOString().slice(0, 7);

    const older = await request(
        "GET",
        `/usage/monthly?month=${previousMonth}`,
        undefined,
        auth
    );

    assert.equal(older.status, 200);
    assert.equal(older.data.account.historical_limits_available, false);
    assert.equal(older.data.account.plan_name, null);
    assert.equal(older.data.account.monthly_limit, null);
    assert.deepEqual(older.data.account.plan_changes, []);
});

//
// TEST 21: Idempotent retries preserve original balances
//

test("Idempotent retries preserve original balances and reject conflicts", async () => {
    const account = await createTestAccount("Idempotency Balance Test");
    const auth = { "X-API-Key": account.apiKey };

    const userId = `retry-balances-${randomUUID()}`;

    const created = await post(
        "/users",
        { userId, planId: 3 },
        auth
    );

    assert.equal(created.status, 201);

    // First request consumes 2 credits.
    const requestId = randomUUID();

    const original = await post(
        "/consume",
        { userId, units: 2, requestId },
        auth
    );

    assert.equal(original.status, 200);
    assert.equal(original.data.accepted, true);
    assert.equal(original.data.replayed, false);
    assert.equal(original.data.accountRemaining, "98");
    assert.equal(original.data.userRemaining, "8");

    // Another request consumes more credits.
    const second = await post(
        "/consume",
        {
            userId,
            units: 2,
            requestId: randomUUID()
        },
        auth
    );

    assert.equal(second.status, 200);
    assert.equal(second.data.accountRemaining, "96");
    assert.equal(second.data.userRemaining, "6");

    // The replay must return the FIRST request's balances.
    const replay = await post(
        "/consume",
        { userId, units: 2, requestId },
        auth
    );

    assert.equal(replay.status, 200);
    assert.equal(replay.data.accepted, true);
    assert.equal(replay.data.replayed, true);
    assert.equal(replay.data.accountRemaining, "98");
    assert.equal(replay.data.userRemaining, "8");

    // Reusing the ID with different units must be rejected.
    const conflict = await post(
        "/consume",
        { userId, units: 1, requestId },
        auth
    );

    assert.equal(conflict.status, 409);

    // This exceeds the Basic plan's per-request limit.
    // Rejected requests must also preserve balances.
    const rejectedId = randomUUID();

    const rejected = await post(
        "/consume",
        {
            userId,
            units: 7,
            requestId: rejectedId
        },
        auth
    );

    assert.equal(rejected.status, 200);
    assert.equal(rejected.data.accepted, false);
    assert.equal(rejected.data.userRemaining, "6");
    assert.equal(rejected.data.accountRemaining, "96");

    const rejectedReplay = await post(
        "/consume",
        {
            userId,
            units: 7,
            requestId: rejectedId
        },
        auth
    );

    assert.equal(rejectedReplay.status, 200);
    assert.equal(rejectedReplay.data.accepted, false);
    assert.equal(rejectedReplay.data.replayed, true);
    assert.equal(rejectedReplay.data.userRemaining, "6");
    assert.equal(rejectedReplay.data.accountRemaining, "96");

    // Confirm that only two requests consumed credits.
    const usage = await pool.query(
        `SELECT units_used
         FROM monthly_usage
         WHERE account_id = $1
           AND user_id IS NULL
           AND month_start = $2::date`,
        [account.account.id, `${currentUtcMonth()}-01`]
    );

    assert.equal(Number(usage.rows[0].units_used), 4);
});

//
// TEST 22: Account allowance inspection
//

test("Account inspection returns current plan and remaining credits", async () => {
    const account = await createTestAccount("Allowance Account Test");
    const auth = { "X-API-Key": account.apiKey };

    const userId = `allowance-account-${randomUUID()}`;

    const created = await post(
        "/users",
        { userId, planId: 3 },
        auth
    );

    assert.equal(created.status, 201);

    const initial = await request(
        "GET",
        "/account",
        undefined,
        auth
    );

    assert.equal(initial.status, 200);
    assert.equal(initial.data.account.plan_name, "Starter");
    assert.equal(Number(initial.data.account.monthly_limit), 100);
    assert.equal(Number(initial.data.account.units_used), 0);
    assert.equal(Number(initial.data.account.units_remaining), 100);

    const consumed = await post(
        "/consume",
        {
            userId,
            units: 2,
            requestId: randomUUID()
        },
        auth
    );

    assert.equal(consumed.status, 200);
    assert.equal(consumed.data.accepted, true);

    const updated = await request(
        "GET",
        "/account",
        undefined,
        auth
    );

    assert.equal(updated.status, 200);
    assert.equal(Number(updated.data.account.units_used), 2);
    assert.equal(Number(updated.data.account.units_remaining), 98);

    const unauthorized = await request(
        "GET",
        "/account"
    );

    assert.equal(unauthorized.status, 401);
});

//
// TEST 23: User allowance inspection and isolation
//

test("User inspection returns individual plans and account-isolated usage", async () => {
    const account = await createTestAccount("Allowance Users Test");
    const otherAccount = await createTestAccount("Allowance Users Other");

    const auth = { "X-API-Key": account.apiKey };

    const basicUser = `basic-allowance-${randomUUID()}`;
    const premiumUser = `premium-allowance-${randomUUID()}`;

    for (const [userId, planId] of [
        [basicUser, 3],
        [premiumUser, 4]
    ] as const) {
        const created = await post(
            "/users",
            { userId, planId },
            auth
        );

        assert.equal(created.status, 201);
    }

    const consumed = await post(
        "/consume",
        {
            userId: basicUser,
            units: 2,
            requestId: randomUUID()
        },
        auth
    );

    assert.equal(consumed.status, 200);
    assert.equal(consumed.data.accepted, true);

    const result = await request(
        "GET",
        "/users",
        undefined,
        auth
    );

    assert.equal(result.status, 200);

    const basic = result.data.users.find(
        (row: any) => row.user_id === basicUser
    );

    const premium = result.data.users.find(
        (row: any) => row.user_id === premiumUser
    );

    assert.ok(basic);
    assert.ok(premium);

    assert.equal(basic.plan_name, "Basic");
    assert.equal(Number(basic.monthly_limit), 10);
    assert.equal(Number(basic.units_used), 2);
    assert.equal(Number(basic.units_remaining), 8);

    assert.equal(premium.plan_name, "Premium");
    assert.equal(Number(premium.monthly_limit), 100);
    assert.equal(Number(premium.units_used), 0);
    assert.equal(Number(premium.units_remaining), 100);

    const otherResult = await request(
        "GET",
        "/users",
        undefined,
        { "X-API-Key": otherAccount.apiKey }
    );

    assert.equal(otherResult.status, 200);
    assert.equal(
        otherResult.data.users.some(
            (row: any) =>
                row.user_id === basicUser ||
                row.user_id === premiumUser
        ),
        false
    );

    const unauthorized = await request("GET", "/users");

    assert.equal(unauthorized.status, 401);
});

//
// TEST 24: Custom plan listing and ownership
//

test("Custom plan listing returns only plans owned by the account", async () => {
    const account = await createTestAccount("Custom Listing Test");
    const otherAccount = await createTestAccount("Custom Listing Other");

    const auth = { "X-API-Key": account.apiKey };

    const accountPlan = await createCustomPlan(
        account.apiKey,
        "account",
        25,
        5
    );

    const userPlan = await createCustomPlan(
        account.apiKey,
        "user",
        40,
        8
    );

    const otherPlan = await createCustomPlan(
        otherAccount.apiKey,
        "account",
        50,
        10
    );

    const result = await request(
        "GET",
        "/plans/custom",
        undefined,
        auth
    );

    assert.equal(result.status, 200);
    assert.equal(result.data.plans.length, 2);

    const ids = result.data.plans.map(
        (plan: any) => String(plan.id)
    );

    assert.ok(ids.includes(String(accountPlan.id)));
    assert.ok(ids.includes(String(userPlan.id)));
    assert.equal(ids.includes(String(otherPlan.id)), false);

    const otherResult = await request(
        "GET",
        "/plans/custom",
        undefined,
        { "X-API-Key": otherAccount.apiKey }
    );

    assert.equal(otherResult.status, 200);
    assert.equal(otherResult.data.plans.length, 1);
    assert.equal(
        String(otherResult.data.plans[0].id),
        String(otherPlan.id)
    );

    const unauthorized = await request(
        "GET",
        "/plans/custom"
    );

    assert.equal(unauthorized.status, 401);
});

// PROJECT API: Administrator authentication.
test("Project creation rejects unauthorized requests without writing records", async () => {
    const organizationId = randomUUID();
    const name = `Unauthorized Project ${randomUUID()}`;

    const body = {
        organizationId,
        name,
        slug: `unauthorized-${randomUUID()}`,
        planId: 1
    };

    const missingKey = await post("/projects", body);

    assert.equal(missingKey.status, 401);
    assert.equal(missingKey.data.error, "Unauthorized");

    const invalidKey = await post(
        "/projects",
        body,
        { "X-Admin-Key": `invalid-${randomUUID()}` }
    );

    assert.equal(invalidKey.status, 401);
    assert.equal(invalidKey.data.error, "Unauthorized");

    const accounts = await pool.query(
        "SELECT COUNT(*)::int AS total FROM accounts WHERE name = $1",
        [name]
    );

    const projects = await pool.query(
        "SELECT COUNT(*)::int AS total FROM projects WHERE organization_id = $1",
        [organizationId]
    );

    assert.equal(accounts.rows[0]?.total, 0);
    assert.equal(projects.rows[0]?.total, 0);
});

// PROJECT API: Successful provisioning through HTTP.
test("Project API provisions an account and quota history", async () => {
    const organizationId = randomUUID();
    const name = `HTTP Project ${organizationId}`;

    await pool.query(
        `INSERT INTO auth.organization
         (id, name, slug, "createdAt")
         VALUES ($1, $2, $3, NOW())`,
        [organizationId, "HTTP Project Test", organizationId]
    );

    try {
        const result = await post(
            "/projects",
            {
                organizationId,
                name,
                slug: "http-project",
                planId: 1
            },
            { "X-Admin-Key": getAdminKey() }
        );

        assert.equal(result.status, 201);
        assert.equal(result.data.project.organizationId, organizationId);
        assert.equal(result.data.project.status, "active");
        assert.match(result.data.apiKey, /^um_[a-f0-9]{64}$/);

        const records = await pool.query(
            `SELECT
                 p.id,
                 a.plan_id,
                 h.monthly_limit,
                 h.max_per_request
             FROM projects p
             JOIN accounts a
               ON a.id = p.metering_account_id
             JOIN plan_limit_history h
               ON h.account_id = a.id
             WHERE p.organization_id = $1
               AND h.change_type = 'baseline'`,
            [organizationId]
        );

        assert.equal(records.rows.length, 1);
        assert.equal(String(records.rows[0].plan_id), "1");
        assert.equal(String(records.rows[0].monthly_limit), "100");
        assert.equal(String(records.rows[0].max_per_request), "20");
    } finally {
        await pool.query(
            `DELETE FROM project_api_keys
             WHERE project_id IN (
                 SELECT id FROM projects
                 WHERE organization_id = $1
             )`,
            [organizationId]
        );

        const deleted = await pool.query(
            `DELETE FROM projects
             WHERE organization_id = $1
             RETURNING metering_account_id`,
            [organizationId]
        );

        for (const row of deleted.rows) {
            await pool.query(
                "DELETE FROM plan_limit_history WHERE account_id = $1",
                [row.metering_account_id]
            );

            await pool.query(
                "DELETE FROM accounts WHERE id = $1",
                [row.metering_account_id]
            );
        }

        await pool.query(
            "DELETE FROM auth.organization WHERE id = $1",
            [organizationId]
        );
    }
});

// PROJECT API: Test helpers.
async function createProjectTestOrganization(name: string) {
    const id = randomUUID();

    await pool.query(
        `INSERT INTO auth.organization
         (id, name, slug, "createdAt")
         VALUES ($1, $2, $3, NOW())`,
        [id, name, id]
    );

    return id;
}

async function createProjectForTest(organizationId: string, name: string) {
    const result = await post(
        "/projects",
        {
            organizationId,
            name,
            slug: `project-${randomUUID()}`,
            planId: 1
        },
        { "X-Admin-Key": getAdminKey() }
    );

    assert.equal(
        result.status,
        201,
        `Project creation failed: ${JSON.stringify(result.data)}`
    );

    return result.data;
}

async function cleanupProjectTestOrganization(organizationId: string) {
    await pool.query(
        `DELETE FROM project_api_keys
         WHERE project_id IN (
             SELECT id FROM projects
             WHERE organization_id = $1
         )`,
        [organizationId]
    );

    const deleted = await pool.query(
        `DELETE FROM projects
         WHERE organization_id = $1
         RETURNING metering_account_id`,
        [organizationId]
    );

    for (const row of deleted.rows) {
        if (row.metering_account_id !== null) {
            await pool.query(
                "DELETE FROM plan_limit_history WHERE account_id = $1",
                [row.metering_account_id]
            );

            await pool.query(
                "DELETE FROM accounts WHERE id = $1",
                [row.metering_account_id]
            );
        }
    }

    await pool.query(
        "DELETE FROM auth.organization WHERE id = $1",
        [organizationId]
    );
}

// PROJECT API: Listing authentication.
test("Project listing rejects unauthorized requests", async () => {
    const organizationId = randomUUID();
    const path = `/projects?organizationId=${encodeURIComponent(organizationId)}`;

    const missingKey = await request("GET", path);

    assert.equal(missingKey.status, 401);
    assert.equal(missingKey.data.error, "Unauthorized");

    const invalidKey = await request(
        "GET",
        path,
        undefined,
        { "X-Admin-Key": `invalid-${randomUUID()}` }
    );

    assert.equal(invalidKey.status, 401);
});

// PROJECT API: Organization isolation.
test("Project listing only returns projects belonging to the requested organization", async () => {
    const organizationA = await createProjectTestOrganization(
        "Project Listing Organization A"
    );

    const organizationB = await createProjectTestOrganization(
        "Project Listing Organization B"
    );

    try {
        const projectA = await createProjectForTest(
            organizationA,
            "Organization A Project"
        );

        const projectB = await createProjectForTest(
            organizationB,
            "Organization B Project"
        );

        const resultA = await request(
            "GET",
            `/projects?organizationId=${encodeURIComponent(organizationA)}`,
            undefined,
            { "X-Admin-Key": getAdminKey() }
        );

        const resultB = await request(
            "GET",
            `/projects?organizationId=${encodeURIComponent(organizationB)}`,
            undefined,
            { "X-Admin-Key": getAdminKey() }
        );

        assert.equal(resultA.status, 200);
        assert.equal(resultB.status, 200);

        assert.equal(resultA.data.projects.length, 1);
        assert.equal(resultB.data.projects.length, 1);

        assert.equal(resultA.data.projects[0].id, projectA.project.id);
        assert.equal(resultB.data.projects[0].id, projectB.project.id);

        assert.equal(
            resultA.data.projects[0].organizationId,
            organizationA
        );

        assert.equal(
            resultB.data.projects[0].organizationId,
            organizationB
        );
    } finally {
        await cleanupProjectTestOrganization(organizationA);
        await cleanupProjectTestOrganization(organizationB);
    }
});

// PROJECT API: Sensitive information protection.
test("Project listing never exposes API keys or account credentials", async () => {
    const organizationId = await createProjectTestOrganization(
        "Project Security Test"
    );

    try {
        const created = await createProjectForTest(
            organizationId,
            "Secure Listing Project"
        );

        const credentials = await pool.query(
            `SELECT a.api_key_hash
             FROM projects p
             JOIN accounts a
               ON a.id = p.metering_account_id
             WHERE p.id = $1`,
            [created.project.id]
        );

        assert.equal(credentials.rows.length, 1);

        const result = await request(
            "GET",
            `/projects?organizationId=${encodeURIComponent(organizationId)}`,
            undefined,
            { "X-Admin-Key": getAdminKey() }
        );

        assert.equal(result.status, 200);
        assert.equal(result.data.projects.length, 1);

        const listedProject = result.data.projects[0];

        assert.deepEqual(
            Object.keys(listedProject).sort(),
            [
                "id",
                "organizationId",
                "name",
                "slug",
                "status",
                "createdAt"
            ].sort()
        );

        const serialized = JSON.stringify(listedProject);

        assert.ok(!serialized.includes(created.apiKey));
        assert.ok(!serialized.includes(credentials.rows[0].api_key_hash));
    } finally {
        await cleanupProjectTestOrganization(organizationId);
    }
});



// PROJECT DASHBOARD API TESTS

test("Project dashboard rejects missing and invalid administrator keys", async () => {
    const projectId = randomUUID();
    const organizationId = randomUUID();

    const path = `/projects/${projectId}/dashboard?organizationId=${organizationId}`;

    const missingKey = await request("GET", path);

    assert.equal(missingKey.status, 401);
    assert.equal(missingKey.data.error, "Unauthorized");

    const invalidKey = await request(
        "GET",
        path,
        undefined,
        { "X-Admin-Key": `invalid-${randomUUID()}` }
    );

    assert.equal(invalidKey.status, 401);
    assert.equal(invalidKey.data.error, "Unauthorized");
});

test("Project dashboard rejects invalid month parameters", async () => {
    const result = await request(
        "GET",
        `/projects/${randomUUID()}/dashboard?organizationId=${randomUUID()}&month=2026-13`,
        undefined,
        { "X-Admin-Key": getAdminKey() }
    );

    assert.equal(result.status, 400);
    assert.equal(result.data.error, "Month must be in YYYY-MM format");
});

test("Project dashboard returns real isolated usage data without exposing credentials", async () => {
    const organizationId = await createProjectTestOrganization(
        "Dashboard Integration Test"
    );

    let accountId: string | undefined;
    let projectId: string | undefined;

    try {
        const created = await createProjectForTest(
            organizationId,
            "Dashboard Test Project"
        );

        const createdProjectId = created.project.id;
        projectId = createdProjectId;

        const apiKey = created.apiKey;
        assert.ok(apiKey);

        const userId = `dashboard-user-${randomUUID()}`;

        const user = await post(
            "/users",
            { userId, planId: 3 },
            { "X-API-Key": apiKey }
        );

        assert.equal(
            user.status,
            201,
            `User creation failed: ${JSON.stringify(user.data)}`
        );

        const requestId = randomUUID();

        const consumption = await post(
            "/consume",
            {
                userId,
                units: 2,
                requestId
            },
            { "X-API-Key": apiKey }
        );

        assert.equal(consumption.status, 200);
        assert.equal(consumption.data.accepted, true);

        const result = await request(
            "GET",
            `/projects/${encodeURIComponent(createdProjectId)}/dashboard?organizationId=${encodeURIComponent(organizationId)}&month=${currentUtcMonth()}`,
            undefined,
            { "X-Admin-Key": getAdminKey() }
        );

        assert.equal(
            result.status,
            200,
            `Dashboard retrieval failed: ${JSON.stringify(result.data)}`
        );

        assert.equal(result.data.project.id, projectId);
        assert.equal(result.data.project.organizationId, organizationId);
        assert.equal(result.data.project.name, "Dashboard Test Project");

        assert.ok(result.data.account, "Account data is missing");
        assert.ok(result.data.users, "User allowance data is missing");
        assert.ok(result.data.monthlyReport, "Monthly report is missing");
        assert.ok(result.data.usageHistory, "Usage history is missing");
        assert.ok(result.data.notifications, "Notifications are missing");

        // Verify that the dashboard's account has the expected actual usage.
        const account = await pool.query(
            "SELECT metering_account_id FROM projects WHERE id = $1",
            [projectId]
        );

        assert.equal(account.rows.length, 1);

        accountId = String(account.rows[0].metering_account_id);

        const usage = await pool.query(
            `SELECT mu.units_used::text AS units_used
             FROM monthly_usage mu
             JOIN users u ON u.id = mu.user_id
             WHERE mu.account_id = $1
               AND u.external_user_id = $2
             ORDER BY mu.month_start DESC
             LIMIT 1`,
            [accountId, userId]
        );

        assert.equal(usage.rows.length, 1);
        assert.equal(usage.rows[0].units_used, "2");

        // Verify that API credentials never appear in the dashboard response.
        const credentials = await pool.query(
            `SELECT a.api_key_hash
             FROM projects p
             JOIN accounts a ON a.id = p.metering_account_id
             WHERE p.id = $1`,
            [projectId]
        );

        assert.equal(credentials.rows.length, 1);

        const serialized = JSON.stringify(result.data);

        assert.ok(!serialized.includes(apiKey));
        assert.ok(!serialized.includes(credentials.rows[0].api_key_hash));

        assert.ok(!serialized.includes("api_key_hash"));
    } finally {
        // Remove dependent records before deleting the test account.
        if (accountId) {
            await pool.query(
                "DELETE FROM usage_requests WHERE account_id = $1",
                [accountId]
            );

            await pool.query(
                "DELETE FROM low_credit_notifications WHERE account_id = $1",
                [accountId]
            );

            await pool.query(
                "DELETE FROM monthly_usage WHERE account_id = $1",
                [accountId]
            );

            await pool.query(
                "DELETE FROM plan_limit_history WHERE account_id = $1",
                [accountId]
            );

            await pool.query(
                "DELETE FROM users WHERE account_id = $1",
                [accountId]
            );
        }

        await cleanupProjectTestOrganization(organizationId);
    }
});

test("Project dashboard prevents cross-organization project access", async () => {
    const organizationA = await createProjectTestOrganization(
        "Dashboard Organization A"
    );

    const organizationB = await createProjectTestOrganization(
        "Dashboard Organization B"
    );

    try {
        const projectB = await createProjectForTest(
            organizationB,
            "Organization B Private Project"
        );

        const result = await request(
            "GET",
            `/projects/${encodeURIComponent(projectB.project.id)}/dashboard?organizationId=${encodeURIComponent(organizationA)}`,
            undefined,
            { "X-Admin-Key": getAdminKey() }
        );

        assert.equal(result.status, 404);
        assert.equal(result.data.error, "Project not found");
    } finally {
        await cleanupProjectTestOrganization(organizationA);
        await cleanupProjectTestOrganization(organizationB);
    }
});

test("Project dashboard rejects projects without a metering account", async () => {
    const organizationId = await createProjectTestOrganization(
        "Dashboard Pending Project Test"
    );

    try {
        const projectId = randomUUID();

        await pool.query(
            `INSERT INTO projects
                (id, organization_id, name, slug, status)
             VALUES ($1, $2, $3, $4, 'pending')`,
            [
                projectId,
                organizationId,
                "Pending Dashboard Project",
                `pending-${randomUUID()}`
            ]
        );

        const result = await request(
            "GET",
            `/projects/${encodeURIComponent(projectId)}/dashboard?organizationId=${encodeURIComponent(organizationId)}`,
            undefined,
            { "X-Admin-Key": getAdminKey() }
        );

        assert.equal(result.status, 409);
        assert.equal(
            result.data.error,
            "Project metering account is not available"
        );
    } finally {
        await cleanupProjectTestOrganization(organizationId);
    }
});

test("Standalone account API key rotation requires administrative authentication and invalidates the old key", async () => {
    const name = `Rotation Test ${randomUUID()}`;
    let accountId: string | undefined;

    try {
        const created = await post(
            "/accounts",
            { name, planId: 1 },
            { "X-Admin-Key": getAdminKey() }
        );

        assert.equal(created.status, 201);

        accountId = String(created.data.account.id);

        const originalKey = created.data.apiKey;
        const endpoint =
            `/accounts/${accountId}/api-key/rotate`;

        const inspect = async (key: string) => {
            return fetch("http://localhost:3001/account", {
                headers: { "X-API-Key": key }
            });
        };

        assert.equal((await inspect(originalKey)).status, 200);

        const unauthorized = await post(endpoint, {});
        assert.equal(unauthorized.status, 401);

        const wrongAdmin = await post(
            endpoint,
            {},
            { "X-Admin-Key": "invalid-admin-key" }
        );

        assert.equal(wrongAdmin.status, 401);
        assert.equal((await inspect(originalKey)).status, 200);

        const before = await pool.query(
            `SELECT id, name, plan_id, created_at
             FROM accounts WHERE id = $1`,
            [accountId]
        );

        const rotated = await post(
            endpoint,
            {},
            { "X-Admin-Key": getAdminKey() }
        );

        assert.equal(rotated.status, 200);
        assert.equal(rotated.data.accountId, accountId);
        assert.match(rotated.data.apiKey, /^um_[0-9a-f]{64}$/);
        assert.notEqual(rotated.data.apiKey, originalKey);

        const rejected = await inspect(originalKey);
        assert.equal(rejected.status, 401);
        assert.deepEqual(await rejected.json(), {
            error: "Invalid API key"
        });

        assert.equal(
            (await inspect(rotated.data.apiKey)).status,
            200
        );

        const after = await pool.query(
            `SELECT id, name, plan_id, created_at
             FROM accounts WHERE id = $1`,
            [accountId]
        );

        assert.deepEqual(after.rows, before.rows);

        const repeated = await post(
            endpoint,
            {},
            { "X-Admin-Key": getAdminKey() }
        );

        assert.equal(repeated.status, 200);

        assert.equal(
            (await inspect(rotated.data.apiKey)).status,
            401
        );

        assert.equal(
            (await inspect(repeated.data.apiKey)).status,
            200
        );

    } finally {
        if (accountId !== undefined) {
            await pool.query(
                "DELETE FROM plan_limit_history WHERE account_id = $1",
                [accountId]
            );

            await pool.query(
                "DELETE FROM accounts WHERE id = $1",
                [accountId]
            );
        }
    }
});

test("Standalone account rotation rejects project-linked accounts and invalid account IDs", async () => {
    const organizationId =
        await createProjectTestOrganization("Rotation Isolation Test");

    try {
        const created = await createProjectForTest(
            organizationId,
            "Rotation Isolation Project"
        );

        const accountId = created.project.meteringAccountId;

        const rejected = await post(
            `/accounts/${accountId}/api-key/rotate`,
            {},
            { "X-Admin-Key": getAdminKey() }
        );

        assert.equal(rejected.status, 404);

        const existingKey = await fetch(
            "http://localhost:3001/account",
            {
                headers: {
                    "X-API-Key": created.apiKey
                }
            }
        );

        assert.equal(existingKey.status, 200);

        for (const invalidId of [
            "0",
            "-1",
            "abc",
            "1.5",
            "9223372036854775808"
        ]) {
            const response = await post(
                `/accounts/${invalidId}/api-key/rotate`,
                {},
                { "X-Admin-Key": getAdminKey() }
            );

            assert.equal(response.status, 400);
        }

        const missing = await post(
            "/accounts/9223372036854775807/api-key/rotate",
            {},
            { "X-Admin-Key": getAdminKey() }
        );

        assert.equal(missing.status, 404);

    } finally {
        await cleanupProjectTestOrganization(organizationId);
    }
});
