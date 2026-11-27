import assert from "node:assert/strict";
import { test } from "node:test";
import {
    generateApiKey,
    hashApiKey,
    isValidApiKey
} from "./api-keys.js";

test("generated API keys follow the canonical format", () => {
    const key = generateApiKey();

    assert.equal(key.length, 67);
    assert.match(key, /^um_[0-9a-f]{64}$/);
    assert.equal(isValidApiKey(key), true);
});

test("generates distinct API keys", () => {
    const keys = Array.from(
        { length: 1000 },
        () => generateApiKey()
    );

    assert.equal(new Set(keys).size, keys.length);
    assert.ok(keys.every(isValidApiKey));
});

test("API key hashing is deterministic and uses SHA-256", () => {
    const key = generateApiKey();
    const hash = hashApiKey(key);

    assert.match(hash, /^[0-9a-f]{64}$/);
    assert.equal(hashApiKey(key), hash);
    assert.notEqual(hash, key);
    assert.notEqual(hashApiKey(generateApiKey()), hash);
});

test("rejects malformed API key formats", () => {
    const valid = "um_" + "a".repeat(64);

    for (const value of [
        undefined,
        null,
        123,
        "",
        "um_",
        "um_" + "a".repeat(63),
        "um_" + "a".repeat(65),
        "um_" + "A".repeat(64),
        "um_" + "g".repeat(64),
        "UM_" + "a".repeat(64),
        ` ${valid}`,
        `${valid} `,
        `${valid}\n`,
        `${valid},${valid}`
    ]) {
        assert.equal(isValidApiKey(value), false);
    }
});
