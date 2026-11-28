import assert from "node:assert/strict";
import { createServer, get as httpGet, type Server } from "node:http";
import { test } from "node:test";
import { registerGracefulShutdown } from "./shutdown.js";

async function startServer(): Promise<Server> {
    const server = createServer((_req, res) => {
        res.end("ok");
    });

    await new Promise<void>(resolve => {
        server.listen(0, "127.0.0.1", resolve);
    });

    return server;
}

test("successful shutdown closes server and disconnects database", async () => {
    const server = await startServer();
    let disconnectCount = 0;
    const exitCodes: number[] = [];

    const shutdown = registerGracefulShutdown(
        server,
        {
            async $disconnect() {
                disconnectCount++;
            }
        },
        {
            timeoutMs: 1000,
            onComplete: code => exitCodes.push(code)
        }
    );

    await shutdown("SIGTERM");

    assert.equal(server.listening, false);
    assert.equal(disconnectCount, 1);
    assert.deepEqual(exitCodes, [0]);
});

test("repeated shutdown calls perform cleanup once", async () => {
    const server = await startServer();
    let disconnectCount = 0;
    const exitCodes: number[] = [];

    const shutdown = registerGracefulShutdown(
        server,
        {
            async $disconnect() {
                disconnectCount++;
            }
        },
        {
            timeoutMs: 1000,
            onComplete: code => exitCodes.push(code)
        }
    );

    await Promise.all([
        shutdown("SIGTERM"),
        shutdown("SIGINT")
    ]);

    assert.equal(disconnectCount, 1);
    assert.deepEqual(exitCodes, [0]);
});

test("shutdown deadline handles stalled database disconnect", async () => {
    const server = await startServer();
    const exitCodes: number[] = [];

    const shutdown = registerGracefulShutdown(
        server,
        {
            async $disconnect() {
                await new Promise<void>(() => {});
            }
        },
        {
            timeoutMs: 50,
            onComplete: code => exitCodes.push(code)
        }
    );

    await shutdown("SIGTERM");

    assert.equal(server.listening, false);
    assert.deepEqual(exitCodes, [1]);
});

test("in-flight HTTP request completes before shutdown", async () => {
    let requestStarted!: () => void;
    let finishRequest!: () => void;

    const started = new Promise<void>(resolve => {
        requestStarted = resolve;
    });

    const finish = new Promise<void>(resolve => {
        finishRequest = resolve;
    });

    const server = createServer(async (_req, res) => {
        requestStarted();
        await finish;
        res.end("completed");
    });

    await new Promise<void>(resolve => {
        server.listen(0, "127.0.0.1", resolve);
    });

    const address = server.address();

    assert.ok(address && typeof address !== "string");

    let disconnectCount = 0;
    const exitCodes: number[] = [];

    const shutdown = registerGracefulShutdown(
        server,
        {
            async $disconnect() {
                disconnectCount++;
            }
        },
        {
            timeoutMs: 1000,
            onComplete: code => exitCodes.push(code)
        }
    );

    const responsePromise = new Promise<string>((resolve, reject) => {
        const request = httpGet(
            {
                hostname: "127.0.0.1",
                port: address.port,
                path: "/",
                headers: {
                    Connection: "close"
                }
            },
            response => {
                let body = "";

                response.setEncoding("utf8");
                response.on("data", chunk => {
                    body += chunk;
                });
                response.on("end", () => resolve(body));
                response.on("error", reject);
            }
        );

        request.on("error", reject);
    });

    await started;

    const shutdownPromise = shutdown("SIGTERM");

    finishRequest();

    const responseBody = await responsePromise;
    await shutdownPromise;

    assert.equal(responseBody, "completed");
    assert.equal(server.listening, false);
    assert.equal(disconnectCount, 1);
    assert.deepEqual(exitCodes, [0]);
});
