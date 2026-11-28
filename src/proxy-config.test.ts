import assert from "node:assert/strict";
import { test } from "node:test";
import express from "express";
import { configureTrustedProxy } from "./proxy-config.js";

test("proxy trust is disabled when unset", () => {
    const app = express();

    configureTrustedProxy(app, undefined);

    assert.equal(app.get("trust proxy"), false);
});

test("proxy trust is disabled when explicitly false", () => {
    const app = express();

    configureTrustedProxy(app, "false");

    assert.equal(app.get("trust proxy"), false);
});

test("explicit IPv4 and IPv6 addresses are accepted", () => {
    const app = express();

    configureTrustedProxy(app, "127.0.0.1, ::1");

    assert.deepEqual(
        app.get("trust proxy"),
        ["127.0.0.1", "::1"]
    );
});

test("valid IPv4 and IPv6 CIDR ranges are accepted", () => {
    const app = express();

    configureTrustedProxy(app, "10.0.0.0/8, 2001:db8::/32");

    assert.deepEqual(
        app.get("trust proxy"),
        ["10.0.0.0/8", "2001:db8::/32"]
    );
});

test("unsafe or invalid configurations are rejected", () => {
    const invalidValues = [
        "true",
        "1",
        "0",
        "loopback",
        "uniquelocal",
        "0.0.0.0/0",
        "::/0",
        "10.0.0.0/33",
        "2001:db8::/129",
        "invalid",
        "127.0.0.1,",
        "127.0.0.1, invalid"
    ];

    for (const value of invalidValues) {
        const app = express();

        assert.throws(
            () => configureTrustedProxy(app, value),
            /TRUST_PROXY/,
            `Expected TRUST_PROXY=${value} to be rejected`
        );
    }
});

test("untrusted forwarded headers do not change client IP", async () => {
    const app = express();

    configureTrustedProxy(app, "false");

    app.get("/ip", (req, res) => {
        res.json({ ip: req.ip });
    });

    const server = app.listen(0);

    try {
        const address = server.address();

        assert.ok(address && typeof address !== "string");

        const response = await fetch(
            `http://127.0.0.1:${address.port}/ip`,
            {
                headers: {
                    "X-Forwarded-For": "203.0.113.50"
                }
            }
        );

        assert.equal(response.status, 200);

        const body = await response.json() as { ip: string };

        assert.notEqual(body.ip, "203.0.113.50");
    } finally {
        await new Promise<void>((resolve, reject) => {
            server.close(error => {
                if (error) reject(error);
                else resolve();
            });
        });
    }
});

test("trusted proxy resolves forwarded client IP", async () => {
    const app = express();

    configureTrustedProxy(app, "127.0.0.1/8, ::1");

    app.get("/ip", (req, res) => {
        res.json({ ip: req.ip });
    });

    const server = app.listen(0, "127.0.0.1");

    await new Promise<void>((resolve, reject) => {
        if (server.listening) {
            resolve();
            return;
        }

        server.once("listening", resolve);
        server.once("error", reject);
    });

    try {
        const address = server.address();

        assert.ok(address && typeof address !== "string");

        const response = await fetch(
            `http://127.0.0.1:${address.port}/ip`,
            {
                headers: {
                    "X-Forwarded-For": "203.0.113.50"
                }
            }
        );

        assert.equal(response.status, 200);

        const body = await response.json() as { ip: string };

        assert.equal(body.ip, "203.0.113.50");
    } finally {
        await new Promise<void>((resolve, reject) => {
            server.close(error => {
                if (error) reject(error);
                else resolve();
            });
        });
    }
});

test("trusted proxy stops at the first untrusted forwarded IP", async () => {
    const app = express();

    configureTrustedProxy(app, "127.0.0.1/8");

    app.get("/ip", (req, res) => {
        res.json({ ip: req.ip });
    });

    const server = app.listen(0, "127.0.0.1");

    await new Promise<void>((resolve, reject) => {
        if (server.listening) {
            resolve();
            return;
        }

        server.once("listening", resolve);
        server.once("error", reject);
    });

    try {
        const address = server.address();

        assert.ok(address && typeof address !== "string");

        const response = await fetch(
            `http://127.0.0.1:${address.port}/ip`,
            {
                headers: {
                    "X-Forwarded-For": "198.51.100.25, 203.0.113.50"
                }
            }
        );

        assert.equal(response.status, 200);

        const body = await response.json() as { ip: string };

        assert.equal(body.ip, "203.0.113.50");
    } finally {
        await new Promise<void>((resolve, reject) => {
            server.close(error => {
                if (error) reject(error);
                else resolve();
            });
        });
    }
});
