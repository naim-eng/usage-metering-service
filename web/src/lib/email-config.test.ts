import assert from "node:assert/strict";
import { test } from "node:test";
import { loadEmailConfig } from "./email-config";

const production = {
  DEPLOYMENT_ENV: "production",
  NODE_ENV: "production",
  SMTP_HOST: "smtp.mail-provider.com",
  SMTP_PORT: "587",
  SMTP_SECURE: "false",
  SMTP_FROM: "no-reply@metering-service.com",
  SMTP_USER: "synthetic-smtp-user",
  SMTP_PASSWORD: "synthetic-smtp-password",
};

test("local email configuration uses loopback Mailpit", () => {
  assert.deepEqual(
    loadEmailConfig({ DEPLOYMENT_ENV: "local" }),
    {
      host: "127.0.0.1",
      port: 1025,
      secure: false,
      requireTLS: false,
      from: "no-reply@example.test",
    }
  );
});

test("production SMTP requires STARTTLS on port 587", () => {
  const config = loadEmailConfig(production);

  assert.equal(config.secure, false);
  assert.equal(config.requireTLS, true);
  assert.equal(config.port, 587);
  assert.ok(config.auth);
});

test("production SMTP supports implicit TLS on port 465", () => {
  const config = loadEmailConfig({
    ...production,
    SMTP_PORT: "465",
    SMTP_SECURE: "true",
  });

  assert.equal(config.secure, true);
  assert.equal(config.port, 465);
});

const invalidProduction = [
  ["missing host", { SMTP_HOST: "" }],
  ["missing username", { SMTP_USER: "" }],
  ["missing password", { SMTP_PASSWORD: "" }],
  ["plaintext SMTP port", { SMTP_PORT: "25" }],
  ["invalid port", { SMTP_PORT: "65536" }],
  ["invalid encryption flag", { SMTP_SECURE: "yes" }],
  ["incorrect TLS port", { SMTP_SECURE: "true" }],
  ["loopback host", { SMTP_HOST: "127.0.0.1" }],
  ["localhost", { SMTP_HOST: "localhost" }],
  ["test SMTP host", { SMTP_HOST: "smtp.example.test" }],
  ["placeholder sender", { SMTP_FROM: "user@example.com" }],
  ["invalid sender", { SMTP_FROM: "invalid-email" }],
  ["header injection", { SMTP_FROM: "a@b.com\r\nBcc: c@d.com" }],
  ["credential injection", { SMTP_USER: "user\r\ninjected" }],
] as const;

for (const [label, overrides] of invalidProduction) {
  test(`production rejects ${label}`, () => {
    assert.throws(
      () => loadEmailConfig({ ...production, ...overrides }),
      /Invalid email configuration/
    );
  });
}

const invalidLocal = [
  ["external SMTP host", { SMTP_HOST: "smtp.external.com" }],
  ["unexpected SMTP port", { SMTP_PORT: "587" }],
  ["encrypted local transport", { SMTP_SECURE: "true" }],
  [
    "local SMTP credentials",
    {
      SMTP_USER: "synthetic-user",
      SMTP_PASSWORD: "synthetic-password",
    },
  ],
] as const;

for (const [label, overrides] of invalidLocal) {
  test(`local configuration rejects ${label}`, () => {
    assert.throws(
      () => loadEmailConfig({
        DEPLOYMENT_ENV: "local",
        ...overrides,
      }),
      /Invalid email configuration/
    );
  });
}

test("configuration errors do not expose SMTP passwords", () => {
  const secret = "synthetic-sensitive-value";

  assert.throws(
    () => loadEmailConfig({
      ...production,
      SMTP_HOST: "",
      SMTP_PASSWORD: secret,
    }),
    (error: unknown) =>
      error instanceof Error &&
      !error.message.includes(secret)
  );
});

const isolatedEmailEnvironment = {
  DEPLOYMENT_ENV: "local",
  E2E_AUTH_RATE_LIMIT: "1",
  NEXT_BUILD_DIR: ".next-e2e",
  BETTER_AUTH_URL: "http://localhost:3004",
  AUTH_DATABASE_URL:
    "postgresql://metering_e2e:e2e_local_password_not_for_production@127.0.0.1:5434/usage_metering_e2e",
  SMTP_HOST: "127.0.0.1",
  SMTP_PORT: "1026",
  SMTP_SECURE: "false",
};

test("development SMTP remains on port 1025", () => {
  assert.equal(
    loadEmailConfig({ DEPLOYMENT_ENV: "local" }).port,
    1025
  );
});

test("isolated E2E SMTP uses port 1026", () => {
  assert.equal(
    loadEmailConfig(isolatedEmailEnvironment).port,
    1026
  );
});

const invalidIsolatedEmailEnvironments = [
  ["ordinary development", {
    DEPLOYMENT_ENV: "local",
    SMTP_PORT: "1026",
  }],
  ["missing E2E flag", {
    ...isolatedEmailEnvironment,
    E2E_AUTH_RATE_LIMIT: "0",
  }],
  ["incorrect build directory", {
    ...isolatedEmailEnvironment,
    NEXT_BUILD_DIR: ".next",
  }],
  ["incorrect authentication origin", {
    ...isolatedEmailEnvironment,
    BETTER_AUTH_URL: "http://localhost:3002",
  }],
  ["missing database URL", {
    ...isolatedEmailEnvironment,
    AUTH_DATABASE_URL: "",
  }],
  ["development database port", {
    ...isolatedEmailEnvironment,
    AUTH_DATABASE_URL:
      isolatedEmailEnvironment.AUTH_DATABASE_URL.replace(
        "5434", "5433"
      ),
  }],
  ["incorrect database name", {
    ...isolatedEmailEnvironment,
    AUTH_DATABASE_URL:
      isolatedEmailEnvironment.AUTH_DATABASE_URL.replace(
        "/usage_metering_e2e", "/usage_metering"
      ),
  }],
  ["incorrect database user", {
    ...isolatedEmailEnvironment,
    AUTH_DATABASE_URL:
      isolatedEmailEnvironment.AUTH_DATABASE_URL.replace(
        "metering_e2e:", "metering:"
      ),
  }],
  ["external SMTP host", {
    ...isolatedEmailEnvironment,
    SMTP_HOST: "smtp.example.com",
  }],
  ["encrypted E2E SMTP", {
    ...isolatedEmailEnvironment,
    SMTP_SECURE: "true",
  }],
  ["E2E SMTP credentials", {
    ...isolatedEmailEnvironment,
    SMTP_USER: "test",
    SMTP_PASSWORD: "test",
  }],
  ["development SMTP port", {
    ...isolatedEmailEnvironment,
    SMTP_PORT: "1025",
  }],
  ["production deployment", {
    ...isolatedEmailEnvironment,
    DEPLOYMENT_ENV: "production",
  }],
] as const;

for (const [description, environment] of invalidIsolatedEmailEnvironments) {
  test(`E2E SMTP rejects ${description}`, () => {
    assert.throws(() => loadEmailConfig(environment));
  });
}
