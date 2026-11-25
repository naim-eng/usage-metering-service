import { test, expect } from "@playwright/test";
import {
  createTestAccount,
  countTestAccounts,
  cleanupTestAccount,
} from "./helpers/auth-test-data";

test("generates unique synthetic test accounts", () => {
  const first = createTestAccount();
  const second = createTestAccount();

  expect(first.email).toMatch(
    /^e2e-auth-[0-9a-f-]{36}@example\.test$/
  );

  expect(second.email).not.toBe(first.email);
  expect(second.password).not.toBe(first.password);
  expect(first.password.length).toBeGreaterThanOrEqual(8);
  expect(first.name).toBe("E2E Authentication Tester");
});

test("rejects non-E2E email addresses before database operations", async () => {
  const invalidEmails = [
    "customer@example.com",
    "test-developer-01@example.com",
    "e2e-auth-invalid@example.test",
    "",
  ];

  for (const email of invalidEmails) {
    await expect(countTestAccounts(email)).rejects.toThrow(
      "Refusing database operation for a non-E2E email address."
    );

    await expect(cleanupTestAccount(email)).rejects.toThrow(
      "Refusing database operation for a non-E2E email address."
    );
  }
});

test("checks account existence in the isolated database", async () => {
  const account = createTestAccount();

  expect(await countTestAccounts(account.email)).toBe(0);
});

test("cleanup safely handles a nonexistent test account", async () => {
  const account = createTestAccount();

  expect(await countTestAccounts(account.email)).toBe(0);
  expect(await cleanupTestAccount(account.email)).toBe(0);
  expect(await countTestAccounts(account.email)).toBe(0);
});
