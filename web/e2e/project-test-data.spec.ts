import { test, expect } from "@playwright/test";
import {
  createTestAccount,
  createTestOrganization,
  createTestProject,
  countTestProjects,
  cleanupTestProject,
} from "./helpers/auth-test-data";

test("generates unique synthetic project identifiers", () => {
  const account = createTestAccount();

  const first = createTestProject(account);
  const second = createTestProject(account);

  expect(first.slug).toMatch(
    /^e2e-project-[0-9a-f-]{36}-[0-9a-f-]{36}$/
  );

  expect(first.name).toBe(first.slug);
  expect(first.slug.length).toBeLessThanOrEqual(100);
  expect(first.slug).not.toBe(second.slug);
});

test("rejects project operations for non-E2E customers", async () => {
  const account = createTestAccount();
  const organization = createTestOrganization(account);
  const project = createTestProject(account);

  const invalidEmail = "customer@example.com";

  expect(() =>
    createTestProject({
      ...account,
      email: invalidEmail,
    })
  ).toThrow(
    "Refusing database operation for a non-E2E email address."
  );

  await expect(
    countTestProjects(
      invalidEmail,
      organization.slug,
      project.slug
    )
  ).rejects.toThrow(
    "Refusing database operation for a non-E2E email address."
  );

  await expect(
    cleanupTestProject(
      invalidEmail,
      organization.slug,
      project.slug
    )
  ).rejects.toThrow(
    "Refusing database operation for a non-E2E email address."
  );
});

test("rejects project operations for unrelated organizations", async () => {
  const account = createTestAccount();
  const otherAccount = createTestAccount();

  const otherOrganization =
    createTestOrganization(otherAccount);

  const project = createTestProject(account);

  await expect(
    countTestProjects(
      account.email,
      otherOrganization.slug,
      project.slug
    )
  ).rejects.toThrow(
    "Refusing database operation for an unrelated organization."
  );

  await expect(
    cleanupTestProject(
      account.email,
      otherOrganization.slug,
      project.slug
    )
  ).rejects.toThrow(
    "Refusing database operation for an unrelated organization."
  );
});

test("rejects unrelated and malformed project identifiers", async () => {
  const account = createTestAccount();
  const otherAccount = createTestAccount();

  const organization = createTestOrganization(account);
  const otherProject = createTestProject(otherAccount);

  for (const slug of [
    otherProject.slug,
    "customer-project",
    "",
  ]) {
    await expect(
      countTestProjects(
        account.email,
        organization.slug,
        slug
      )
    ).rejects.toThrow(
      "Refusing database operation for an unrelated project."
    );

    await expect(
      cleanupTestProject(
        account.email,
        organization.slug,
        slug
      )
    ).rejects.toThrow(
      "Refusing database operation for an unrelated project."
    );
  }
});

test("reports zero projects for a new synthetic customer", async () => {
  const account = createTestAccount();
  const organization = createTestOrganization(account);
  const project = createTestProject(account);

  expect(
    await countTestProjects(
      account.email,
      organization.slug,
      project.slug
    )
  ).toBe(0);
});

test("safely handles cleanup of a nonexistent project", async () => {
  const account = createTestAccount();
  const organization = createTestOrganization(account);
  const project = createTestProject(account);

  expect(
    await cleanupTestProject(
      account.email,
      organization.slug,
      project.slug
    )
  ).toBe(0);

  expect(
    await countTestProjects(
      account.email,
      organization.slug,
      project.slug
    )
  ).toBe(0);
});
