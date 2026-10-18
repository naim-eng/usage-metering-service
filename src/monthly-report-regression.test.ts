
import "dotenv/config";

import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

// Never execute against the primary database.
if (process.env.DB_NAME !== "usage_metering_test") {
    throw new Error(
        "Regression tests require usage_metering_test"
    );
}

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

function currentUtcMonth(): string {
    return new Date().toISOString().slice(0, 7);
}

test(
    "New accounts immediately have historical monthly limits",
    async () => {
        const adminKey = process.env.ADMIN_API_KEY;

        assert.ok(adminKey, "ADMIN_API_KEY is required");

        // Repeatedly exercise account creation followed by
        // an immediate monthly-report request.
        for (let iteration = 1; iteration <= 30; iteration++) {
            const created = await request(
                "POST",
                "/accounts",
                {
                    name: `Reporting Regression ${randomUUID()}`,
                    planId: 1
                },
                { "X-Admin-Key": adminKey }
            );

            assert.equal(
                created.status,
                201,
                `Account creation failed on iteration ${iteration}: ` +
                    JSON.stringify(created.data)
            );

            const month = currentUtcMonth();

            const report = await request(
                "GET",
                `/usage/monthly?month=${month}`,
                undefined,
                { "X-API-Key": created.data.apiKey }
            );

            assert.equal(
                report.status,
                200,
                `Report request failed on iteration ${iteration}: ` +
                    JSON.stringify(report.data)
            );

            assert.equal(
                report.data.account.monthly_limit,
                "100",
                `Incorrect account limit on iteration ${iteration}`
            );

            assert.equal(
                report.data.account.historical_limits_available,
                true,
                `Missing history snapshot on iteration ${iteration}`
            );

            assert.equal(
                report.data.account.units_used,
                "0",
                `Unexpected usage on iteration ${iteration}`
            );

            assert.equal(
                report.data.account.plan_name,
                "Starter",
                `Incorrect plan on iteration ${iteration}`
            );
        }
    }
);
