import { test, expect } from "@playwright/test";
import {
  createTestAccount,
  createTestOrganization,
  countTestOrganizations,
  cleanupTestOrganization,
  countTestSessions,
} from "./helpers/auth-test-data";

test("generates unique synthetic organization identifiers", () => {
  const firstAccount = createTestAccount();
  const secondAccount = createTestAccount();

  const first = createTestOrganization(firstAccount);
  const second = createTestOrganization(secondAccount);

  expect(first.slug).toMatch(
    /^e2e-org-[0-9a-f-]{36}$/
  );

  expect(first.name).toBe(first.slug);

  expect(first.slug.length).toBeLessThanOrEqual(50);

  expect(first.slug).not.toBe(second.slug);

  expect(createTestOrganization(firstAccount)).toEqual(first);
});

test("rejects organization operations for non-E2E customers", async () => {
  const account = createTestAccount();
  const organization = createTestOrganization(account);

  const invalidEmail = "customer@example.com";

  expect(() =>
    createTestOrganization({
      ...account,
      email: invalidEmail,
    })
  ).toThrow(
    "Refusing database operation for a non-E2E email address."
  );

  await expect(
    countTestOrganizations(invalidEmail, organization.slug)
  ).rejects.toThrow(
    "Refusing database operation for a non-E2E email address."
  );

  await expect(
    cleanupTestOrganization(invalidEmail, organization.slug)
  ).rejects.toThrow(
    "Refusing database operation for a non-E2E email address."
  );

  await expect(
    countTestSessions(invalidEmail)
  ).rejects.toThrow(
    "Refusing database operation for a non-E2E email address."
  );
});

test("rejects organization operations for unrelated identifiers", async () => {
  const account = createTestAccount();

  const unrelatedOrganization = createTestOrganization(
    createTestAccount()
  );

  const invalidSlugs = [
    unrelatedOrganization.slug,
    "customer-workspace",
    "",
  ];

  for (const slug of invalidSlugs) {
    await expect(
      countTestOrganizations(account.email, slug)
    ).rejects.toThrow(
      "Refusing database operation for an unrelated organization."
    );

    await expect(
      cleanupTestOrganization(account.email, slug)
    ).rejects.toThrow(
      "Refusing database operation for an unrelated organization."
    );
  }
});

test("reports zero organizations for a new synthetic customer", async () => {
  const account = createTestAccount();
  const organization = createTestOrganization(account);

  expect(
    await countTestOrganizations(
      account.email,
      organization.slug
    )
  ).toBe(0);
});

test("safely handles cleanup of a nonexistent organization", async () => {
  const account = createTestAccount();
  const organization = createTestOrganization(account);

  expect(
    await cleanupTestOrganization(
      account.email,
      organization.slug
    )
  ).toBe(0);

  expect(
    await countTestOrganizations(
      account.email,
      organization.slug
    )
  ).toBe(0);
});

test("reports zero sessions for a nonexistent customer", async () => {
  const account = createTestAccount();

  expect(
    await countTestSessions(account.email)
  ).toBe(0);
});
