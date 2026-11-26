import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";

import {
    isProductionDeployment,
    requireProductionSecret
} from "../src/deployment-config";

import {
    isProductionDeployment as frontendDeployment,
    requireProductionSecret as frontendSecret
} from "../web/src/lib/deployment-config";

import { loadApiConfig } from "../src/api-config";
import { loadDatabaseConfig } from "../src/infrastructure/database/config";

import {
    loadAuthEnvironment,
    loadMeteringEnvironment,
    tryLoadMeteringEnvironment
} from "../web/src/lib/environment";

const secret = randomBytes(32).toString("hex");

const production = {
    DEPLOYMENT_ENV: "production",
    NODE_ENV: "production"
};

const database = {
    ...production,
    DB_HOST: "database.example.com",
    DB_PORT: "5432",
    DB_USER: "metering",
    DB_PASSWORD: secret,
    DB_NAME: "usage_metering",
    DB_SSL_MODE: "verify-full"
};

const auth = {
    ...production,
    AUTH_DATABASE_URL:
        `postgresql://metering:${secret}@database.example.com:5432/usage_metering?sslmode=verify-full`,
    BETTER_AUTH_SECRET: secret,
    BETTER_AUTH_URL: "https://app.example.com"
};

const metering = {
    ...production,
    METERING_API_URL: "https://api.example.com",
    METERING_ADMIN_API_KEY: secret
};

test("deployment policies default to local", () => {
    for (const policy of [isProductionDeployment, frontendDeployment]) {
        assert.equal(policy({}), false);
        assert.equal(policy({ DEPLOYMENT_ENV: "local" }), false);
        assert.equal(policy(production), true);
    }
});

test("deployment policies reject invalid modes", () => {
    for (const policy of [isProductionDeployment, frontendDeployment]) {
        for (const mode of ["", "prod", "staging", "Production"]) {
            assert.throws(() => policy({ DEPLOYMENT_ENV: mode }));
        }
    }
});

test("production prohibits test execution mode", () => {
    for (const policy of [isProductionDeployment, frontendDeployment]) {
        assert.throws(() => policy({
            ...production,
            NODE_ENV: "test"
        }));
    }
});

test("production prohibits E2E overrides", () => {
    for (const policy of [isProductionDeployment, frontendDeployment]) {
        for (const value of ["", "0", "1"]) {
            assert.throws(() => policy({
                ...production,
                E2E_AUTH_RATE_LIMIT: value
            }));
        }
    }
});

test("production accepts generated secrets", () => {
    for (const validate of [requireProductionSecret, frontendSecret]) {
        assert.doesNotThrow(() => validate(secret, "SECRET"));
    }
});

test("production rejects known weak and testing secrets", () => {
    for (const validate of [requireProductionSecret, frontendSecret]) {
        for (const value of [
            "short",
            "a".repeat(64),
            "abcd".repeat(16),
            "e2e_local_admin_key_not_for_production",
            "ci_admin_key_not_for_production_2026",
            "replace_with_a_secure_production_secret"
        ]) {
            assert.throws(() => validate(value, "SECRET"));
        }
    }
});

test("production API accepts valid administrative configuration", () => {
    assert.doesNotThrow(() => loadApiConfig({
        ...production,
        ADMIN_API_KEY: secret
    }));
});

test("production API rejects testing administrative credentials", () => {
    assert.throws(() => loadApiConfig({
        ...production,
        ADMIN_API_KEY: "e2e_local_admin_key_not_for_production"
    }));
});

test("production database accepts verified TLS configuration", () => {
    assert.doesNotThrow(() => loadDatabaseConfig(database));
});

test("production database rejects disabled or missing TLS", () => {
    for (const mode of ["disable", undefined]) {
        assert.throws(() => loadDatabaseConfig({
            ...database,
            DB_SSL_MODE: mode
        }));
    }
});

test("production database rejects weak passwords", () => {
    assert.throws(() => loadDatabaseConfig({
        ...database,
        DB_PASSWORD: "weak-password"
    }));
});

test("production authentication accepts valid configuration", () => {
    assert.doesNotThrow(() => loadAuthEnvironment(auth));
});

test("production authentication rejects HTTP origins", () => {
    assert.throws(() => loadAuthEnvironment({
        ...auth,
        BETTER_AUTH_URL: "http://app.example.com"
    }));

    assert.throws(() => loadAuthEnvironment({
        ...auth,
        BETTER_AUTH_TRUSTED_ORIGINS: "http://other.example.com"
    }));
});

test("production authentication requires verified database TLS", () => {
    for (const suffix of [
        "",
        "?sslmode=disable",
        "?sslmode=require",
        "?sslmode=verify-full&sslmode=disable"
    ]) {
        assert.throws(() => loadAuthEnvironment({
            ...auth,
            AUTH_DATABASE_URL:
                auth.AUTH_DATABASE_URL.split("?")[0] + suffix
        }));
    }
});

test("production authentication rejects weak secrets", () => {
    assert.throws(() => loadAuthEnvironment({
        ...auth,
        BETTER_AUTH_SECRET:
            "e2e-only-auth-secret-not-for-production-2026"
    }));
});

test("production authentication rejects weak database passwords", () => {
    assert.throws(() => loadAuthEnvironment({
        ...auth,
        AUTH_DATABASE_URL:
            auth.AUTH_DATABASE_URL.replace(secret, "weak-password")
    }));
});

test("production metering accepts HTTPS and valid credentials", () => {
    assert.doesNotThrow(() => loadMeteringEnvironment(metering));
});

test("production metering rejects HTTP and testing credentials", () => {
    assert.throws(() => loadMeteringEnvironment({
        ...metering,
        METERING_API_URL: "http://api.example.com"
    }));

    assert.throws(() => loadMeteringEnvironment({
        ...metering,
        METERING_ADMIN_API_KEY:
            "e2e_local_admin_key_not_for_production"
    }));
});

test("safe metering loader rejects invalid production configuration", () => {
    assert.equal(tryLoadMeteringEnvironment({
        ...metering,
        METERING_API_URL: "http://api.example.com"
    }), null);
});

test("production validation errors do not disclose secrets", () => {
    const invalid = "e2e_sensitive_fixture_not_for_production";

    assert.throws(
        () => requireProductionSecret(invalid, "SECRET"),
        (error: unknown) =>
            error instanceof Error &&
            !error.message.includes(invalid)
    );
});

test("production authentication rejects additional database URL parameters", () => {
    for (const parameter of [
        "ssl=false",
        "ssl=true",
        "sslmode=verify-full",
        "sslcert=/tmp/cert.pem",
        "sslkey=/tmp/key.pem",
        "sslrootcert=/tmp/ca.pem",
        "uselibpqcompat=true",
        "host=other.example.com",
        "password=override"
    ]) {
        assert.throws(() => loadAuthEnvironment({
            ...auth,
            AUTH_DATABASE_URL:
                auth.AUTH_DATABASE_URL + "&" + parameter
        }));
    }
});

test("local authentication remains compatible with local database URLs", () => {
    assert.doesNotThrow(() => loadAuthEnvironment({
        ...auth,
        DEPLOYMENT_ENV: "local",
        AUTH_DATABASE_URL:
            "postgresql://metering:local-password@127.0.0.1:5433/usage_metering",
        BETTER_AUTH_URL: "http://localhost:3002"
    }));
});

test("production database parameter errors do not expose parameter values", () => {
    const sensitive = "synthetic-sensitive-parameter";

    assert.throws(
        () => loadAuthEnvironment({
            ...auth,
            AUTH_DATABASE_URL:
                auth.AUTH_DATABASE_URL + "&password=" + sensitive
        }),
        (error: unknown) =>
            error instanceof Error &&
            !error.message.includes(sensitive)
    );
});
