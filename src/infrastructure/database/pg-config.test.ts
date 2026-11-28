
import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { loadDatabaseConfig } from "./config.js";
import {
    buildPgClientConfig,
    buildPgPoolConfig
} from "./pg-config.js";

const validEnv = {
    DB_HOST: "localhost",
    DB_PORT: "5432",
    DB_USER: "test_user",
    DB_PASSWORD: "test_password",
    DB_NAME: "test_database"
};

test("builds a local PostgreSQL client configuration", () => {
    const config = buildPgClientConfig(
        loadDatabaseConfig(validEnv)
    );

    assert.equal(config.host, "localhost");
    assert.equal(config.port, 5432);
    assert.equal(config.user, "test_user");
    assert.equal(config.password, "test_password");
    assert.equal(config.database, "test_database");
    assert.equal(config.connectionTimeoutMillis, 5000);
    assert.equal(config.ssl, false);
});

test("applies a custom connection timeout", () => {
    const config = buildPgClientConfig(
        loadDatabaseConfig({
            ...validEnv,
            DB_CONNECT_TIMEOUT_MS: "12000"
        })
    );

    assert.equal(config.connectionTimeoutMillis, 12000);
});

test("enables verified TLS with hostname verification", () => {
    const config = buildPgClientConfig(
        loadDatabaseConfig({
            ...validEnv,
            DB_HOST: "database.example.com",
            DB_SSL_MODE: "verify-full"
        })
    );

    assert.deepEqual(config.ssl, {
        rejectUnauthorized: true,
        servername: "database.example.com"
    });
});

test("loads a custom CA certificate", () => {
    const directory = mkdtempSync(
        join(tmpdir(), "pg-config-test-")
    );

    try {
        const certificatePath = join(directory, "ca.pem");
        const certificate = "test-ca-certificate";

        writeFileSync(certificatePath, certificate);

        const config = buildPgClientConfig(
            loadDatabaseConfig({
                ...validEnv,
                DB_HOST: "database.example.com",
                DB_SSL_MODE: "verify-full",
                DB_SSL_ROOT_CERT: certificatePath
            })
        );

        assert.deepEqual(config.ssl, {
            rejectUnauthorized: true,
            servername: "database.example.com",
            ca: certificate
        });
    } finally {
        rmSync(directory, {
            recursive: true,
            force: true
        });
    }
});

test("rejects a missing CA certificate file", () => {
    assert.throws(
        () => buildPgClientConfig(
            loadDatabaseConfig({
                ...validEnv,
                DB_SSL_MODE: "verify-full",
                DB_SSL_ROOT_CERT:
                    "/nonexistent/database-ca-test.pem"
            })
        ),
        { code: "ENOENT" }
    );
});

test("applies the configured pool limit", () => {
    const config = buildPgPoolConfig(
        loadDatabaseConfig({
            ...validEnv,
            DB_POOL_MAX: "20"
        })
    );

    assert.equal(config.max, 20);
    assert.equal(config.connectionTimeoutMillis, 5000);
    assert.equal(config.ssl, false);
});

test("uses the default pool limit", () => {
    const config = buildPgPoolConfig(
        loadDatabaseConfig(validEnv)
    );

    assert.equal(config.max, 10);
});
