import assert from "node:assert/strict";
import { test } from "node:test";
import { PassThrough } from "node:stream";
import { createLogger, resolveLogLevel } from "./logger.js";

function captureLogger(level = "info") {
    const stream = new PassThrough();
    let output = "";

    stream.on("data", chunk => {
        output += chunk.toString();
    });

    return {
        logger: createLogger(level, stream),
        entries: () => output.trim()
            ? output.trim().split("\n").map(line => JSON.parse(line))
            : [],
        output: () => output
    };
}

test("defaults to info logging", () => {
    assert.equal(resolveLogLevel(undefined), "info");
});

test("accepts supported log levels", () => {
    for (const level of [
        "fatal", "error", "warn", "info",
        "debug", "trace", "silent"
    ]) {
        assert.equal(resolveLogLevel(level), level);
    }

    assert.equal(resolveLogLevel("DEBUG"), "debug");
});

test("rejects invalid log levels", () => {
    assert.throws(
        () => resolveLogLevel("verbose"),
        /Invalid LOG_LEVEL configuration/
    );
});

test("production logger produces structured JSON", () => {
    const capture = captureLogger();

    capture.logger.info(
        { operation: "test" },
        "Test event"
    );

    const [entry] = capture.entries();

    assert.equal(entry.level, 30);
    assert.equal(entry.service, "usage-metering-service");
    assert.equal(entry.operation, "test");
    assert.equal(entry.msg, "Test event");
    assert.ok(!Number.isNaN(Date.parse(entry.time)));
});

test("production logger redacts credentials", () => {
    const capture = captureLogger();

    capture.logger.info({
        password: "TEST_PASSWORD_SECRET",
        apiKey: "TEST_API_KEY_SECRET",
        adminKey: "TEST_ADMIN_SECRET",
        token: "TEST_TOKEN_SECRET",
        headers: {
            authorization: "TEST_AUTH_SECRET",
            "x-api-key": "TEST_HEADER_SECRET",
            "x-admin-key": "TEST_ADMIN_HEADER_SECRET"
        },
        req: {
            headers: {
                authorization: "TEST_NESTED_AUTH_SECRET",
                "x-api-key": "TEST_NESTED_KEY_SECRET",
                "x-admin-key": "TEST_NESTED_ADMIN_SECRET"
            }
        },
        operation: "safe"
    });

    const [entry] = capture.entries();

    assert.equal(entry.password, "[REDACTED]");
    assert.equal(entry.apiKey, "[REDACTED]");
    assert.equal(entry.adminKey, "[REDACTED]");
    assert.equal(entry.token, "[REDACTED]");
    assert.equal(entry.headers.authorization, "[REDACTED]");
    assert.equal(entry.headers["x-api-key"], "[REDACTED]");
    assert.equal(entry.headers["x-admin-key"], "[REDACTED]");
    assert.equal(entry.req.headers.authorization, "[REDACTED]");
    assert.equal(entry.req.headers["x-api-key"], "[REDACTED]");
    assert.equal(entry.req.headers["x-admin-key"], "[REDACTED]");
    assert.equal(entry.operation, "safe");

    assert.ok(!capture.output().includes("TEST_"));
});

test("production logger respects log levels", () => {
    const capture = captureLogger("warn");

    capture.logger.info("Filtered event");
    capture.logger.warn("Visible event");

    const entries = capture.entries();

    assert.equal(entries.length, 1);
    assert.equal(entries[0].level, 40);
    assert.equal(entries[0].msg, "Visible event");
});

test("silent level disables logging", () => {
    const capture = captureLogger("silent");

    capture.logger.error("Should not appear");

    assert.equal(capture.entries().length, 0);
});
