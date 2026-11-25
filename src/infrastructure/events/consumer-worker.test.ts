import assert from "node:assert/strict";
import { test } from "node:test";
import { PassThrough } from "node:stream";
import { createLogger } from "../logging/logger.js";
import { ConsumerWorker } from "./consumer-worker.js";

test("stopping an idle worker interrupts polling", async () => {
    let calls = 0;
    let processingFinished!: () => void;

    const finished = new Promise<void>((resolve) => {
        processingFinished = resolve;
    });

    const worker = new ConsumerWorker({
        async processOne() {
            calls++;
            processingFinished();
            return false;
        }
    }, 10000);

    const running = worker.run();

    await finished;

    const start = Date.now();
    worker.stop();
    await running;

    assert.equal(calls, 1);
    assert.ok(Date.now() - start < 2000);
});

test("shutdown waits for active event processing", async () => {
    let processingStarted!: () => void;
    let finishProcessing!: () => void;

    const started = new Promise<void>((resolve) => {
        processingStarted = resolve;
    });

    const finish = new Promise<void>((resolve) => {
        finishProcessing = resolve;
    });

    let calls = 0;
    let completed = false;

    const worker = new ConsumerWorker({
        async processOne() {
            calls++;
            processingStarted();
            await finish;
            completed = true;
            return true;
        }
    });

    const running = worker.run();

    await started;

    worker.stop();

    let stopped = false;
    void running.then(() => {
        stopped = true;
    });

    await Promise.resolve();

    assert.equal(stopped, false);

    finishProcessing();
    await running;

    assert.equal(completed, true);
    assert.equal(calls, 1);
});

test("stopping before startup prevents event processing", async () => {
    let calls = 0;

    const worker = new ConsumerWorker({
        async processOne() {
            calls++;
            return true;
        }
    });

    worker.stop();
    await worker.run();

    assert.equal(calls, 0);
});

test("invalid polling intervals are rejected", () => {
    const processor = {
        async processOne() {
            return false;
        }
    };

    assert.throws(() => new ConsumerWorker(processor, -1));
    assert.throws(() => new ConsumerWorker(processor, NaN));
    assert.throws(() => new ConsumerWorker(processor, Infinity));
});


function captureHeartbeats() {
    const stream = new PassThrough();
    let output = "";

    stream.on("data", chunk => {
        output += chunk.toString();
    });

    return {
        logger: createLogger("info", stream),
        entries() {
            return output.trim()
                ? output.trim().split("\n")
                    .map(line => JSON.parse(line))
                    .filter(entry =>
                        entry.event === "consumer_worker_heartbeat"
                    )
                : [];
        }
    };
}

test("worker does not emit a premature heartbeat", async () => {
    let now = 0;
    let calls = 0;
    const capture = captureHeartbeats();

    const worker = new ConsumerWorker({
        async processOne() {
            calls++;
            now = 59_999;

            if (calls === 2) {
                worker.stop();
            }

            return true;
        }
    }, 0, capture.logger, () => now);

    await worker.run();

    assert.equal(calls, 2);
    assert.equal(capture.entries().length, 0);
});

test("worker heartbeat reports and resets polling counters", async () => {
    let now = 0;
    let calls = 0;
    const capture = captureHeartbeats();

    const worker = new ConsumerWorker({
        async processOne() {
            calls++;
            now += 30_000;

            if (calls === 5) {
                worker.stop();
            }

            return calls !== 2;
        }
    }, 0, capture.logger, () => now);

    await worker.run();

    const entries = capture.entries();

    assert.equal(entries.length, 2);

    assert.equal(entries[0].pollCount, 2);
    assert.equal(entries[0].processedCount, 1);
    assert.equal(entries[0].uptimeSeconds, 60);

    assert.equal(entries[1].pollCount, 2);
    assert.equal(entries[1].processedCount, 2);
    assert.equal(entries[1].uptimeSeconds, 120);
});

test("worker does not emit heartbeats during stalled processing", async () => {
    let now = 0;
    let finishProcessing!: () => void;
    const capture = captureHeartbeats();

    const finish = new Promise<void>(resolve => {
        finishProcessing = resolve;
    });

    const worker = new ConsumerWorker({
        async processOne() {
            await finish;
            return true;
        }
    }, 0, capture.logger, () => now);

    const running = worker.run();

    now = 120_000;
    await Promise.resolve();

    assert.equal(capture.entries().length, 0);

    worker.stop();
    finishProcessing();
    await running;

    assert.equal(capture.entries().length, 0);
});
