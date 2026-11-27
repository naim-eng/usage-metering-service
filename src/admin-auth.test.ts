import assert from "node:assert/strict";
import { test } from "node:test";
import type { Request, Response } from "express";
import {
    authenticateAdmin,
    isValidAdminKey
} from "./admin-auth.js";

const expected = "synthetic-admin-key-for-testing-2026";

test("accepts the correct administrative key", () => {
    assert.equal(isValidAdminKey(expected, expected), true);
});

test("rejects incorrect administrative keys of equal length", () => {
    assert.equal(
        isValidAdminKey(expected.slice(0, -1) + "7", expected),
        false
    );
});

test("rejects administrative keys of different lengths", () => {
    assert.equal(isValidAdminKey("incorrect", expected), false);
    assert.equal(isValidAdminKey(expected + "x", expected), false);
});

test("rejects missing or empty administrative credentials", () => {
    assert.equal(isValidAdminKey(undefined, expected), false);
    assert.equal(isValidAdminKey("", expected), false);
    assert.equal(isValidAdminKey(expected, undefined), false);
    assert.equal(isValidAdminKey(expected, ""), false);
});

test("rejects whitespace and non-ASCII administrative credentials", () => {
    for (const value of [
        ` ${expected}`,
        `${expected} `,
        `${expected}\n`,
        `${expected}\t`,
        `${expected}é`
    ]) {
        assert.equal(isValidAdminKey(value, expected), false);
    }
});

function invokeMiddleware(values: string[] | undefined) {
    let status = 200;
    let body: unknown;
    let nextCalls = 0;
    const headers = new Map<string, string>();

    const req = {
        headersDistinct: {
            "x-admin-key": values
        }
    } as unknown as Request;

    const res = {
        setHeader(name: string, value: string) {
            headers.set(name.toLowerCase(), value);
            return this;
        },
        status(value: number) {
            status = value;
            return this;
        },
        json(value: unknown) {
            body = value;
            return this;
        }
    } as unknown as Response;

    const previous = process.env.ADMIN_API_KEY;

    try {
        process.env.ADMIN_API_KEY = expected;

        authenticateAdmin(req, res, () => {
            nextCalls++;
        });
    } finally {
        if (previous === undefined) {
            delete process.env.ADMIN_API_KEY;
        } else {
            process.env.ADMIN_API_KEY = previous;
        }
    }

    return { status, body, nextCalls, headers };
}

test("administrative middleware permits a single valid key", () => {
    const result = invokeMiddleware([expected]);

    assert.equal(result.nextCalls, 1);
    assert.equal(result.status, 200);
    assert.equal(result.headers.get("cache-control"), "no-store");
});

test("administrative middleware rejects invalid credentials", () => {
    for (const values of [
        undefined,
        [],
        [""],
        ["incorrect"],
        [expected, expected],
        [expected, "incorrect"],
        ["incorrect", expected],
        [`${expected}, ${expected}`]
    ]) {
        const result = invokeMiddleware(values);

        assert.equal(result.status, 401);
        assert.equal(result.nextCalls, 0);
        assert.deepEqual(result.body, { error: "Unauthorized" });
        assert.equal(result.headers.get("cache-control"), "no-store");
    }
});
