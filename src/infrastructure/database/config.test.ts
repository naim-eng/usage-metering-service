
import assert from "node:assert/strict";
import { test } from "node:test";
import { loadDatabaseConfig } from "./config.js";

const validEnv = {
    DB_HOST: "localhost",
    DB_PORT: "5432",
    DB_USER: "test_user",
    DB_PASSWORD: "test_password",
    DB_NAME: "test_database"
};

test("loads valid database configuration with defaults", () => {
    assert.deepEqual(loadDatabaseConfig(validEnv), {
        host: "localhost",
        port: 5432,
        user: "test_user",
        password: "test_password",
        database: "test_database",
        connectionTimeoutMs: 5000,
        poolMax: 10,
        sslMode: "disable"
    });
});

test("rejects missing required configuration", () => {
    for (const key of Object.keys(validEnv)) {
        const env = { ...validEnv };
        delete (env as Record<string, string>)[key];

        assert.throws(
            () => loadDatabaseConfig(env),
            new RegExp(`Missing database configuration: ${key}`)
        );
    }
});

test("rejects invalid PostgreSQL ports", () => {
    for (const port of [
        "0", "-1", "65536", "abc", "5432.5", "Infinity"
    ]) {
        assert.throws(
            () => loadDatabaseConfig({
                ...validEnv,
                DB_PORT: port
            }),
            /Invalid PostgreSQL port/
        );
    }
});

test("accepts valid PostgreSQL port boundaries", () => {
    for (const port of ["1", "65535"]) {
        assert.equal(
            loadDatabaseConfig({
                ...validEnv,
                DB_PORT: port
            }).port,
            Number(port)
        );
    }
});

test("accepts a custom connection timeout", () => {
    assert.equal(
        loadDatabaseConfig({
            ...validEnv,
            DB_CONNECT_TIMEOUT_MS: "10000"
        }).connectionTimeoutMs,
        10000
    );
});

test("accepts timeout boundaries", () => {
    for (const timeout of ["100", "60000"]) {
        assert.equal(
            loadDatabaseConfig({
                ...validEnv,
                DB_CONNECT_TIMEOUT_MS: timeout
            }).connectionTimeoutMs,
            Number(timeout)
        );
    }
});

test("rejects invalid connection timeouts", () => {
    for (const timeout of [
        "0", "99", "60001", "-100",
        "abc", "500.5", "Infinity", ""
    ]) {
        assert.throws(
            () => loadDatabaseConfig({
                ...validEnv,
                DB_CONNECT_TIMEOUT_MS: timeout
            }),
            /DB_CONNECT_TIMEOUT_MS must be between 100 and 60000 milliseconds/
        );
    }
});

test("accepts verified TLS without a custom CA", () => {
    const config = loadDatabaseConfig({
        ...validEnv,
        DB_SSL_MODE: "verify-full"
    });

    assert.equal(config.sslMode, "verify-full");
    assert.equal(config.sslRootCert, undefined);
});

test("accepts verified TLS with a custom CA path", () => {
    const config = loadDatabaseConfig({
        ...validEnv,
        DB_SSL_MODE: "verify-full",
        DB_SSL_ROOT_CERT: "/etc/ssl/certs/database-ca.pem"
    });

    assert.equal(config.sslMode, "verify-full");
    assert.equal(
        config.sslRootCert,
        "/etc/ssl/certs/database-ca.pem"
    );
});

test("rejects unsupported TLS modes", () => {
    for (const mode of [
        "require", "prefer", "allow",
        "verify-ca", "true", "false", ""
    ]) {
        assert.throws(
            () => loadDatabaseConfig({
                ...validEnv,
                DB_SSL_MODE: mode
            }),
            /DB_SSL_MODE must be disable or verify-full/
        );
    }
});

test("rejects empty CA certificate paths", () => {
    for (const path of ["", "   "]) {
        assert.throws(
            () => loadDatabaseConfig({
                ...validEnv,
                DB_SSL_MODE: "verify-full",
                DB_SSL_ROOT_CERT: path
            }),
            /DB_SSL_ROOT_CERT cannot be empty/
        );
    }
});

test("rejects CA configuration when TLS is disabled", () => {
    assert.throws(
        () => loadDatabaseConfig({
            ...validEnv,
            DB_SSL_MODE: "disable",
            DB_SSL_ROOT_CERT: "/etc/ssl/certs/database-ca.pem"
        }),
        /DB_SSL_ROOT_CERT requires DB_SSL_MODE=verify-full/
    );
});

test("accepts a custom connection pool limit", () => {
    assert.equal(
        loadDatabaseConfig({
            ...validEnv,
            DB_POOL_MAX: "20"
        }).poolMax,
        20
    );
});

test("accepts connection pool boundaries", () => {
    for (const max of ["1", "100"]) {
        assert.equal(
            loadDatabaseConfig({
                ...validEnv,
                DB_POOL_MAX: max
            }).poolMax,
            Number(max)
        );
    }
});

test("rejects invalid connection pool limits", () => {
    for (const max of [
        "0", "-1", "101", "abc",
        "10.5", "Infinity", ""
    ]) {
        assert.throws(
            () => loadDatabaseConfig({
                ...validEnv,
                DB_POOL_MAX: max
            }),
            /DB_POOL_MAX must be an integer between 1 and 100/
        );
    }
});


test("rejects whitespace-only required database settings", () => {
    for (const key of Object.keys(validEnv)) {
        for (const value of ["", " ", "\t", "\n"]) {
            assert.throws(
                () => loadDatabaseConfig({
                    ...validEnv,
                    [key]: value
                }),
                new RegExp(key)
            );
        }
    }
});

test("rejects malformed database host values", () => {
    for (const host of [
        " localhost",
        "localhost ",
        "database host",
        "postgresql://localhost",
        "localhost/path",
        "localhost?query",
        "user@localhost",
        "localhost#fragment",
        "localhost\\path"
    ]) {
        assert.throws(
            () => loadDatabaseConfig({
                ...validEnv,
                DB_HOST: host
            }),
            /DB_HOST/
        );
    }
});

test("accepts supported database host formats", () => {
    for (const host of [
        "localhost",
        "db",
        "127.0.0.1",
        "database.example.com"
    ]) {
        assert.equal(
            loadDatabaseConfig({
                ...validEnv,
                DB_HOST: host
            }).host,
            host
        );
    }
});

test("rejects non-decimal database numeric settings", () => {
    const settings = [
        ["DB_PORT", "5432"],
        ["DB_CONNECT_TIMEOUT_MS", "5000"],
        ["DB_POOL_MAX", "10"]
    ] as const;

    for (const [key, value] of settings) {
        for (const invalid of [
            " " + value,
            value + " ",
            "+" + value,
            value + ".0",
            value + "e0",
            "0x" + Number(value).toString(16)
        ]) {
            assert.throws(
                () => loadDatabaseConfig({
                    ...validEnv,
                    [key]: invalid
                })
            );
        }
    }
});

test("preserves valid database passwords without modification", () => {
    for (const password of [
        "p@ss:/?#word",
        "password with spaces",
        " password-with-padding "
    ]) {
        assert.equal(
            loadDatabaseConfig({
                ...validEnv,
                DB_PASSWORD: password
            }).password,
            password
        );
    }
});

test("does not disclose credentials in configuration errors", () => {
    const password = "synthetic-sensitive-database-password";

    assert.throws(
        () => loadDatabaseConfig({
            ...validEnv,
            DB_PASSWORD: password,
            DB_PORT: "invalid"
        }),
        (error: unknown) => {
            assert.ok(error instanceof Error);
            assert.ok(!error.message.includes(password));
            return true;
        }
    );
});
