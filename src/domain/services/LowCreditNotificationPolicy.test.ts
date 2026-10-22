import assert from "node:assert/strict";
import { test } from "node:test";

import { LowCreditNotificationPolicy } from "./LowCreditNotificationPolicy.js";

test("Triggers 80% when usage rises from 70% to 85%", () => {
    const result = LowCreditNotificationPolicy.crossedThresholds(
        70n, 85n, 100n
    );

    assert.deepEqual(result, [80]);
});

test("Triggers 90% when usage rises from 85% to 95%", () => {
    const result = LowCreditNotificationPolicy.crossedThresholds(
        85n, 95n, 100n
    );

    assert.deepEqual(result, [90]);
});

test("Triggers all thresholds when usage rises from 75% to 100%", () => {
    const result = LowCreditNotificationPolicy.crossedThresholds(
        75n, 100n, 100n
    );

    assert.deepEqual(result, [80, 90, 100]);
});

test("Does not trigger a threshold twice", () => {
    const result = LowCreditNotificationPolicy.crossedThresholds(
        95n, 97n, 100n
    );

    assert.deepEqual(result, []);
});

test("Handles small monthly limits without rounding errors", () => {
    const result = LowCreditNotificationPolicy.crossedThresholds(
        3n, 4n, 5n
    );

    assert.deepEqual(result, [80]);
});

test("Rejects invalid usage or monthly limits", () => {
    assert.throws(() =>
        LowCreditNotificationPolicy.crossedThresholds(0n, 1n, 0n)
    );

    assert.throws(() =>
        LowCreditNotificationPolicy.crossedThresholds(-1n, 1n, 10n)
    );

    assert.throws(() =>
        LowCreditNotificationPolicy.crossedThresholds(5n, 4n, 10n)
    );
});
