import { verifyTestAccountEmail, establishTestAccountPassword } from "./helpers/auth-email";
import { test, expect } from "@playwright/test";
import { hashPassword } from "@better-auth/utils/password";
import {
  createTestAccount,
  countTestAccounts,
  countTestSessions,
  cleanupTestAccount,
  readTestPasswordHash,
  replaceTestPasswordWithLegacyHash,
} from "./helpers/auth-test-data";

test("authenticates an existing customer with a legacy password", async ({
  playwright,
  baseURL,
}) => {
  const account = createTestAccount();
  const legacyPassword = "Legacy1!";

  const registration = await playwright.request.newContext({
    baseURL,
    extraHTTPHeaders: { origin: baseURL! },
  });

  try {
    expect(await countTestAccounts(account.email)).toBe(0);

    const registered = await registration.post(
      "/api/auth/sign-up/email",
      { data: account }
    );

    expect(registered.ok()).toBe(true);
    await verifyTestAccountEmail(registration, account.email);
    await establishTestAccountPassword(registration, account.email, account.password);
    expect(await countTestAccounts(account.email)).toBe(1);

    const legacyHash = await hashPassword(legacyPassword);

    await replaceTestPasswordWithLegacyHash(
      account.email,
      legacyHash
    );

    expect(
      (await readTestPasswordHash(account.email)) === legacyHash
    ).toBe(true);

    const initialSessions =
      await countTestSessions(account.email);

    const invalidContext = await playwright.request.newContext({
      baseURL,
      extraHTTPHeaders: { origin: baseURL! },
    });

    try {
      const rejected = await invalidContext.post(
        "/api/auth/sign-in/email",
        {
          data: {
            email: account.email,
            password: legacyPassword + "-incorrect",
          },
        }
      );

      expect(rejected.status()).toBe(401);

      expect((await rejected.json()).code)
        .toBe("INVALID_EMAIL_OR_PASSWORD");

      expect(await countTestSessions(account.email))
        .toBe(initialSessions);
    } finally {
      await invalidContext.dispose();
    }

    const validContext = await playwright.request.newContext({
      baseURL,
      extraHTTPHeaders: { origin: baseURL! },
    });

    try {
      const accepted = await validContext.post(
        "/api/auth/sign-in/email",
        {
          data: {
            email: account.email,
            password: legacyPassword,
          },
        }
      );

      expect(accepted.ok()).toBe(true);

      expect(await countTestSessions(account.email))
        .toBe(initialSessions + 1);

      const session = await validContext.get(
        "/api/auth/get-session"
      );

      expect(session.ok()).toBe(true);

      expect((await session.json()).user.email)
        .toBe(account.email);

      expect(
        (await readTestPasswordHash(account.email)) === legacyHash
      ).toBe(true);
    } finally {
      await validContext.dispose();
    }
  } finally {
    try {
      await registration.dispose();
    } finally {
      await cleanupTestAccount(account.email);
      expect(await countTestAccounts(account.email)).toBe(0);
    }
  }
});
