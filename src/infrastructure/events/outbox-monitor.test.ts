import assert from "node:assert/strict";
import { test } from "node:test";
import {
    monitorOutbox,
    type OutboxMonitorDatabase
} from "./outbox-monitor.js";

function fakeDatabase() {
    const calls: string[] = [];

    const database: OutboxMonitorDatabase = {
        async getDatabaseName() {
            calls.push("identity");
            return "usage_metering_test";
        },
        async getStatusCounts() {
            calls.push("statuses");
            return [
                { status: "completed", count: 12n },
                { status: "failed", count: 2n },
                { status: "pending", count: 5n }
            ];
        },
        async countExpiredLeases(now) {
            assert.ok(now instanceof Date);
            calls.push("expired");
            return 3;
        },
        async countFailedEvents() {
            calls.push("failed");
            return 2;
        },
        async getPendingBacklog() {
            calls.push("backlog");
            return {
                readyCount: 4n,
                oldestAgeSeconds: 120
            };
        }
    };

    return { database, calls };
}

test("monitor rejects missing database identity before querying", async () => {
    const { database, calls } = fakeDatabase();

    await assert.rejects(
        monitorOutbox(database, undefined),
        /DB_NAME must be explicitly set/
    );

    assert.deepEqual(calls, []);
});

test("monitor rejects mismatched database before counting", async () => {
    const { database, calls } = fakeDatabase();

    await assert.rejects(
        monitorOutbox(database, "usage_metering"),
        /Database identity verification failed/
    );

    assert.deepEqual(calls, ["identity"]);
});

test("monitor returns accurate read-only counts", async () => {
    const { database, calls } = fakeDatabase();

    const result = await monitorOutbox(
        database,
        "usage_metering_test"
    );

    assert.deepEqual(result, {
        database: "usage_metering_test",
        statusCounts: [
            { status: "completed", count: 12n },
            { status: "failed", count: 2n },
            { status: "pending", count: 5n }
        ],
        expiredLeases: 3,
        failedEvents: 2,
        readyPendingEvents: 4n,
        oldestPendingAgeSeconds: 120
    });

    assert.deepEqual(calls, [
        "identity",
        "statuses",
        "expired",
        "failed",
        "backlog"
    ]);
});

test("monitor propagates database query failures", async () => {
    const { database, calls } = fakeDatabase();

    database.getStatusCounts = async () => {
        calls.push("statuses");
        throw new Error("Simulated database failure");
    };

    await assert.rejects(
        monitorOutbox(database, "usage_metering_test"),
        /Simulated database failure/
    );

    assert.deepEqual(calls, ["identity", "statuses"]);
});

test("monitor handles an empty pending backlog", async () => {
    const { database } = fakeDatabase();

    database.getPendingBacklog = async () => ({
        readyCount: 0n,
        oldestAgeSeconds: null
    });

    const result = await monitorOutbox(
        database,
        "usage_metering_test"
    );

    assert.equal(result.readyPendingEvents, 0n);
    assert.equal(result.oldestPendingAgeSeconds, null);
});
