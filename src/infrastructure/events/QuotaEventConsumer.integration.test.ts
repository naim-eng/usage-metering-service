import "dotenv/config";

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "../database/prisma.js";
import { QuotaEventConsumer } from "./QuotaEventConsumer.js";

if (process.env.DB_NAME !== "usage_metering_test") {
    throw new Error(
        "Consumer integration tests require usage_metering_test"
    );
}

after(async () => {
    await prisma.$disconnect();
});

test("Consumer completes a pending event", async () => {
    const key = `test:consumer:${randomUUID()}`;

    const event = await prisma.outbox_events.create({
        data: {
            event_type: "quota.threshold.reached",
            deduplication_key: key,
            payload: {
                test: true,
                scenario: "successful-processing"
            },
            available_at: new Date("2020-01-01T00:00:00.000Z")
        }
    });

    const consumer = new QuotaEventConsumer(prisma);
    const processed = await consumer.processOne(event.id);

    assert.equal(processed, true);

    const updated = await prisma.outbox_events.findUniqueOrThrow({
        where: { id: event.id }
    });

    assert.equal(updated.status, "completed");
    assert.equal(updated.attempts, 1);
    assert.ok(updated.processed_at);
});

test("Consumer recovers an event with an expired processing lease", async () => {
    const key = `test:recovery:${randomUUID()}`;

    const event = await prisma.outbox_events.create({
        data: {
            event_type: "quota.threshold.reached",
            deduplication_key: key,
            payload: {
                test: true,
                scenario: "crash-recovery"
            },
            status: "processing",
            attempts: 1,
            available_at: new Date("2020-01-01T00:00:00.000Z")
        }
    });

    const consumer = new QuotaEventConsumer(prisma);
    const processed = await consumer.processOne(event.id);

    assert.equal(processed, true);

    const updated = await prisma.outbox_events.findUniqueOrThrow({
        where: { id: event.id }
    });

    assert.equal(updated.status, "completed");
    assert.equal(updated.attempts, 2);
    assert.ok(updated.processed_at);
});

test("Consumer marks exhausted events as failed", async () => {
    const key = `test:max-retries:${randomUUID()}`;

    const event = await prisma.outbox_events.create({
        data: {
            event_type: "quota.threshold.reached",
            deduplication_key: key,
            payload: {
                test: true,
                scenario: "maximum-retries"
            },
            status: "processing",
            attempts: 5,
            available_at: new Date("2020-01-01T00:00:00.000Z")
        }
    });

    const consumer = new QuotaEventConsumer(prisma);
    const processed = await consumer.processOne(event.id);

    assert.equal(processed, false);

    const updated = await prisma.outbox_events.findUniqueOrThrow({
        where: { id: event.id }
    });

    assert.equal(updated.status, "failed");
    assert.equal(updated.attempts, 5);
    assert.equal(
        updated.last_error,
        "Processing lease expired after maximum attempts"
    );
});

test("Concurrent consumers cannot claim the same event twice", async () => {
    const event = await prisma.outbox_events.create({
        data: {
            event_type: "quota.threshold.reached",
            deduplication_key: `test:concurrency:${randomUUID()}`,
            payload: {
                test: true,
                scenario: "concurrent-claim"
            },
            available_at: new Date("2020-01-01T00:00:00.000Z")
        }
    });

    const consumerA = new QuotaEventConsumer(prisma);
    const consumerB = new QuotaEventConsumer(prisma);

    const results = await Promise.all([
        consumerA.processOne(event.id),
        consumerB.processOne(event.id)
    ]);

    assert.equal(
        results.filter((processed) => processed === true).length,
        1
    );

    const updated = await prisma.outbox_events.findUniqueOrThrow({
        where: { id: event.id }
    });

    assert.equal(updated.status, "completed");
    assert.equal(updated.attempts, 1);
    assert.ok(updated.processed_at);
});

test("Consumer schedules a retry when event handling fails", async () => {
    const event = await prisma.outbox_events.create({
        data: {
            event_type: "quota.threshold.reached",
            deduplication_key: `test:handler-failure:${randomUUID()}`,
            payload: {
                test: true,
                scenario: "handler-failure"
            }
        }
    });

    const consumer = new QuotaEventConsumer(prisma, async () => {
        throw new Error("Simulated processing failure");
    });

    const processed = await consumer.processOne(event.id);

    assert.equal(processed, false);

    const updated = await prisma.outbox_events.findUniqueOrThrow({
        where: { id: event.id }
    });

    assert.equal(updated.status, "pending");
    assert.equal(updated.attempts, 1);
    assert.equal(updated.last_error, "Simulated processing failure");
    assert.equal(updated.processed_at, null);

    // The first failed attempt should schedule a retry
    // approximately five seconds later.
    const delayMs = updated.available_at.getTime() - Date.now();

    assert.ok(
        delayMs > 0 && delayMs <= 5000,
        `Unexpected retry delay: ${delayMs}ms`
    );
});

test("Consumer stops retrying after the fifth processing failure", async () => {
    const event = await prisma.outbox_events.create({
        data: {
            event_type: "quota.threshold.reached",
            deduplication_key: `test:final-failure:${randomUUID()}`,
            payload: {
                test: true,
                scenario: "final-processing-failure"
            },
            status: "pending",
            attempts: 4
        }
    });

    const consumer = new QuotaEventConsumer(prisma, async () => {
        throw new Error("Final simulated processing failure");
    });

    const processed = await consumer.processOne(event.id);

    assert.equal(processed, false);

    const updated = await prisma.outbox_events.findUniqueOrThrow({
        where: { id: event.id }
    });

    assert.equal(updated.status, "failed");
    assert.equal(updated.attempts, 5);
    assert.equal(
        updated.last_error,
        "Final simulated processing failure"
    );
    assert.equal(updated.processed_at, null);
});
