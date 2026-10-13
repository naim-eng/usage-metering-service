import { test } from "node:test";
import assert from "node:assert/strict";
import { checkQuota } from "./consume.js";

test("Accepts a request within both limits", () => {
    const result = checkQuota(2n, 100n, 10n, 20n, 2n);

    assert.deepEqual(result, {
        accepted: true
    });
});

test("Rejects requests exceeding the user's per-request limit", () => {
    const result = checkQuota(3n, 100n, 10n, 20n, 2n);

    assert.deepEqual(result, {
        accepted: false,
        scope: "user",
        rule: "max_per_request"
    });
});

test("Rejects requests exceeding the account's monthly limit", () => {
    const result = checkQuota(2n, 1n, 10n, 20n, 2n);

    assert.deepEqual(result, {
        accepted: false,
        scope: "account",
        rule: "monthly_limit"
    });
});

test("Rejects requests exceeding the user's monthly limit", () => {
    const result = checkQuota(2n, 100n, 1n, 20n, 10n);

    assert.deepEqual(result, {
        accepted: false,
        scope: "user",
        rule: "monthly_limit"
    });
});

test("Rejects requests exceeding the account's per-request limit", () => {
    const result = checkQuota(6n, 100n, 100n, 5n, 10n);

    assert.deepEqual(result, {
        accepted: false,
        scope: "account",
        rule: "max_per_request"
    });
});
