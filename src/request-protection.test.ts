import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "node:net";
import {
    JSON_BODY_LIMIT,
    requireJsonContentType,
    parseJsonBody,
    requireJsonObject,
    requestParsingErrorHandler
} from "./request-protection.js";

test("HTTP request protection enforces JSON contracts", async () => {
    const app = express();

    app.post(
        "/test",
        requireJsonContentType,
        parseJsonBody,
        requireJsonObject,
        (_req, res) => {
            res.status(200).json({ accepted: true });
        }
    );

    app.use(requestParsingErrorHandler);

    const server = app.listen(0, "127.0.0.1");

    try {
        await new Promise<void>((resolve, reject) => {
            server.once("listening", resolve);
            server.once("error", reject);
        });

        const port = (server.address() as AddressInfo).port;
        const url = `http://127.0.0.1:${port}/test`;

        const cases: {
            name: string;
            body: string;
            status: number;
            headers?: Record<string, string>;
        }[] = [
            {
                name: "valid JSON",
                body: '{"name":"Project"}',
                status: 200
            },
            {
                name: "malformed JSON",
                body: '{"name":}',
                status: 400
            },
            {
                name: "JSON array",
                body: '[]',
                status: 400
            },
            {
                name: "JSON primitive",
                body: '123',
                status: 400
            },
            {
                name: "JSON null",
                body: 'null',
                status: 400
            },
            {
                name: "unsupported content type",
                body: '{}',
                headers: {
                    "Content-Type": "text/plain"
                },
                status: 415
            },
            {
                name: "unsupported encoding",
                body: '{}',
                headers: {
                    "Content-Encoding": "gzip"
                },
                status: 415
            },
            {
                name: "exact payload boundary",
                body: JSON.stringify({
                    value: "a".repeat(JSON_BODY_LIMIT - 12)
                }),
                status: 200
            },
            {
                name: "oversized payload",
                body: JSON.stringify({
                    value: "a".repeat(JSON_BODY_LIMIT)
                }),
                status: 413
            }
        ];

        for (const item of cases) {
            const response = await fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    ...item.headers
                },
                body: item.body
            });

            assert.equal(
                response.status,
                item.status,
                item.name
            );

            await response.json();
        }

        console.log("HTTP request scenarios: 9/9 passed");
    } finally {
        await new Promise<void>((resolve, reject) => {
            server.close((error) => {
                if (error) reject(error);
                else resolve();
            });
            server.closeAllConnections();
        });
    }
});
