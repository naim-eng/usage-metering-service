import assert from "node:assert/strict";
import { test } from "node:test";
import { PassThrough } from "node:stream";
import type { Server } from "node:http";
import express from "express";
import { createLogger } from "./logger.js";
import { createRequestLogger } from "./request-logger.js";

function createTestServer() {
    const stream = new PassThrough();
    let output = "";

    stream.on("data", chunk => {
        output += chunk.toString();
    });

    const log = createLogger("info", stream);
    const app = express();

    app.use(createRequestLogger(log));

    app.get("/test", (_req, res) => {
        res.json({ success: true });
    });

    app.get("/failure", (_req, res) => {
        res.status(500).json({
            error: "Test failure"
        });
    });

    const server = app.listen(0);

    return {
        server,
        output: () => output,
        entries: () => output.trim()
            ? output.trim().split("\n").map(line => JSON.parse(line))
            : []
    };
}

async function request(
    server: Server,
    path: string,
    headers: Record<string, string> = {}
): Promise<Response> {
    const address = server.address();

    if (!address || typeof address === "string") {
        throw new Error("Test server address unavailable");
    }

    return fetch(`http://127.0.0.1:${address.port}${path}`, {
        headers
    });
}

async function closeServer(server: Server): Promise<void> {
    await new Promise<void>((resolve, reject) => {
        server.close(error => {
            if (error) reject(error);
            else resolve();
        });
    });
}

test("logs successful HTTP requests", async () => {
    const capture = createTestServer();

    try {
        const response = await request(
            capture.server,
            "/test"
        );

        assert.equal(response.status, 200);
        await response.text();

        const entries = capture.entries();

        assert.equal(entries.length, 1);
        assert.equal(entries[0].event, "http_request");
        assert.equal(entries[0].method, "GET");
        assert.equal(entries[0].path, "/test");
        assert.equal(entries[0].statusCode, 200);
        assert.ok(entries[0].durationMs >= 0);
        assert.equal(
            entries[0].requestId,
            response.headers.get("x-request-id")
        );
    } finally {
        await closeServer(capture.server);
    }
});

test("logs HTTP error responses", async () => {
    const capture = createTestServer();

    try {
        const response = await request(
            capture.server,
            "/failure"
        );

        assert.equal(response.status, 500);
        await response.text();

        const [entry] = capture.entries();

        assert.equal(entry.statusCode, 500);
        assert.equal(entry.path, "/failure");
    } finally {
        await closeServer(capture.server);
    }
});

test("does not log credentials or query parameters", async () => {
    const capture = createTestServer();

    try {
        const response = await request(
            capture.server,
            "/test?token=TEST_QUERY_SECRET",
            {
                authorization: "Bearer TEST_AUTH_SECRET",
                "x-api-key": "TEST_API_KEY_SECRET",
                "x-admin-key": "TEST_ADMIN_SECRET",
                cookie: "session=TEST_COOKIE_SECRET"
            }
        );

        assert.equal(response.status, 200);
        await response.text();

        const output = capture.output();

        assert.ok(!output.includes("TEST_QUERY_SECRET"));
        assert.ok(!output.includes("TEST_AUTH_SECRET"));
        assert.ok(!output.includes("TEST_API_KEY_SECRET"));
        assert.ok(!output.includes("TEST_ADMIN_SECRET"));
        assert.ok(!output.includes("TEST_COOKIE_SECRET"));

        const [entry] = capture.entries();

        assert.equal(entry.path, "/test");
    } finally {
        await closeServer(capture.server);
    }
});

test("generates unique request IDs", async () => {
    const capture = createTestServer();

    try {
        const first = await request(capture.server, "/test");
        const second = await request(capture.server, "/test");

        assert.equal(first.status, 200);
        assert.equal(second.status, 200);

        const firstId = first.headers.get("x-request-id");
        const secondId = second.headers.get("x-request-id");

        assert.ok(firstId);
        assert.ok(secondId);
        assert.notEqual(firstId, secondId);

        await first.text();
        await second.text();

        assert.equal(capture.entries().length, 2);
    } finally {
        await closeServer(capture.server);
    }
});

test("completed requests produce exactly one log entry", async () => {
    const capture = createTestServer();

    try {
        const response = await request(capture.server, "/test");

        assert.equal(response.status, 200);
        await response.text();

        const entries = capture.entries();

        assert.equal(entries.length, 1);
        assert.equal(entries[0].completed, true);
        assert.equal(entries[0].level, 30);
    } finally {
        await closeServer(capture.server);
    }
});

test("prematurely closed responses produce one warning", async () => {
    const stream = new PassThrough();
    let output = "";

    stream.on("data", chunk => {
        output += chunk.toString();
    });

    const app = express();
    app.use(createRequestLogger(createLogger("info", stream)));

    let notifyStarted: (() => void) | undefined;

    const started = new Promise<void>(resolve => {
        notifyStarted = resolve;
    });

    app.get("/interrupt", (_req, res) => {
        res.writeHead(200, {
            "Content-Type": "text/plain"
        });

        res.write("started");
        notifyStarted?.();
    });

    const server = app.listen(0);

    try {
        const address = server.address();

        assert.ok(address && typeof address !== "string");

        const controller = new AbortController();

        const response = await fetch(
            `http://127.0.0.1:${address.port}/interrupt`,
            { signal: controller.signal }
        );

        assert.equal(response.status, 200);

        await started;
        controller.abort();

        await assert.rejects(response.text());

        await new Promise<void>(resolve => {
            const check = () => {
                if (output.trim()) {
                    resolve();
                } else {
                    setTimeout(check, 10);
                }
            };

            check();
        });

        const entries = output.trim()
            .split("\n")
            .map(line => JSON.parse(line));

        assert.equal(entries.length, 1);
        assert.equal(entries[0].event, "http_request");
        assert.equal(entries[0].completed, false);
        assert.equal(entries[0].statusCode, null);
        assert.equal(entries[0].level, 40);
    } finally {
        server.closeAllConnections();
        await closeServer(server);
    }
});

test("logs route templates instead of project identifiers", async () => {
    const stream = new PassThrough();
    let output = "";

    stream.on("data", chunk => {
        output += chunk.toString();
    });

    const app = express();
    const router = express.Router();

    app.use(createRequestLogger(createLogger("info", stream)));

    router.get("/:projectId/dashboard", (_req, res) => {
        res.sendStatus(200);
    });

    app.use("/projects", router);

    const server = app.listen(0);

    try {
        const response = await request(
            server,
            "/projects/SECRET_PROJECT_123/dashboard"
        );

        assert.equal(response.status, 200);
        await response.text();

        const entries = output.trim()
            .split("\n")
            .map(line => JSON.parse(line));

        assert.equal(entries.length, 1);
        assert.equal(
            entries[0].path,
            "/projects/:projectId/dashboard"
        );
        assert.ok(!output.includes("SECRET_PROJECT_123"));
    } finally {
        await closeServer(server);
    }
});

test("does not expose dynamic router mount identifiers", async () => {
    const stream = new PassThrough();
    let output = "";

    stream.on("data", chunk => {
        output += chunk.toString();
    });

    const app = express();
    const router = express.Router();

    app.use(createRequestLogger(createLogger("info", stream)));

    router.get("/details", (_req, res) => {
        res.sendStatus(200);
    });

    app.use("/customers/:customerId", router);

    const server = app.listen(0);

    try {
        const response = await request(
            server,
            "/customers/SECRET_CUSTOMER_456/details"
        );

        assert.equal(response.status, 200);
        await response.text();

        const [entry] = output.trim()
            .split("\n")
            .map(line => JSON.parse(line));

        assert.equal(entry.path, "[unknown-mount]");
        assert.ok(!output.includes("SECRET_CUSTOMER_456"));
    } finally {
        await closeServer(server);
    }
});

test("does not expose unmatched URL paths", async () => {
    const stream = new PassThrough();
    let output = "";

    stream.on("data", chunk => {
        output += chunk.toString();
    });

    const app = express();

    app.use(createRequestLogger(createLogger("info", stream)));

    const server = app.listen(0);

    try {
        const response = await request(
            server,
            "/SECRET_UNMATCHED_PATH"
        );

        assert.equal(response.status, 404);
        await response.text();

        const [entry] = output.trim()
            .split("\n")
            .map(line => JSON.parse(line));

        assert.equal(entry.path, "[unmatched]");
        assert.ok(!output.includes("SECRET_UNMATCHED_PATH"));
    } finally {
        await closeServer(server);
    }
});

test("rejects unsafe route patterns in logs", async () => {
    const stream = new PassThrough();
    let output = "";

    stream.on("data", chunk => {
        output += chunk.toString();
    });

    const app = express();

    app.use(createRequestLogger(createLogger("info", stream)));

    app.get("/safe", (req, res) => {
        // Simulate an unexpected route definition reaching
        // the logger without changing the actual URL.
        (req.route as { path: string }).path =
            "/SECRET_UNSAFE_ROUTE?token=PRIVATE";

        res.sendStatus(200);
    });

    const server = app.listen(0);

    try {
        const response = await request(server, "/safe");

        assert.equal(response.status, 200);
        await response.text();

        const entries = output.trim()
            .split("\n")
            .map(line => JSON.parse(line));

        assert.equal(entries.length, 1);
        assert.equal(entries[0].path, "[unsafe-route]");
        assert.ok(!output.includes("SECRET_UNSAFE_ROUTE"));
        assert.ok(!output.includes("PRIVATE"));
    } finally {
        await closeServer(server);
    }
});
