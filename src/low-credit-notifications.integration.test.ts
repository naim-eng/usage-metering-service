import "dotenv/config";

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { pool } from "./db.js";

if (process.env.DB_NAME !== "usage_metering_test") {
    throw new Error(
        "Notification integration tests require usage_metering_test"
    );
}

const BASE_URL = "http://127.0.0.1:3001";

after(async () => {
    await pool.end();
});

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

test("Creates account and user notifications at 80% usage", async () => {
    const adminKey = process.env.ADMIN_API_KEY;
    assert.ok(adminKey, "ADMIN_API_KEY is required");

    const created = await request(
        "POST",
        "/accounts",
        {
            name: `Notification Test ${randomUUID()}`,
            planId: 1
        },
        { "X-Admin-Key": adminKey }
    );

    assert.equal(created.status, 201);

    const accountId = created.data.account.id;
    const apiKey = created.data.apiKey;
    const userId = `notify-${randomUUID()}`;

    const accountPlan = await request(
        "POST",
        "/plans",
        {
            name: `Notification Account Plan ${randomUUID()}`,
            planType: "account",
            monthlyLimit: 5,
            maxPerRequest: 5
        },
        { "X-API-Key": apiKey }
    );

    assert.equal(accountPlan.status, 201);

    const accountPlanId = Number(accountPlan.data.plan.id);

    const switched = await request(
        "PATCH",
        "/accounts/plan",
        { planId: accountPlanId },
        { "X-API-Key": apiKey }
    );

    assert.equal(switched.status, 200);

    const userPlan = await request(
        "POST",
        "/plans",
        {
            name: `Notification User Plan ${randomUUID()}`,
            planType: "user",
            monthlyLimit: 5,
            maxPerRequest: 5
        },
        { "X-API-Key": apiKey }
    );

    assert.equal(userPlan.status, 201);

    const registered = await request(
        "POST",
        "/users",
        {
            userId,
            planId: Number(userPlan.data.plan.id)
        },
        { "X-API-Key": apiKey }
    );

    assert.equal(registered.status, 201);

    const databaseUserId = registered.data.user.id;

    for (let i = 1; i <= 4; i++) {
        const consumed = await request(
            "POST",
            "/consume",
            {
                userId,
                units: 1,
                requestId: randomUUID()
            },
            { "X-API-Key": apiKey }
        );

        assert.equal(consumed.status, 200);
        assert.equal(consumed.data.accepted, true);
    }

    // An idempotent retry must not create another notification.
    const retryId = randomUUID();

    const first = await request(
        "POST",
        "/consume",
        {
            userId,
            units: 1,
            requestId: retryId
        },
        { "X-API-Key": apiKey }
    );

    assert.equal(first.status, 200);
    assert.equal(first.data.accepted, true);

    const retry = await request(
        "POST",
        "/consume",
        {
            userId,
            units: 1,
            requestId: retryId
        },
        { "X-API-Key": apiKey }
    );

    assert.equal(retry.status, 200);
    assert.equal(retry.data.replayed, true);

    const rejected = await request(
        "POST",
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

    const notifications = await pool.query(
        `SELECT user_id, threshold_percent, monthly_limit,
                units_used, remaining_credits
         FROM low_credit_notifications
         WHERE account_id = $1
         ORDER BY user_id NULLS FIRST, threshold_percent`,
        [accountId]
    );

    assert.equal(notifications.rows.length, 6);

    for (const scopeUserId of [null, databaseUserId]) {
        const scopeNotifications = notifications.rows.filter(
            (row) => scopeUserId === null
                ? row.user_id === null
                : String(row.user_id) === scopeUserId
        );

        assert.equal(scopeNotifications.length, 3);

        for (const threshold of [80, 90, 100]) {
            const matches = scopeNotifications.filter(
                (row) => row.threshold_percent === threshold
            );

            assert.equal(
                matches.length,
                1,
                `Expected one ${threshold}% notification`
            );

            const notification = matches[0];

            assert.equal(String(notification.monthly_limit), "5");
            assert.equal(
                String(notification.units_used),
                threshold === 80 ? "4" : "5"
            );
            assert.equal(
                String(notification.remaining_credits),
                threshold === 80 ? "1" : "0"
            );
        }
    }
});

test("Notification endpoint requires authentication and isolates accounts", async () => {
    const adminKey = process.env.ADMIN_API_KEY;
    assert.ok(adminKey, "ADMIN_API_KEY is required");

    // The endpoint must reject unauthenticated requests.
    const unauthenticated = await request(
        "GET",
        "/notifications"
    );

    assert.equal(unauthenticated.status, 401);

    // Create two independent accounts.
    const accountA = await request(
        "POST",
        "/accounts",
        {
            name: `Notifications A ${randomUUID()}`,
            planId: 1
        },
        { "X-Admin-Key": adminKey }
    );

    const accountB = await request(
        "POST",
        "/accounts",
        {
            name: `Notifications B ${randomUUID()}`,
            planId: 1
        },
        { "X-Admin-Key": adminKey }
    );

    assert.equal(accountA.status, 201);
    assert.equal(accountB.status, 201);

    // Create an account-owned notification using the isolated
    // test database. No credits or usage records are changed.
    await pool.query(
        `INSERT INTO low_credit_notifications
            (account_id, user_id, month_start,
             threshold_percent, monthly_limit,
             units_used, remaining_credits)
         VALUES ($1, NULL, DATE '2026-10-01',
                 80, 100, 80, 20)`,
        [accountA.data.account.id]
    );

    const ownNotifications = await request(
        "GET",
        "/notifications",
        undefined,
        { "X-API-Key": accountA.data.apiKey }
    );

    assert.equal(ownNotifications.status, 200);
    assert.equal(ownNotifications.data.notifications.length, 1);

    const notification = ownNotifications.data.notifications[0];

    assert.equal(notification.scope, "account");
    assert.equal(notification.userId, null);
    assert.equal(notification.thresholdPercent, 80);
    assert.equal(notification.monthlyLimit, "100");
    assert.equal(notification.unitsUsed, "80");
    assert.equal(notification.remainingCredits, "20");
    assert.equal(notification.month, "2026-10");

    // Account B must not see Account A's notification.
    const otherNotifications = await request(
        "GET",
        "/notifications",
        undefined,
        { "X-API-Key": accountB.data.apiKey }
    );

    assert.equal(otherNotifications.status, 200);
    assert.deepEqual(otherNotifications.data.notifications, []);
});
