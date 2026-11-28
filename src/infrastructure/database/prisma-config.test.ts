
import assert from "node:assert/strict";
import { test } from "node:test";
import { loadDatabaseConfig } from "./config.js";
import { buildPrismaDatabaseUrl } from "./prisma-config.js";

const baseEnv = {
    DB_HOST: "localhost",
    DB_PORT: "5432",
    DB_USER: "test_user",
    DB_PASSWORD: "test_password",
    DB_NAME: "usage_metering_test"
};

function buildUrl(
    overrides: Record<string, string> = {}
): URL {
    const config = loadDatabaseConfig({
        ...baseEnv,
        ...overrides
    });

    return new URL(buildPrismaDatabaseUrl(config));
}

test("builds a valid local PostgreSQL URL", () => {
    const url = buildUrl();

    assert.equal(url.protocol, "postgresql:");
    assert.equal(url.hostname, "localhost");
    assert.equal(url.port, "5432");
    assert.equal(url.username, "test_user");
    assert.equal(url.password, "test_password");
    assert.equal(url.pathname, "/usage_metering_test");
});

test("uses default connection settings", () => {
    const url = buildUrl();

    assert.equal(url.searchParams.get("connect_timeout"), "5");
    assert.equal(url.searchParams.get("connection_limit"), "10");
    assert.equal(url.searchParams.get("sslmode"), "disable");
});

test("converts milliseconds to whole seconds", () => {
    const url = buildUrl({
        DB_CONNECT_TIMEOUT_MS: "1501"
    });

    assert.equal(url.searchParams.get("connect_timeout"), "2");
});

test("applies a custom pool limit", () => {
    const url = buildUrl({
        DB_POOL_MAX: "25"
    });

    assert.equal(url.searchParams.get("connection_limit"), "25");
});

test("enables strict TLS verification", () => {
    const url = buildUrl({
        DB_SSL_MODE: "verify-full"
    });

    assert.equal(url.searchParams.get("sslmode"), "require");
    assert.equal(url.searchParams.get("sslaccept"), "strict");
});

test("does not enable TLS acceptance overrides locally", () => {
    const url = buildUrl();

    assert.equal(url.searchParams.get("sslmode"), "disable");
    assert.equal(url.searchParams.has("sslaccept"), false);
});

test("encodes special characters in credentials", () => {
    const url = buildUrl({
        DB_USER: "user@company",
        DB_PASSWORD: "p@ss:/?#word"
    });

    assert.equal(decodeURIComponent(url.username), "user@company");
    assert.equal(decodeURIComponent(url.password), "p@ss:/?#word");
});

test("supports custom CA certificates with strict TLS", () => {
    const url = buildUrl({
        DB_SSL_MODE: "verify-full",
        DB_SSL_ROOT_CERT: "/tmp/custom-ca.pem"
    });

    assert.equal(url.searchParams.get("sslcert"), "/tmp/custom-ca.pem");
    assert.equal(url.searchParams.get("sslmode"), "require");
    assert.equal(url.searchParams.get("sslaccept"), "strict");
});

test("does not add a custom CA when none is configured", () => {
    const url = buildUrl({
        DB_SSL_MODE: "verify-full"
    });

    assert.equal(url.searchParams.has("sslcert"), false);
});

test("preserves special characters in certificate paths", () => {
    const path = "/tmp/database certificates/root+ca.pem";

    const url = buildUrl({
        DB_SSL_MODE: "verify-full",
        DB_SSL_ROOT_CERT: path
    });

    assert.equal(url.searchParams.get("sslcert"), path);
});
