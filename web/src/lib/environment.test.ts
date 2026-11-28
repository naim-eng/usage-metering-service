import assert from "node:assert/strict";
import test from "node:test";
import {
  loadAuthEnvironment,
  loadMeteringEnvironment,
  tryLoadMeteringEnvironment
} from "./environment";

const validEnv = {
  AUTH_DATABASE_URL:
    "postgresql://test_user:test_password@127.0.0.1:5434/test_database",
  BETTER_AUTH_SECRET: "synthetic-auth-secret-for-testing-2026",
  BETTER_AUTH_URL: "http://localhost:3004",
  METERING_API_URL: "http://127.0.0.1:3003",
  METERING_ADMIN_API_KEY: "synthetic-admin-key-for-testing-2026"
};

test("loads valid authentication configuration", () => {
  const config = loadAuthEnvironment(validEnv);

  assert.equal(config.databaseUrl, validEnv.AUTH_DATABASE_URL);
  assert.equal(config.secret, validEnv.BETTER_AUTH_SECRET);
  assert.equal(config.baseURL, validEnv.BETTER_AUTH_URL);
  assert.deepEqual(config.trustedOrigins, [validEnv.BETTER_AUTH_URL]);
});

test("rejects missing authentication configuration", () => {
  for (const key of [
    "AUTH_DATABASE_URL",
    "BETTER_AUTH_SECRET",
    "BETTER_AUTH_URL"
  ]) {
    assert.throws(
      () => loadAuthEnvironment({
        ...validEnv,
        [key]: undefined
      }),
      new RegExp(key)
    );
  }
});

test("rejects malformed PostgreSQL connection URLs", () => {
  for (const value of [
    "invalid",
    "https://localhost/database",
    "postgresql://localhost/database",
    "postgresql://user@localhost/database",
    "postgresql://user:password@localhost/",
    "postgresql://user:password@localhost/database#fragment"
  ]) {
    assert.throws(
      () => loadAuthEnvironment({
        ...validEnv,
        AUTH_DATABASE_URL: value
      }),
      /AUTH_DATABASE_URL/
    );
  }
});

test("rejects weak or malformed authentication secrets", () => {
  for (const value of [
    "",
    "short-secret",
    "a".repeat(64),
    "placeholder_" + "x".repeat(32),
    validEnv.BETTER_AUTH_SECRET + " ",
    validEnv.BETTER_AUTH_SECRET + "\n"
  ]) {
    assert.throws(
      () => loadAuthEnvironment({
        ...validEnv,
        BETTER_AUTH_SECRET: value
      }),
      /BETTER_AUTH_SECRET/
    );
  }
});

test("rejects invalid authentication origins", () => {
  for (const value of [
    "localhost:3004",
    "ftp://localhost",
    "http://user:password@localhost",
    "http://localhost/path",
    "http://localhost?query",
    "http://localhost#fragment",
    " http://localhost"
  ]) {
    assert.throws(
      () => loadAuthEnvironment({
        ...validEnv,
        BETTER_AUTH_URL: value
      }),
      /BETTER_AUTH_URL/
    );
  }
});

test("normalizes and deduplicates trusted origins", () => {
  const config = loadAuthEnvironment({
    ...validEnv,
    BETTER_AUTH_TRUSTED_ORIGINS:
      "http://localhost:3004/, https://example.com, https://example.com/"
  });

  assert.deepEqual(config.trustedOrigins, [
    "http://localhost:3004",
    "https://example.com"
  ]);
});

test("rejects malformed additional trusted origins", () => {
  for (const value of [
    "*",
    "https://*.example.com/path",
    "invalid",
    "https://example.com/path"
  ]) {
    assert.throws(
      () => loadAuthEnvironment({
        ...validEnv,
        BETTER_AUTH_TRUSTED_ORIGINS: value
      }),
      /BETTER_AUTH_TRUSTED_ORIGINS/
    );
  }
});

test("loads valid metering configuration", () => {
  assert.deepEqual(loadMeteringEnvironment(validEnv), {
    apiUrl: validEnv.METERING_API_URL,
    adminKey: validEnv.METERING_ADMIN_API_KEY
  });
});

test("rejects invalid metering configuration", () => {
  for (const key of [
    "METERING_API_URL",
    "METERING_ADMIN_API_KEY"
  ]) {
    for (const value of [undefined, "", "invalid"]) {
      assert.throws(
        () => loadMeteringEnvironment({
          ...validEnv,
          [key]: value
        }),
        new RegExp(key)
      );
    }
  }
});

test("does not disclose malformed connection credentials", () => {
  const value = "synthetic-sensitive-connection-value";

  assert.throws(
    () => loadAuthEnvironment({
      ...validEnv,
      AUTH_DATABASE_URL: value
    }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.ok(!error.message.includes(value));
      return true;
    }
  );
});

test("safe metering loader returns valid configuration", () => {
  assert.deepEqual(
    tryLoadMeteringEnvironment(validEnv),
    loadMeteringEnvironment(validEnv)
  );
});

test("safe metering loader rejects invalid configuration without throwing", () => {
  for (const env of [
    {},
    { ...validEnv, METERING_ADMIN_API_KEY: "invalid" },
    { ...validEnv, METERING_API_URL: "invalid" }
  ]) {
    assert.equal(tryLoadMeteringEnvironment(env), null);
  }
});
