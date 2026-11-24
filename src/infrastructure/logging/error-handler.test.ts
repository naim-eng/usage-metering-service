import assert from "node:assert/strict";
import { test } from "node:test";
import { once } from "node:events";
import type { Server } from "node:http";
import express from "express";
import { errorHandler } from "./error-handler.js";

async function startServer(app: ReturnType<typeof express>): Promise<{
    server: Server;
    baseUrl: string;
}> {
    const server = app.listen(0, "127.0.0.1");

    await once(server, "listening");

    const address = server.address();
    assert.ok(address && typeof address !== "string");

    return {
        server,
        baseUrl: `http://127.0.0.1:${address.port}`
    };
}

async function stopServer(server: Server): Promise<void> {
    await new Promise<void>((resolve, reject) => {
        server.close(error => {
            if (error) {
                reject(error);
            } else {
                resolve();
            }
        });
    });
}

test("unexpected errors return generic JSON", async () => {
    const app = express();

    app.get("/failure", () => {
        throw new Error("FAKE_SECRET_DATABASE_PASSWORD");
    });

    app.use(errorHandler);

    const { server, baseUrl } = await startServer(app);

    try {
        const response = await fetch(`${baseUrl}/failure`);

        assert.equal(response.status, 500);
        assert.deepEqual(await response.json(), {
            error: "Internal server error"
        });
    } finally {
        await stopServer(server);
    }
});

test("error handler does not expose exception details", async () => {
    const app = express();

    app.get("/failure", () => {
        throw new Error("FAKE_SECRET_API_KEY_12345");
    });

    app.use(errorHandler);

    const { server, baseUrl } = await startServer(app);

    try {
        const response = await fetch(`${baseUrl}/failure`);
        const body = await response.text();

        assert.equal(response.status, 500);
        assert.equal(body.includes("FAKE_SECRET_API_KEY_12345"), false);
        assert.equal(body.includes("stack"), false);
    } finally {
        await stopServer(server);
    }
});

test("error handler delegates after headers are sent", () => {
    let delegatedError: unknown;

    const fakeError = new Error("FAKE_SECRET");

    errorHandler(
        fakeError,
        {} as Parameters<typeof errorHandler>[1],
        { headersSent: true } as Parameters<typeof errorHandler>[2],
        error => {
            delegatedError = error;
        }
    );

    assert.equal(delegatedError, fakeError);
});
