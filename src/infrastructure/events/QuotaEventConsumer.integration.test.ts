import "dotenv/config";

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
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

test("Consumer cannot overwrite an event completed by a newer worker", async () => {
    const event = await prisma.outbox_events.create({
        data: {
            event_type: "quota.threshold.reached",
            deduplication_key: `test:lease-reclaimed:${randomUUID()}`,
            payload: {
                test: true,
                scenario: "concurrent-lease-reclamation"
            }
        }
    });

    let handlerStarted!: () => void;
    const started = new Promise<void>((resolve) => {
        handlerStarted = resolve;
    });

    let releaseHandler!: () => void;
    const release = new Promise<void>((resolve) => {
        releaseHandler = resolve;
    });

    const consumerA = new QuotaEventConsumer(prisma, async () => {
        handlerStarted();
        await release;
    });

    const consumerB = new QuotaEventConsumer(prisma, async () => {});

    const processingA = consumerA.processOne(event.id);

    await started;

    let processingB: boolean;

    try {
        const claimed = await prisma.outbox_events.findUniqueOrThrow({
            where: { id: event.id }
        });

        assert.equal(claimed.status, "processing");
        assert.equal(claimed.attempts, 1);

        await prisma.outbox_events.update({
            where: { id: event.id },
            data: {
                available_at: new Date("2020-01-01T00:00:00.000Z")
            }
        });

        processingB = await consumerB.processOne(event.id);
    } finally {
        releaseHandler();
    }

    const processingAResult = await processingA;

    assert.equal(processingB, true);
    assert.equal(processingAResult, false);

    const updated = await prisma.outbox_events.findUniqueOrThrow({
        where: { id: event.id }
    });

    assert.equal(updated.status, "completed");
    assert.equal(updated.attempts, 2);
    assert.ok(updated.processed_at);
    assert.equal(updated.last_error, null);
});

test("Consumer cannot complete an event after its lease expires", async () => {
    const event = await prisma.outbox_events.create({
        data: {
            event_type: "quota.threshold.reached",
            deduplication_key: `test:expired-during-processing:${randomUUID()}`,
            payload: {
                test: true,
                scenario: "lease-expired-during-processing"
            }
        }
    });

    let handlerStarted!: () => void;
    const started = new Promise<void>((resolve) => {
        handlerStarted = resolve;
    });

    let releaseHandler!: () => void;
    const release = new Promise<void>((resolve) => {
        releaseHandler = resolve;
    });

    const consumer = new QuotaEventConsumer(prisma, async () => {
        handlerStarted();
        await release;
    });

    const processing = consumer.processOne(event.id);

    await started;

    try {
        const claimed = await prisma.outbox_events.findUniqueOrThrow({
            where: { id: event.id }
        });

        assert.equal(claimed.status, "processing");
        assert.equal(claimed.attempts, 1);

        await prisma.outbox_events.update({
            where: { id: event.id },
            data: {
                available_at: new Date("2020-01-01T00:00:00.000Z")
            }
        });
    } finally {
        releaseHandler();
    }

    const processed = await processing;

    assert.equal(processed, false);

    const updated = await prisma.outbox_events.findUniqueOrThrow({
        where: { id: event.id }
    });

    assert.equal(updated.status, "processing");
    assert.equal(updated.attempts, 1);
    assert.equal(updated.processed_at, null);
});

test("Consumer cannot schedule a retry after its lease expires", async () => {
    const event = await prisma.outbox_events.create({
        data: {
            event_type: "quota.threshold.reached",
            deduplication_key: `test:expired-handler-failure:${randomUUID()}`,
            payload: {
                test: true,
                scenario: "failure-after-lease-expiration"
            }
        }
    });

    let handlerStarted!: () => void;
    const started = new Promise<void>((resolve) => {
        handlerStarted = resolve;
    });

    let releaseHandler!: () => void;
    const release = new Promise<void>((resolve) => {
        releaseHandler = resolve;
    });

    const consumer = new QuotaEventConsumer(prisma, async () => {
        handlerStarted();
        await release;
        throw new Error("Simulated failure after lease expiration");
    });

    const processing = consumer.processOne(event.id);

    await started;

    try {
        const claimed = await prisma.outbox_events.findUniqueOrThrow({
            where: { id: event.id }
        });

        assert.equal(claimed.status, "processing");
        assert.equal(claimed.attempts, 1);

        await prisma.outbox_events.update({
            where: { id: event.id },
            data: {
                available_at: new Date("2020-01-01T00:00:00.000Z")
            }
        });
    } finally {
        releaseHandler();
    }

    const processed = await processing;

    assert.equal(processed, false);

    const updated = await prisma.outbox_events.findUniqueOrThrow({
        where: { id: event.id }
    });

    assert.equal(updated.status, "processing");
    assert.equal(updated.attempts, 1);
    assert.equal(
        updated.available_at.toISOString(),
        "2020-01-01T00:00:00.000Z"
    );
    assert.equal(updated.last_error, null);
    assert.equal(updated.processed_at, null);
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
    assert.equal(updated.last_error, "Event handler failed");
    assert.equal(updated.processed_at, null);

    // The first failed attempt should schedule a retry
    // approximately five seconds later.
    const delayMs = updated.available_at.getTime() - Date.now();

    assert.ok(
        delayMs > 0 && delayMs <= 5000,
        `Unexpected retry delay: ${delayMs}ms`
    );
});

test("Consumer applies exponential backoff on intermediate failures", async () => {
    for (const [attempt, expectedDelaySeconds] of [
        [2, 10],
        [3, 20],
        [4, 40]
    ]) {
        const event = await prisma.outbox_events.create({
            data: {
                event_type: "quota.threshold.reached",
                deduplication_key: `test:retry-backoff:${randomUUID()}`,
                payload: {
                    test: true,
                    scenario: "intermediate-retry-backoff"
                },
                status: "pending",
                attempts: attempt - 1
            }
        });

        const consumer = new QuotaEventConsumer(prisma, async () => {
            throw new Error("Simulated retry failure");
        });

        const before = Date.now();
        const processed = await consumer.processOne(event.id);
        const after = Date.now();

        assert.equal(processed, false);

        const updated = await prisma.outbox_events.findUniqueOrThrow({
            where: { id: event.id }
        });

        assert.equal(updated.status, "pending");
        assert.equal(updated.attempts, attempt);
        assert.equal(updated.last_error, "Event handler failed");
        assert.equal(updated.processed_at, null);

        const scheduledAt = updated.available_at.getTime();
        const expectedDelayMs = expectedDelaySeconds * 1000;

        assert.ok(
            scheduledAt >= before + expectedDelayMs - 2000 &&
            scheduledAt <= after + expectedDelayMs + 2000,
            `Unexpected retry delay for attempt ${attempt}`
        );
    }
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
        "Event handler failed"
    );
    assert.equal(updated.processed_at, null);
});

test("Consumer never persists sensitive exception details", async () => {
    const fakeCredential = "FAKE_TEST_CREDENTIAL_DO_NOT_LOG";

    const event = await prisma.outbox_events.create({
        data: {
            event_type: "quota.threshold.reached",
            deduplication_key: `test:sensitive-error:${randomUUID()}`,
            payload: {
                test: true,
                scenario: "sensitive-exception"
            }
        }
    });

    const consumer = new QuotaEventConsumer(prisma, async () => {
        throw new Error(`Database operation failed: ${fakeCredential}`);
    });

    const processed = await consumer.processOne(event.id);

    assert.equal(processed, false);

    const updated = await prisma.outbox_events.findUniqueOrThrow({
        where: { id: event.id }
    });

    assert.equal(updated.status, "pending");
    assert.equal(updated.attempts, 1);
    assert.equal(updated.last_error, "Event handler failed");
    assert.ok(!updated.last_error?.includes(fakeCredential));
    assert.equal(updated.processed_at, null);
});


test("Consumer recovers after a real worker process crash", {
    timeout: 15000
}, async () => {
    const event = await prisma.outbox_events.create({
        data: {
            event_type: "quota.threshold.reached",
            deduplication_key: `test:process-crash:${randomUUID()}`,
            payload: {
                test: true,
                scenario: "real-process-crash"
            }
        }
    });

    const child = spawn(
        process.execPath,
        [
            "--import",
            "tsx",
            "src/infrastructure/events/crash-test-worker.ts"
        ],
        {
            cwd: process.cwd(),
            env: {
                ...process.env,
                DB_NAME: "usage_metering_test",
                CRASH_TEST_EVENT_ID: String(event.id)
            },
            stdio: ["ignore", "pipe", "pipe"]
        }
    );

    let output = "";

    const exited = new Promise<{
        code: number | null;
        signal: NodeJS.Signals | null;
    }>((resolve, reject) => {
        child.once("error", reject);
        child.once("exit", (code, signal) => {
            resolve({ code, signal });
        });
    });

    try {
        await new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => {
                cleanup();
                reject(new Error(
                    "Timed out waiting for crash-test handler"
                ));
            }, 10000);

            const onData = (chunk: Buffer) => {
                output += chunk.toString();

                if (output.includes("HANDLER_STARTED")) {
                    cleanup();
                    resolve();
                }
            };

            const onExit = () => {
                cleanup();
                reject(new Error(
                    "Crash-test worker exited before handler started"
                ));
            };

            const cleanup = () => {
                clearTimeout(timeout);
                child.stdout?.off("data", onData);
                child.off("exit", onExit);
            };

            child.stdout?.on("data", onData);
            child.once("exit", onExit);
        });

        const claimed = await prisma.outbox_events.findUniqueOrThrow({
            where: { id: event.id }
        });

        assert.equal(claimed.status, "processing");
        assert.equal(claimed.attempts, 1);

        child.kill("SIGKILL");

        const result = await exited;

        assert.equal(result.signal, "SIGKILL");

        const stranded = await prisma.outbox_events.findUniqueOrThrow({
            where: { id: event.id }
        });

        assert.equal(stranded.status, "processing");
        assert.equal(stranded.attempts, 1);
        assert.equal(stranded.processed_at, null);

        await prisma.outbox_events.update({
            where: { id: event.id },
            data: {
                available_at: new Date("2020-01-01T00:00:00.000Z")
            }
        });

        const replacement = new QuotaEventConsumer(
            prisma,
            async () => {}
        );

        assert.equal(await replacement.processOne(event.id), true);

        const recovered = await prisma.outbox_events.findUniqueOrThrow({
            where: { id: event.id }
        });

        assert.equal(recovered.status, "completed");
        assert.equal(recovered.attempts, 2);
        assert.ok(recovered.processed_at);
        assert.equal(recovered.last_error, null);
    } finally {
        if (child.exitCode === null && child.signalCode === null) {
            child.kill("SIGKILL");
        }

        await exited.catch(() => {});
    }
});
