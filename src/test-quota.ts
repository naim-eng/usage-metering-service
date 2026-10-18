
import { test } from "node:test";
import assert from "node:assert/strict";
import { QuotaPolicy } from "./domain/services/QuotaPolicy.js";

test("Accepts a request within both limits", () => {
    const result = QuotaPolicy.evaluate(2n, {
        accountRemaining: 100n,
        userRemaining: 10n,
        accountMaxRequest: 20n,
        userMaxRequest: 2n
    });

    assert.deepEqual(result, {
        accepted: true
    });
});

test("Rejects requests exceeding the user's per-request limit", () => {
    const result = QuotaPolicy.evaluate(3n, {
        accountRemaining: 100n,
        userRemaining: 10n,
        accountMaxRequest: 20n,
        userMaxRequest: 2n
    });

    assert.deepEqual(result, {
        accepted: false,
        scope: "user",
        rule: "max_per_request"
    });
});

test("Rejects requests exceeding the account's monthly limit", () => {
    const result = QuotaPolicy.evaluate(2n, {
        accountRemaining: 1n,
        userRemaining: 10n,
        accountMaxRequest: 20n,
        userMaxRequest: 2n
    });

    assert.deepEqual(result, {
        accepted: false,
        scope: "account",
        rule: "monthly_limit"
    });
});

test("Rejects requests exceeding the user's monthly limit", () => {
    const result = QuotaPolicy.evaluate(2n, {
        accountRemaining: 100n,
        userRemaining: 1n,
        accountMaxRequest: 20n,
        userMaxRequest: 10n
    });

    assert.deepEqual(result, {
        accepted: false,
        scope: "user",
        rule: "monthly_limit"
    });
});

test("Rejects requests exceeding the account's per-request limit", () => {
    const result = QuotaPolicy.evaluate(6n, {
        accountRemaining: 100n,
        userRemaining: 100n,
        accountMaxRequest: 5n,
        userMaxRequest: 10n
    });

    assert.deepEqual(result, {
        accepted: false,
        scope: "account",
        rule: "max_per_request"
    });
});

test("Rejects nonpositive consumption units", () => {
    assert.throws(
        () => QuotaPolicy.evaluate(0n, {
            accountRemaining: 100n,
            userRemaining: 10n,
            accountMaxRequest: 20n,
            userMaxRequest: 2n
        }),
        /Units must be positive/
    );
});
