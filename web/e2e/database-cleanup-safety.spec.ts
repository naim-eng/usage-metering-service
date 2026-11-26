import { test, expect } from "@playwright/test";
import {
  createTestAccount,
  createTestOrganization,
  createTestProject,
  countTestAccounts,
  countTestOrganizations,
  countTestProjects,
  cleanupTestAccount,
  cleanupTestOrganization,
  cleanupTestProject,
  setTestOrganizationOwnerRole,
  addTestCleanupBlocker,
  removeTestCleanupBlocker,
  countTestProjectDependencies,
} from "./helpers/auth-test-data";
import {
  registerTestAccount,
  createOrganizationThroughUI,
  createProjectThroughUI,
} from "./helpers/auth-browser";

test("requires database ownership before deleting synthetic fixtures", async ({
  page,
}) => {
  const account = createTestAccount();
  const organization = createTestOrganization(account);
  const project = createTestProject(account);

  let roleChanged = false;

  try {
    await registerTestAccount(page, account);
    await createOrganizationThroughUI(page, organization);

    await setTestOrganizationOwnerRole(
      account.email,
      organization.slug,
      "member"
    );

    roleChanged = true;

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
    ).toBe(1);

    await setTestOrganizationOwnerRole(
      account.email,
      organization.slug,
      "owner"
    );

    roleChanged = false;

    await createProjectThroughUI(page, project);

    await setTestOrganizationOwnerRole(
      account.email,
      organization.slug,
      "member"
    );

    roleChanged = true;

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
    ).toBe(1);

    expect(
      await countTestOrganizations(
        account.email,
        organization.slug
      )
    ).toBe(1);

  } finally {
    if (roleChanged) {
      await setTestOrganizationOwnerRole(
        account.email,
        organization.slug,
        "owner"
      );
    }

    await cleanupTestProject(
      account.email,
      organization.slug,
      project.slug
    );

    expect(
      await countTestProjects(
        account.email,
        organization.slug,
        project.slug
      )
    ).toBe(0);

    await cleanupTestOrganization(
      account.email,
      organization.slug
    );

    expect(
      await countTestOrganizations(
        account.email,
        organization.slug
      )
    ).toBe(0);

    await cleanupTestAccount(account.email);

    expect(
      await countTestAccounts(account.email)
    ).toBe(0);
  }
});

test("rolls back project cleanup when a dependent user prevents account deletion", async ({
  page,
}) => {
  const account = createTestAccount();
  const organization = createTestOrganization(account);
  const project = createTestProject(account);

  let blockerCreated = false;

  try {
    await registerTestAccount(page, account);
    await createOrganizationThroughUI(page, organization);
    await createProjectThroughUI(page, project);

    await page.getByRole("heading", {
      name: project.name,
      exact: true,
    }).click();

    await expect(page).toHaveURL(
      /\/projects\/[0-9a-f-]{36}$/
    );

    await page.getByLabel("New API key name", {
      exact: true,
    }).fill("E2E rollback verification key");

    await page.getByRole("button", {
      name: "Generate API Key",
      exact: true,
    }).click();

    await expect(
      page.getByLabel("New API key", {
        exact: true,
      })
    ).toBeVisible();

    await page.getByRole("button", {
      name: "Done",
      exact: true,
    }).click();

    await addTestCleanupBlocker(
      account.email,
      organization.slug,
      project.slug
    );

    blockerCreated = true;

    const before = await countTestProjectDependencies(
      account.email,
      organization.slug,
      project.slug
    );

    expect(before).toEqual({
      accounts: 1,
      api_keys: 1,
      plan_history: 1,
      users: 1,
    });

    await expect(
      cleanupTestProject(
        account.email,
        organization.slug,
        project.slug
      )
    ).rejects.toMatchObject({
      code: "23503",
      constraint: "users_account_id_fkey",
    });

    expect(
      await countTestProjects(
        account.email,
        organization.slug,
        project.slug
      )
    ).toBe(1);

    expect(
      await countTestProjectDependencies(
        account.email,
        organization.slug,
        project.slug
      )
    ).toEqual(before);

    expect(
      await removeTestCleanupBlocker(
        account.email,
        organization.slug,
        project.slug
      )
    ).toBe(1);

    blockerCreated = false;

    expect(
      await countTestProjectDependencies(
        account.email,
        organization.slug,
        project.slug
      )
    ).toEqual({
      ...before,
      users: 0,
    });

    expect(
      await cleanupTestProject(
        account.email,
        organization.slug,
        project.slug
      )
    ).toBe(1);

    expect(
      await countTestProjects(
        account.email,
        organization.slug,
        project.slug
      )
    ).toBe(0);

  } finally {
    if (blockerCreated) {
      await removeTestCleanupBlocker(
        account.email,
        organization.slug,
        project.slug
      );
    }

    await cleanupTestProject(
      account.email,
      organization.slug,
      project.slug
    );

    expect(
      await countTestProjects(
        account.email,
        organization.slug,
        project.slug
      )
    ).toBe(0);

    await cleanupTestOrganization(
      account.email,
      organization.slug
    );

    expect(
      await countTestOrganizations(
        account.email,
        organization.slug
      )
    ).toBe(0);

    await cleanupTestAccount(account.email);

    expect(
      await countTestAccounts(account.email)
    ).toBe(0);
  }
});
