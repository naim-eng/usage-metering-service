import assert from "node:assert/strict";
import { test } from "node:test";
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
