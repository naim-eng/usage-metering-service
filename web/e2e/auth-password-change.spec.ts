import { verifyTestAccountEmail, establishTestAccountPassword } from "./helpers/auth-email";
import { test, expect } from "@playwright/test";
import {
  createTestAccount,
  cleanupTestAccount,
  countTestAccounts,
  readTestPasswordHash,
} from "./helpers/auth-test-data";
import {
  verifyCustomerPassword,
} from "../src/lib/password-crypto";

const rejectedPasswords = [
  {
    label: "short ASCII password",
    password: "a".repeat(14),
    code: "PASSWORD_TOO_SHORT",
  },
  {
    label: "short Unicode password",
    password: "\u{1F600}".repeat(8),
    code: "PASSWORD_TOO_SHORT",
  },
  {
    label: "password normalizing below the minimum",
    password: "e\u0301".repeat(8),
    code: "PASSWORD_TOO_SHORT",
  },
  {
    label: "oversized password",
    password: "a".repeat(129),
    code: "PASSWORD_TOO_LONG",
  },
];

for (const sample of rejectedPasswords) {
  test(`password change rejects ${sample.label}`, async ({
    playwright,
    baseURL,
  }) => {
    const account = createTestAccount();

    const client = await playwright.request.newContext({
      baseURL,
      extraHTTPHeaders: { origin: baseURL! },
    });

    try {
      const registration = await client.post(
        "/api/auth/sign-up/email",
        { data: account }
      );

      expect(registration.ok()).toBe(true);

      expect((await registration.json()).token).toBeNull();

      await verifyTestAccountEmail(client, account.email);
      await establishTestAccountPassword(client, account.email, account.password);

      const authenticated = await client.post(
        "/api/auth/sign-in/email",
        {
          data: {
            email: account.email,
            password: account.password,
          },
        }
      );
      expect(authenticated.ok()).toBe(true);

      const originalHash =
        await readTestPasswordHash(account.email);

      const response = await client.post(
        "/api/auth/change-password",
        {
          data: {
            currentPassword: account.password,
            newPassword: sample.password,
          },
        }
      );

      expect(response.status()).toBe(400);
      expect((await response.json()).code)
        .toBe(sample.code);

      const currentHash =
        await readTestPasswordHash(account.email);

      expect(currentHash === originalHash).toBe(true);

      expect(
        await verifyCustomerPassword({
          hash: currentHash,
          password: account.password,
        })
      ).toBe(true);
    } finally {
      try {
        await client.dispose();
      } finally {
        await cleanupTestAccount(account.email);
        expect(await countTestAccounts(account.email))
          .toBe(0);
      }
    }
  });
}

test("rejects password change with an incorrect current password", async ({
  playwright,
  baseURL,
}) => {
  const account = createTestAccount();

  const client = await playwright.request.newContext({
    baseURL,
    extraHTTPHeaders: { origin: baseURL! },
  });

  try {
    const registration = await client.post(
      "/api/auth/sign-up/email",
      { data: account }
    );

    expect(registration.ok()).toBe(true);

    expect((await registration.json()).token).toBeNull();

    await verifyTestAccountEmail(client, account.email);
    await establishTestAccountPassword(client, account.email, account.password);

    const authenticated = await client.post(
      "/api/auth/sign-in/email",
      {
        data: {
          email: account.email,
          password: account.password,
        },
      }
    );
    expect(authenticated.ok()).toBe(true);

    const originalHash =
      await readTestPasswordHash(account.email);

    const response = await client.post(
      "/api/auth/change-password",
      {
        data: {
          currentPassword: account.password + "-incorrect",
          newPassword: account.password + "-replacement",
        },
      }
    );

    expect(response.status()).toBeGreaterThanOrEqual(400);
    expect(response.status()).toBeLessThan(500);
    expect(response.status()).not.toBe(429);

    const currentHash =
      await readTestPasswordHash(account.email);

    expect(currentHash === originalHash).toBe(true);
  } finally {
    try {
      await client.dispose();
    } finally {
      await cleanupTestAccount(account.email);
      expect(await countTestAccounts(account.email))
        .toBe(0);
    }
  }
});

test("changes a password and rejects the previous credential", async ({
  playwright,
  baseURL,
}) => {
  const account = createTestAccount();
  const newPassword = account.password + "-replacement";

  const client = await playwright.request.newContext({
    baseURL,
    extraHTTPHeaders: { origin: baseURL! },
  });

  const signIn = await playwright.request.newContext({
    baseURL,
    extraHTTPHeaders: { origin: baseURL! },
  });

  try {
    const registration = await client.post(
      "/api/auth/sign-up/email",
      { data: account }
    );

    expect(registration.ok()).toBe(true);

    expect((await registration.json()).token).toBeNull();

    await verifyTestAccountEmail(client, account.email);
    await establishTestAccountPassword(client, account.email, account.password);

    const authenticated = await client.post(
      "/api/auth/sign-in/email",
      {
        data: {
          email: account.email,
          password: account.password,
        },
      }
    );
    expect(authenticated.ok()).toBe(true);

    const originalHash =
      await readTestPasswordHash(account.email);

    const changed = await client.post(
      "/api/auth/change-password",
      {
        data: {
          currentPassword: account.password,
          newPassword,
        },
      }
    );

    expect(
      changed.status(),
      "Password-change endpoint HTTP status"
    ).toBe(200);

    const updatedHash =
      await readTestPasswordHash(account.email);

    expect(updatedHash !== originalHash).toBe(true);

    expect(
      /^scrypt-v1:[0-9a-f]{32}:[0-9a-f]{128}$/
        .test(updatedHash)
    ).toBe(true);

    expect(
      await verifyCustomerPassword({
        hash: updatedHash,
        password: newPassword,
      })
    ).toBe(true);

    expect(
      await verifyCustomerPassword({
        hash: updatedHash,
        password: account.password,
      })
    ).toBe(false);

    const oldCredential = await signIn.post(
      "/api/auth/sign-in/email",
      {
        data: {
          email: account.email,
          password: account.password,
        },
      }
    );

    expect(oldCredential.status()).toBe(401);

    const newCredential = await signIn.post(
      "/api/auth/sign-in/email",
      {
        data: {
          email: account.email,
          password: newPassword,
        },
      }
    );

    expect(newCredential.ok()).toBe(true);

    const session = await signIn.get(
      "/api/auth/get-session"
    );

    expect(session.ok()).toBe(true);
    expect((await session.json()).user.email)
      .toBe(account.email);
  } finally {
    try {
      await Promise.all([
        client.dispose(),
        signIn.dispose(),
      ]);
    } finally {
      await cleanupTestAccount(account.email);
      expect(await countTestAccounts(account.email))
        .toBe(0);
    }
  }
});
