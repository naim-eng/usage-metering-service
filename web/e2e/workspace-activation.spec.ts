import { test, expect } from "@playwright/test";
import {
  createTestAccount,
  createTestOrganization,
  countTestAccounts,
  countTestOrganizations,
  cleanupTestOrganization,
  cleanupTestAccount,
} from "./helpers/auth-test-data";
import {
  registerTestAccount,
  createOrganizationThroughUI,
} from "./helpers/auth-browser";

test("creates and activates a customer workspace", async ({
  page,
}) => {
  const account = createTestAccount();
  const organization = createTestOrganization(account);

  try {
    expect(await countTestAccounts(account.email)).toBe(0);

    expect(
      await countTestOrganizations(
        account.email,
        organization.slug
      )
    ).toBe(0);

    await registerTestAccount(page, account);

    await createOrganizationThroughUI(page, organization);

    await expect(
      page.getByRole("heading", {
        name: organization.name,
        exact: true,
      })
    ).toBeVisible();

    await expect(
      page.getByText("Workspace overview", {
        exact: true,
      })
    ).toBeVisible();

    expect(
      await countTestOrganizations(
        account.email,
        organization.slug
      )
    ).toBe(1);

    const response = await page.request.get(
      "/api/projects",
      { maxRedirects: 0 }
    );

    expect(response.status()).toBe(200);

    await page.reload();

    await expect(
      page.getByRole("heading", {
        name: organization.name,
        exact: true,
      })
    ).toBeVisible();

    await expect(
      page.getByRole("button", {
        name: "Sign out",
        exact: true,
      })
    ).toBeVisible();
  } finally {
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

test("automatically activates the only available workspace", async ({
  page,
}) => {
  const account = createTestAccount();
  const organization = createTestOrganization(account);

  try {
    await registerTestAccount(page, account);
    await createOrganizationThroughUI(page, organization);

    const clearResponse = await page.request.post(
      "/api/auth/organization/set-active",
      {
        data: { organizationId: null },
        headers: {
          Origin: new URL(page.url()).origin,
        },
        maxRedirects: 0,
      }
    );

    expect(clearResponse.status()).toBe(200);
    expect(await clearResponse.json()).toBeNull();

    const blockedResponse = await page.request.get(
      "/api/projects",
      { maxRedirects: 0 }
    );

    expect(blockedResponse.status()).toBe(403);

    expect(await blockedResponse.json()).toEqual({
      error: "Select an organization first",
    });

    await page.goto("/");

    await expect(
      page.getByRole("heading", {
        name: organization.name,
        exact: true,
      })
    ).toBeVisible();

    await expect(
      page.getByText("Workspace overview", {
        exact: true,
      })
    ).toBeVisible();

    await expect(
      page.getByRole("heading", {
        name: "Select your workspace",
        exact: true,
      })
    ).toHaveCount(0);

    const authorizedResponse = await page.request.get(
      "/api/projects",
      { maxRedirects: 0 }
    );

    expect(authorizedResponse.status()).toBe(200);

    expect(await authorizedResponse.json()).toEqual({
      projects: [],
    });

    await page.reload();

    await expect(
      page.getByRole("heading", {
        name: organization.name,
        exact: true,
      })
    ).toBeVisible();

    expect(
      await countTestOrganizations(
        account.email,
        organization.slug
      )
    ).toBe(1);
  } finally {
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
