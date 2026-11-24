import assert from "node:assert/strict";
import { test } from "node:test";
import type { Server } from "node:http";
import express from "express";
import {
    createReadinessHandler,
    type ReadinessDatabase
} from "./readiness.js";

async function testReadiness(
    database: ReadinessDatabase
): Promise<{
    status: number;
    body: unknown;
    cacheControl: string | null;
}> {
    const app = express();

    app.get("/ready", createReadinessHandler(database));

    const server: Server = app.listen(0);

    try {
        await new Promise<void>((resolve, reject) => {
            if (server.listening) {
                resolve();
                return;
            }

            server.once("listening", resolve);
            server.once("error", reject);
        });

        const address = server.address();

        if (!address || typeof address === "string") {
            throw new Error("Test server address unavailable");
        }

        const response = await fetch(
            `http://127.0.0.1:${address.port}/ready`
        );

        return {
            status: response.status,
            body: await response.json(),
            cacheControl: response.headers.get("cache-control")
        };
    } finally {
        await new Promise<void>((resolve, reject) => {
            server.close(error => {
                if (error) reject(error);
                else resolve();
            });
        });
    }
}

test("readiness returns 200 when database responds", async () => {
    let executedQuery = "";

    const result = await testReadiness({
        async $queryRawUnsafe(query) {
            executedQuery = query;
            return [{ "?column?": 1 }];
        }
    });

    assert.equal(executedQuery, "SELECT 1");
    assert.equal(result.status, 200);
    assert.deepEqual(result.body, {
        status: "ready"
    });
});

test("readiness returns 503 when database fails", async () => {
    const originalError = console.error;
    console.error = () => {};

    try {
        const result = await testReadiness({
            async $queryRawUnsafe() {
                throw new Error("Sensitive database connection details");
            }
        });

        assert.equal(result.status, 503);
        assert.deepEqual(result.body, {
            status: "not_ready"
        });
    } finally {
        console.error = originalError;
    }
});

test("readiness responses cannot be cached", async () => {
    const result = await testReadiness({
        async $queryRawUnsafe() {
            return [1];
        }
    });

    assert.equal(result.cacheControl, "no-store");
});
