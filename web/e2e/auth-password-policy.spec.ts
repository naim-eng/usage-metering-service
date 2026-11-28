import { test, expect } from "@playwright/test";
import { randomBytes } from "node:crypto";
import {
  verifyCustomerPassword,
} from "../src/lib/password-crypto";
import {
  createTestAccount,
  countTestAccounts,
  countTestSessions,
  cleanupTestAccount,
  readTestPasswordHash,
} from "./helpers/auth-test-data";
import {
  MIN_PASSWORD_LENGTH,
  MAX_PASSWORD_LENGTH,
} from "../src/lib/password-policy";

function syntheticPassword(length: number): string {
  return randomBytes(length).toString("hex").slice(0, length);
}

for (const length of [
  MIN_PASSWORD_LENGTH - 1,
  MAX_PASSWORD_LENGTH + 1,
]) {
  test(`API rejects password length ${length}`, async ({
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
            password: syntheticPassword(length),
          },
        }
      );

      expect(response.status()).toBeGreaterThanOrEqual(400);
      expect(response.status()).toBeLessThan(500);
      expect(response.status()).not.toBe(429);

      const body = await response.json();

      expect(body.code).toBe(
        length < MIN_PASSWORD_LENGTH
          ? "PASSWORD_TOO_SHORT"
          : "PASSWORD_TOO_LONG"
      );

      expect(await countTestAccounts(account.email)).toBe(0);
      expect(await countTestSessions(account.email)).toBe(0);
    } finally {
      await cleanupTestAccount(account.email);
      expect(await countTestAccounts(account.email)).toBe(0);
    }
  });
}

for (const length of [
  MIN_PASSWORD_LENGTH,
  MAX_PASSWORD_LENGTH,
]) {
  test(`API accepts password length ${length}`, async ({
    request,
    baseURL,
  }) => {
    const account = createTestAccount();
    const password = syntheticPassword(length);

    try {
      expect(await countTestAccounts(account.email)).toBe(0);

      const response = await request.post(
        "/api/auth/sign-up/email",
        {
          headers: { origin: baseURL! },
          data: {
            name: account.name,
            email: account.email,
            password,
          },
        }
      );

      expect(response.ok()).toBe(true);
      expect(await countTestAccounts(account.email)).toBe(1);

      const storedHash =
        await readTestPasswordHash(account.email);

      expect(storedHash !== password).toBe(true);

      expect(
        /^scrypt-v1:[0-9a-f]{32}:[0-9a-f]{128}$/.test(storedHash)
      ).toBe(true);

      expect(
        await verifyCustomerPassword({ hash: storedHash, password })
      ).toBe(true);

      expect(
        await verifyCustomerPassword({ hash: storedHash, password: password + " " })
      ).toBe(false);
    } finally {
      await cleanupTestAccount(account.email);
      expect(await countTestAccounts(account.email)).toBe(0);
    }
  });
}

test("stores distinct salted hashes for identical passwords", async ({
  playwright,
  baseURL,
}) => {
  const first = createTestAccount();
  const second = createTestAccount();
  const password = syntheticPassword(32);

  const hashes: string[] = [];

  try {
    for (const account of [first, second]) {
      const context = await playwright.request.newContext({
        baseURL,
        extraHTTPHeaders: {
          origin: baseURL!,
        },
      });

      try {
        expect(await countTestAccounts(account.email)).toBe(0);

        const response = await context.post(
          "/api/auth/sign-up/email",
          {
            data: {
              name: account.name,
              email: account.email,
              password,
            },
          }
        );

        expect(response.ok()).toBe(true);
        expect(await countTestAccounts(account.email)).toBe(1);

        const hash = await readTestPasswordHash(account.email);

        expect(hash !== password).toBe(true);

        expect(
          /^scrypt-v1:[0-9a-f]{32}:[0-9a-f]{128}$/.test(hash)
        ).toBe(true);

        expect(
          await verifyCustomerPassword({ hash, password })
        ).toBe(true);

        hashes.push(hash);
      } finally {
        await context.dispose();
      }
    }

    expect(hashes.length).toBe(2);
    expect(hashes[0] !== hashes[1]).toBe(true);

    expect(
      hashes[0].split(":")[1] !== hashes[1].split(":")[1]
    ).toBe(true);
  } finally {
    try {
      await cleanupTestAccount(first.email);
      expect(await countTestAccounts(first.email)).toBe(0);
    } finally {
      await cleanupTestAccount(second.email);
      expect(await countTestAccounts(second.email)).toBe(0);
    }
  }
});
