import assert from "node:assert/strict";
import test from "node:test";
import { loadApiConfig } from "./api-config.js";

const validEnv = {
    ADMIN_API_KEY: "synthetic-admin-key-for-unit-testing-2026"
};

test("uses port 3000 by default", () => {
    assert.deepEqual(loadApiConfig(validEnv), {
        port: 3000
    });
});

test("accepts a valid custom port", () => {
    assert.deepEqual(
        loadApiConfig({
            ...validEnv,
            PORT: "8080"
        }),
        { port: 8080 }
    );
});

test("rejects invalid ports", () => {
    for (const port of [
        "",
        "0",
        "65536",
        "-1",
        "3000.5",
        "abc",
        " 3000",
        "Infinity"
    ]) {
        assert.throws(
            () => loadApiConfig({
                ...validEnv,
                PORT: port
            }),
            /PORT/
        );
    }
});

test("rejects missing or empty admin keys", () => {
    for (const adminKey of [
        undefined,
        "",
        "   ",
        "replace_with_your_admin_key"
    ]) {
        assert.throws(
            () => loadApiConfig({
                PORT: "3000",
                ADMIN_API_KEY: adminKey
            }),
            /ADMIN_API_KEY/
        );
    }
});

test("accepts the highest valid TCP port", () => {
    assert.equal(
        loadApiConfig({
            ...validEnv,
            PORT: "65535"
        }).port,
        65535
    );
});


test("rejects short administrative keys", () => {
    for (const length of [1, 8, 16, 31]) {
        assert.throws(
            () => loadApiConfig({
                ADMIN_API_KEY: "Ab9!".repeat(8).slice(0, length)
            }),
            /ADMIN_API_KEY/
        );
    }
});

test("accepts a 32-character administrative key", () => {
    assert.deepEqual(
        loadApiConfig({
            ADMIN_API_KEY: "Ab9!".repeat(8)
        }),
        { port: 3000 }
    );
});

test("rejects administrative keys containing whitespace", () => {
    const key = validEnv.ADMIN_API_KEY;

    for (const invalid of [
        " " + key,
        key + " ",
        key + "\t",
        key + "\n",
        key.slice(0, 16) + " " + key.slice(16)
    ]) {
        assert.throws(
            () => loadApiConfig({
                ADMIN_API_KEY: invalid
            }),
            /ADMIN_API_KEY/
        );
    }
});

test("rejects administrative keys containing non-ASCII or control characters", () => {
    for (const character of ["\u0000", "\u007f", "\u00e9"]) {
        assert.throws(
            () => loadApiConfig({
                ADMIN_API_KEY: validEnv.ADMIN_API_KEY + character
            }),
            /ADMIN_API_KEY/
        );
    }
});

test("rejects long administrative key placeholders", () => {
    for (const prefix of [
        "replace_with",
        "REPLACE-WITH",
        "change_me",
        "CHANGE-ME",
        "your_",
        "placeholder"
    ]) {
        assert.throws(
            () => loadApiConfig({
                ADMIN_API_KEY: prefix + "x".repeat(32)
            }),
            /ADMIN_API_KEY/
        );
    }
});

test("rejects single-character repeated administrative keys", () => {
    for (const character of ["a", "0", "!"]) {
        assert.throws(
            () => loadApiConfig({
                ADMIN_API_KEY: character.repeat(64)
            }),
            /ADMIN_API_KEY/
        );
    }
});

test("accepts isolated CI and E2E administrative key fixtures", () => {
    for (const key of [
        "ci_admin_key_not_for_production_2026",
        "e2e_local_admin_key_not_for_production"
    ]) {
        assert.deepEqual(
            loadApiConfig({ ADMIN_API_KEY: key }),
            { port: 3000 }
        );
    }
});

test("does not disclose invalid administrative keys in errors", () => {
    const key = "placeholder_sensitive_test_value_12345";

    assert.throws(
        () => loadApiConfig({ ADMIN_API_KEY: key }),
        (error: unknown) => {
            assert.ok(error instanceof Error);
            assert.match(error.message, /ADMIN_API_KEY/);
            assert.ok(!error.message.includes(key));
            return true;
        }
    );
});
