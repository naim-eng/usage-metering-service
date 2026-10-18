
import assert from "node:assert/strict";
import { test } from "node:test";
import { QuotaPolicy } from "./QuotaPolicy.js";

const limits = {
    accountRemaining: 50n,
    userRemaining: 20n,
    accountMaxRequest: 15n,
    userMaxRequest: 10n
};

test("accepts consumption within all limits", () => {
    assert.deepEqual(
        QuotaPolicy.evaluate(5n, limits),
        { accepted: true }
    );
});

test("rejects account maximum per request", () => {
    assert.deepEqual(
        QuotaPolicy.evaluate(16n, limits),
        {
            accepted: false,
            scope: "account",
            rule: "max_per_request"
        }
    );
});

test("rejects user maximum per request", () => {
    assert.deepEqual(
        QuotaPolicy.evaluate(11n, limits),
        {
            accepted: false,
            scope: "user",
            rule: "max_per_request"
        }
    );
});

test("rejects account monthly limit", () => {
    assert.deepEqual(
        QuotaPolicy.evaluate(5n, {
            ...limits,
            accountRemaining: 4n
        }),
        {
            accepted: false,
            scope: "account",
            rule: "monthly_limit"
        }
    );
});

test("rejects user monthly limit", () => {
    assert.deepEqual(
        QuotaPolicy.evaluate(5n, {
            ...limits,
            userRemaining: 4n
        }),
        {
            accepted: false,
            scope: "user",
            rule: "monthly_limit"
        }
    );
});

test("rejects zero or negative units", () => {
    assert.throws(() => QuotaPolicy.evaluate(0n, limits));
    assert.throws(() => QuotaPolicy.evaluate(-1n, limits));
});
