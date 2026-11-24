import assert from "node:assert/strict";
import test from "node:test";
import { loadApiConfig } from "./api-config.js";

const validEnv = {
    ADMIN_API_KEY: "test-admin-key"
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
