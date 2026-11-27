import { verifyTestAccountEmail, establishTestAccountPassword } from "./helpers/auth-email";
import { test, expect } from "@playwright/test";
import {
  createTestAccount,
  countTestAccounts,
  countTestSessions,
  cleanupTestAccount,
  readTestPasswordHash,
} from "./helpers/auth-test-data";
import {
  verifyCustomerPassword,
} from "../src/lib/password-crypto";

const rejectedPasswords = [
  {
    label: "eight supplementary Unicode characters",
    password: "\u{1F600}".repeat(8),
    code: "PASSWORD_TOO_SHORT",
  },
  {
    label: "fourteen supplementary Unicode characters",
    password: "\u{1F600}".repeat(14),
    code: "PASSWORD_TOO_SHORT",
  },
  {
    label: "password normalizing below the minimum",
    password: "e\u0301".repeat(8),
    code: "PASSWORD_TOO_SHORT",
  },
  {
    label: "password exceeding the UTF-16 upper boundary",
    password: "\u{1F600}".repeat(65),
    code: "PASSWORD_TOO_LONG",
  },
];

for (const sample of rejectedPasswords) {
  test(`API rejects ${sample.label}`, async ({
    request,
    baseURL,
  }) => {
    const account = createTestAccount();

    try {
      expect(await countTestAccounts(account.email)).toBe(0);

      const response = await request.post(
        "/api/auth/sign-up/email",
        {
          headers: { origin: baseURL! },
          data: {
            name: account.name,
            email: account.email,
            password: sample.password,
          },
        }
      );

      expect(response.status()).toBe(400);
      expect((await response.json()).code).toBe(sample.code);

      expect(await countTestAccounts(account.email)).toBe(0);
      expect(await countTestSessions(account.email)).toBe(0);
    } finally {
      await cleanupTestAccount(account.email);
    }
  });
}

const acceptedPasswords = [
  {
    label: "fifteen supplementary Unicode characters",
    password: "\u{1F600}".repeat(15),
  },
  {
    label: "fifteen normalized Unicode characters",
    password: "e\u0301".repeat(15),
  },
  {
    label: "maximum supplementary Unicode password length",
    password: "\u{1F600}".repeat(64),
  },
];

for (const sample of acceptedPasswords) {
  test(`API accepts ${sample.label}`, async ({
    playwright,
    baseURL,
  }) => {
    const account = createTestAccount();

    const registration = await playwright.request.newContext({
      baseURL,
      extraHTTPHeaders: { origin: baseURL! },
    });

    try {
      const response = await registration.post(
        "/api/auth/sign-up/email",
        {
          data: {
            name: account.name,
            email: account.email,
            password: sample.password,
          },
        }
      );

      expect(response.ok()).toBe(true);
      await verifyTestAccountEmail(registration, account.email);
      await establishTestAccountPassword(registration, account.email, sample.password);
      expect(await countTestAccounts(account.email)).toBe(1);

      const hash = await readTestPasswordHash(account.email);

      expect(
        await verifyCustomerPassword({
          hash,
          password: sample.password,
        })
      ).toBe(true);

      const signIn = await playwright.request.newContext({
        baseURL,
        extraHTTPHeaders: { origin: baseURL! },
      });

      try {
        const authenticated = await signIn.post(
          "/api/auth/sign-in/email",
          {
            data: {
              email: account.email,
              password: sample.password.normalize("NFKC"),
            },
          }
        );

        expect(authenticated.ok()).toBe(true);

        const session = await signIn.get(
          "/api/auth/get-session"
        );

        expect(session.ok()).toBe(true);

        expect((await session.json()).user.email)
          .toBe(account.email);
      } finally {
        await signIn.dispose();
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
}
