import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash, randomUUID } from "node:crypto";
import { betterAuth } from "better-auth";
import {
  enforceNewPasswordPolicy,
} from "./password-policy-middleware";
import {
  hashCustomerPassword,
  verifyCustomerPassword,
} from "./password-crypto";
import {
  MIN_PASSWORD_LENGTH,
  MAX_PASSWORD_LENGTH,
} from "./password-policy";

const baseURL = "http://localhost:3900";
const password = "Synthetic-" + randomUUID();

const digest = createHash("sha1")
  .update(password)
  .digest("hex")
  .toUpperCase();

const suffix = digest.slice(5);

function createIsolatedAuth() {
  return betterAuth({
    baseURL,
    secret: randomUUID() + randomUUID(),

    telemetry: {
      enabled: false,
    },

    rateLimit: {
      enabled: false,
    },

    hooks: {
      before: enforceNewPasswordPolicy,
    },

    emailAndPassword: {
      enabled: true,
      autoSignIn: false,
      minPasswordLength: MIN_PASSWORD_LENGTH,
      maxPasswordLength: MAX_PASSWORD_LENGTH,
      password: {
        hash: hashCustomerPassword,
        verify: verifyCustomerPassword,
      },
    },
  });
}

function createAccount() {
  return {
    name: "Synthetic Screening Tester",
    email: `screening-${randomUUID()}@example.test`,
    password,
  };
}

async function post(
  auth: ReturnType<typeof createIsolatedAuth>,
  path: string,
  body: Record<string, unknown>
) {
  return auth.handler(
    new Request(`${baseURL}/api/auth${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        origin: baseURL,
      },
      body: JSON.stringify(body),
    })
  );
}

async function withDeployment(
  mode: "local" | "production",
  callback: () => Promise<void>
) {
  const env: Record<string, string | undefined> = process.env;

  const previous = env.DEPLOYMENT_ENV;
  const previousOverride = env.E2E_AUTH_RATE_LIMIT;
  const previousNodeEnv = env.NODE_ENV;

  process.env.DEPLOYMENT_ENV = mode;
  env.NODE_ENV = "production";
  delete process.env.E2E_AUTH_RATE_LIMIT;

  try {
    await callback();
  } finally {
    if (previous === undefined) {
      delete process.env.DEPLOYMENT_ENV;
    } else {
      process.env.DEPLOYMENT_ENV = previous;
    }

    if (previousOverride === undefined) {
      delete process.env.E2E_AUTH_RATE_LIMIT;
    } else {
      process.env.E2E_AUTH_RATE_LIMIT = previousOverride;
    }

    if (previousNodeEnv === undefined) {
      delete env.NODE_ENV;
    } else {
      env.NODE_ENV = previousNodeEnv;
    }
  }
}

test("production rejects compromised registration", async (t) => {
  await withDeployment("production", async () => {
    const auth = createIsolatedAuth();
    const account = createAccount();

    const mockedFetch = t.mock.method(
      globalThis,
      "fetch",
      async () => new Response(`${suffix}:42\r\n`)
    );

    const response = await post(
      auth,
      "/sign-up/email",
      account
    );

    assert.equal(response.status, 400);
    assert.equal(
      (await response.json()).code,
      "PASSWORD_COMPROMISED"
    );

    assert.equal(mockedFetch.mock.callCount(), 1);

    const signIn = await post(
      auth,
      "/sign-in/email",
      {
        email: account.email,
        password,
      }
    );

    assert.equal(signIn.status, 401);
    assert.equal(mockedFetch.mock.callCount(), 1);
  });
});

test("production rejects registration during screening outage", async (t) => {
  await withDeployment("production", async () => {
    const auth = createIsolatedAuth();
    const account = createAccount();

    const mockedFetch = t.mock.method(
      globalThis,
      "fetch",
      async () => new Response("Unavailable", {
        status: 503,
      })
    );

    const response = await post(
      auth,
      "/sign-up/email",
      account
    );

    assert.equal(response.status, 500);
    assert.equal(
      (await response.json()).code,
      "PASSWORD_SCREENING_UNAVAILABLE"
    );

    const signIn = await post(
      auth,
      "/sign-in/email",
      {
        email: account.email,
        password,
      }
    );

    assert.equal(signIn.status, 401);
    assert.equal(mockedFetch.mock.callCount(), 1);
  });
});

test("production accepts screened registration without screening sign-in", async (t) => {
  await withDeployment("production", async () => {
    const auth = createIsolatedAuth();
    const account = createAccount();

    const mockedFetch = t.mock.method(
      globalThis,
      "fetch",
      async () => new Response(`${suffix}:0\r\n`)
    );

    const response = await post(
      auth,
      "/sign-up/email",
      account
    );

    assert.equal(response.status, 200);
    assert.equal(mockedFetch.mock.callCount(), 1);

    const signIn = await post(
      auth,
      "/sign-in/email",
      {
        email: account.email,
        password,
      }
    );

    assert.equal(signIn.status, 200);
    assert.equal(mockedFetch.mock.callCount(), 1);
  });
});

test("local registration does not contact the screening service", async (t) => {
  await withDeployment("local", async () => {
    const auth = createIsolatedAuth();
    const account = createAccount();

    const mockedFetch = t.mock.method(
      globalThis,
      "fetch",
      async () => {
        throw new Error("Unexpected external request");
      }
    );

    const response = await post(
      auth,
      "/sign-up/email",
      account
    );

    assert.equal(response.status, 200);
    assert.equal(mockedFetch.mock.callCount(), 0);
  });
});

test("production rejects short passwords before external screening", async (t) => {
  await withDeployment("production", async () => {
    const auth = createIsolatedAuth();
    const account = createAccount();

    const mockedFetch = t.mock.method(
      globalThis,
      "fetch",
      async () => {
        throw new Error("Unexpected external request");
      }
    );

    const response = await post(
      auth,
      "/sign-up/email",
      {
        ...account,
        password: "\u{1F600}".repeat(8),
      }
    );

    assert.equal(response.status, 400);
    assert.equal(
      (await response.json()).code,
      "PASSWORD_TOO_SHORT"
    );

    assert.equal(mockedFetch.mock.callCount(), 0);
  });
});

const passwordChangeScenarios = [
  {
    label: "rejects compromised replacement passwords",
    screeningResponse: "compromised",
    expectedStatus: 400,
    expectedCode: "PASSWORD_COMPROMISED",
  },
  {
    label: "preserves credentials during screening outages",
    screeningResponse: "unavailable",
    expectedStatus: 500,
    expectedCode: "PASSWORD_SCREENING_UNAVAILABLE",
  },
  {
    label: "accepts screened replacement passwords",
    screeningResponse: "clean",
    expectedStatus: 200,
    expectedCode: null,
  },
];

for (const scenario of passwordChangeScenarios) {
  test(`production password change ${scenario.label}`, async (t) => {
    await withDeployment("production", async () => {
      const auth = createIsolatedAuth();
      const account = createAccount();

      const replacementPassword =
        "Replacement-" + randomUUID();

      const replacementDigest = createHash("sha1")
        .update(replacementPassword)
        .digest("hex")
        .toUpperCase();

      let registrationComplete = false;

      const mockedFetch = t.mock.method(
        globalThis,
        "fetch",
        async (input: RequestInfo | URL) => {
          const url = String(input);

          if (!registrationComplete) {
            assert.equal(
              url,
              `https://api.pwnedpasswords.com/range/${digest.slice(0, 5)}`
            );

            return new Response(`${suffix}:0\r\n`);
          }

          assert.equal(
            url,
            `https://api.pwnedpasswords.com/range/${replacementDigest.slice(0, 5)}`
          );

          if (scenario.screeningResponse === "unavailable") {
            return new Response("Unavailable", {
              status: 503,
            });
          }

          const count =
            scenario.screeningResponse === "compromised"
              ? 42
              : 0;

          return new Response(
            `${replacementDigest.slice(5)}:${count}\r\n`
          );
        }
      );

      const registration = await post(
        auth,
        "/sign-up/email",
        account
      );

      assert.equal(registration.status, 200);

      assert.equal((await registration.json()).token, null);

      const authenticated = await post(
        auth,
        "/sign-in/email",
        {
          email: account.email,
          password: account.password,
        }
      );

      assert.equal(authenticated.status, 200);

      const cookies = authenticated.headers
        .getSetCookie()
        .map((cookie) => cookie.split(";")[0])
        .join("; ");

      assert.ok(cookies.length > 0);

      registrationComplete = true;

      const changed = await auth.handler(
        new Request(
          `${baseURL}/api/auth/change-password`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              origin: baseURL,
              cookie: cookies,
            },
            body: JSON.stringify({
              currentPassword: account.password,
              newPassword: replacementPassword,
            }),
          }
        )
      );

      assert.equal(
        changed.status,
        scenario.expectedStatus
      );

      if (scenario.expectedCode !== null) {
        assert.equal(
          (await changed.json()).code,
          scenario.expectedCode
        );
      }

      assert.equal(mockedFetch.mock.callCount(), 2);

      const originalCredential = await post(
        auth,
        "/sign-in/email",
        {
          email: account.email,
          password: account.password,
        }
      );

      const replacementCredential = await post(
        auth,
        "/sign-in/email",
        {
          email: account.email,
          password: replacementPassword,
        }
      );

      if (scenario.expectedStatus === 200) {
        assert.equal(originalCredential.status, 401);
        assert.equal(replacementCredential.status, 200);
      } else {
        assert.equal(originalCredential.status, 200);
        assert.equal(replacementCredential.status, 401);
      }

      assert.equal(mockedFetch.mock.callCount(), 2);
    });
  });
}
