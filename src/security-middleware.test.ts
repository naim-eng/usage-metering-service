import assert from "node:assert/strict";
import { after, test } from "node:test";
import type { Server } from "node:http";
import express from "express";
import helmet from "helmet";
import { configureTrustedProxy } from "./proxy-config.js";
import { rateLimit } from "express-rate-limit";
import {
    createConsumptionLimiter,
    createConsumptionPreAuthLimiter
} from "./rate-limit.js";

function createLimitedServer(limit: number): Server {
    const app = express();

    app.use(helmet());

    app.get("/health", (_req, res) => {
        res.json({ status: "ok" });
    });

    app.get(
        "/limited",
        rateLimit({
            windowMs: 60_000,
            limit,
            standardHeaders: "draft-8",
            legacyHeaders: false,
            message: { error: "Too many requests." }
        }),
        (_req, res) => {
            res.json({ status: "ok" });
        }
    );

    return app.listen(0);
}

async function request(
    server: Server,
    path: string
): Promise<Response> {
    const address = server.address();

    if (!address || typeof address === "string") {
        throw new Error("Test server address unavailable");
    }

    return fetch(`http://127.0.0.1:${address.port}${path}`);
}

async function closeServer(server: Server): Promise<void> {
    await new Promise<void>((resolve, reject) => {
        server.close(error => {
            if (error) reject(error);
            else resolve();
        });
    });
}

test("allows requests below the rate limit", async () => {
    const server = createLimitedServer(2);

    try {
        const first = await request(server, "/limited");
        const second = await request(server, "/limited");

        assert.equal(first.status, 200);
        assert.equal(second.status, 200);
        assert.ok(first.headers.has("ratelimit"));
    } finally {
        await closeServer(server);
    }
});

test("returns HTTP 429 when the limit is exceeded", async () => {
    const server = createLimitedServer(2);

    try {
        assert.equal((await request(server, "/limited")).status, 200);
        assert.equal((await request(server, "/limited")).status, 200);

        const response = await request(server, "/limited");

        assert.equal(response.status, 429);
        assert.deepEqual(await response.json(), {
            error: "Too many requests."
        });
        assert.ok(response.headers.has("retry-after"));
    } finally {
        await closeServer(server);
    }
});

test("health endpoint remains accessible", async () => {
    const server = createLimitedServer(2);

    try {
        const response = await request(server, "/health");

        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), {
            status: "ok"
        });
    } finally {
        await closeServer(server);
    }
});

test("Helmet sets security response headers", async () => {
    const server = createLimitedServer(2);

    try {
        const response = await request(server, "/health");

        assert.ok(response.headers.has("content-security-policy"));
        assert.equal(
            response.headers.get("x-content-type-options"),
            "nosniff"
        );
    } finally {
        await closeServer(server);
    }
});

const accountApp = express();
const accountLimiter = createConsumptionLimiter(2);

accountApp.use("/consume", (req, res, next) => {
    const apiKey = req.header("X-API-Key");

    const accounts: Record<string, string> = {
        "key-a1": "account-a",
        "key-a2": "account-a",
        "key-b1": "account-b"
    };

    const accountId = apiKey ? accounts[apiKey] : undefined;

    if (!accountId) {
        res.status(401).json({ error: "Invalid API key" });
        return;
    }

    res.locals.account = { id: accountId };
    next();
});

accountApp.post("/consume", accountLimiter, (_req, res) => {
    res.json({ status: "ok" });
});

const accountServer = accountApp.listen(0);

after(() => {
    accountServer.close();
});

async function consumeWithKey(apiKey: string): Promise<Response> {
    const address = accountServer.address();

    if (!address || typeof address === "string") {
        throw new Error("Account test server address unavailable");
    }

    return fetch(`http://127.0.0.1:${address.port}/consume`, {
        method: "POST",
        headers: {
            "X-API-Key": apiKey
        }
    });
}

test("rate limits are isolated by account, not API key", async () => {
    assert.equal((await consumeWithKey("key-a1")).status, 200);
    assert.equal((await consumeWithKey("key-a2")).status, 200);

    const blockedA = await consumeWithKey("key-a1");

    assert.equal(blockedA.status, 429);
    assert.deepEqual(await blockedA.json(), {
        error: "Consumption rate limit exceeded. Please try again later."
    });

    assert.equal((await consumeWithKey("key-b1")).status, 200);
    assert.equal((await consumeWithKey("key-b1")).status, 200);
    assert.equal((await consumeWithKey("key-b1")).status, 429);
});

test("unauthenticated requests cannot reach the account limiter", async () => {
    const response = await consumeWithKey("invalid-key");

    assert.equal(response.status, 401);
});

test("pre-authentication limiter blocks requests before authentication", async () => {
    const preAuthApp = express();
    let authenticationAttempts = 0;

    preAuthApp.post(
        "/consume",
        createConsumptionPreAuthLimiter(2),
        (_req, res) => {
            authenticationAttempts++;
            res.status(401).json({ error: "Invalid API key" });
        }
    );

    const preAuthServer = preAuthApp.listen(0);

    try {
        const first = await requestPost(preAuthServer);
        const second = await requestPost(preAuthServer);
        const third = await requestPost(preAuthServer);

        assert.equal(first.status, 401);
        assert.equal(second.status, 401);
        assert.equal(third.status, 429);

        assert.deepEqual(await third.json(), {
            error: "Too many requests. Please try again later."
        });

        assert.equal(authenticationAttempts, 2);
    } finally {
        await closeServer(preAuthServer);
    }
});

async function requestPost(server: Server): Promise<Response> {
    const address = server.address();

    if (!address || typeof address === "string") {
        throw new Error("Pre-authentication test server unavailable");
    }

    return fetch(`http://127.0.0.1:${address.port}/consume`, {
        method: "POST"
    });
}


async function createProxyLimitedServer(
    trustedProxy: string
): Promise<Server> {
    const app = express();

    configureTrustedProxy(app, trustedProxy);

    app.get("/health", (_req, res) => {
        res.json({ status: "ok" });
    });

    app.post(
        "/consume",
        createConsumptionPreAuthLimiter(2),
        (_req, res) => {
            res.json({ status: "ok" });
        }
    );

    const server = app.listen(0, "127.0.0.1");

    await new Promise<void>((resolve, reject) => {
        if (server.listening) {
            resolve();
            return;
        }

        server.once("listening", resolve);
        server.once("error", reject);
    });

    return server;
}

async function requestWithForwardedIP(
    server: Server,
    forwardedIP: string
): Promise<Response> {
    const address = server.address();

    assert.ok(address && typeof address !== "string");

    return fetch(
        `http://127.0.0.1:${address.port}/consume`,
        {
            method: "POST",
            headers: {
                "X-Forwarded-For": forwardedIP,
                "X-Real-IP": forwardedIP
            }
        }
    );
}

test("untrusted forwarded IP rotation cannot bypass rate limits", async () => {
    const server = await createProxyLimitedServer("false");

    try {
        assert.equal(
            (await requestWithForwardedIP(server, "192.0.2.1")).status,
            200
        );

        assert.equal(
            (await requestWithForwardedIP(server, "192.0.2.2")).status,
            200
        );

        assert.equal(
            (await requestWithForwardedIP(server, "192.0.2.3")).status,
            429
        );
    } finally {
        await closeServer(server);
    }
});

test("trusted proxy client IPs receive independent rate limits", async () => {
    const server = await createProxyLimitedServer("127.0.0.1");

    try {
        for (const ip of ["192.0.2.10", "192.0.2.20"]) {
            assert.equal(
                (await requestWithForwardedIP(server, ip)).status,
                200
            );

            assert.equal(
                (await requestWithForwardedIP(server, ip)).status,
                200
            );

            assert.equal(
                (await requestWithForwardedIP(server, ip)).status,
                429
            );
        }
    } finally {
        await closeServer(server);
    }
});

test("spoofed leftmost forwarded IP cannot bypass trusted proxy limits", async () => {
    const server = await createProxyLimitedServer("127.0.0.1");

    try {
        for (let index = 1; index <= 3; index++) {
            const response = await requestWithForwardedIP(
                server,
                `198.51.100.${index}, 203.0.113.10`
            );

            assert.equal(response.status, index <= 2 ? 200 : 429);
        }
    } finally {
        await closeServer(server);
    }
});

test("IPv6 address rotation within a subnet cannot bypass rate limits", async () => {
    const server = await createProxyLimitedServer("127.0.0.1");

    try {
        assert.equal(
            (await requestWithForwardedIP(server, "2001:db8:1::1")).status,
            200
        );

        assert.equal(
            (await requestWithForwardedIP(server, "2001:db8:1::2")).status,
            200
        );

        assert.equal(
            (await requestWithForwardedIP(server, "2001:db8:1::3")).status,
            429
        );

        assert.equal(
            (await requestWithForwardedIP(server, "2001:db8:2::1")).status,
            200
        );
    } finally {
        await closeServer(server);
    }
});

test("health endpoint remains accessible after rate limit exhaustion", async () => {
    const server = createLimitedServer(2);

    try {
        assert.equal((await request(server, "/limited")).status, 200);
        assert.equal((await request(server, "/limited")).status, 200);
        assert.equal((await request(server, "/limited")).status, 429);

        const health = await request(server, "/health");

        assert.equal(health.status, 200);
        assert.deepEqual(await health.json(), { status: "ok" });
    } finally {
        await closeServer(server);
    }
});
