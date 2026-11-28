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

test("switches between two customer workspaces", async ({
  page,
}) => {
  const account = createTestAccount();

  const first = createTestOrganization(account);
  const second = createTestOrganization(account, 2);

  try {
    await registerTestAccount(page, account);

    await createOrganizationThroughUI(page, first);

    await expect(
      page.getByRole("heading", {
        name: first.name,
        exact: true,
      })
    ).toBeVisible();

    await expect(
      page.getByLabel("Active workspace", {
        exact: true,
      })
    ).toHaveCount(0);

    await createOrganizationThroughUI(page, second);

    await expect(
      page.getByRole("heading", {
        name: second.name,
        exact: true,
      })
    ).toBeVisible();

    const switcher = page.getByLabel("Active workspace", {
      exact: true,
    });

    await expect(switcher).toBeVisible();

    await expect(
      switcher.locator("option")
    ).toHaveCount(2);

    await expect(
      switcher.locator("option:checked")
    ).toHaveText(second.name);

    await switcher.selectOption({
      label: first.name,
    });

    await expect(
      page.getByRole("heading", {
        name: first.name,
        exact: true,
      })
    ).toBeVisible();

    await expect(
      switcher.locator("option:checked")
    ).toHaveText(first.name);

    await page.reload();

    await expect(
      page.getByRole("heading", {
        name: first.name,
        exact: true,
      })
    ).toBeVisible();

    await expect(
      switcher.locator("option:checked")
    ).toHaveText(first.name);

    await switcher.selectOption({
      label: second.name,
    });

    await expect(
      page.getByRole("heading", {
        name: second.name,
        exact: true,
      })
    ).toBeVisible();

    await expect(
      switcher.locator("option:checked")
    ).toHaveText(second.name);

    for (const organization of [first, second]) {
      expect(
        await countTestOrganizations(
          account.email,
          organization.slug
        )
      ).toBe(1);
    }
  } finally {
    for (const organization of [second, first]) {
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
    }

    await cleanupTestAccount(account.email);

    expect(
      await countTestAccounts(account.email)
    ).toBe(0);
  }
});

test("selects a workspace when no organization is active", async ({
  page,
}) => {
  const account = createTestAccount();
  const first = createTestOrganization(account);
  const second = createTestOrganization(account, 2);

  try {
    await registerTestAccount(page, account);

    await createOrganizationThroughUI(page, first);
    await createOrganizationThroughUI(page, second);

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

    expect(
      clearResponse.status(),
      `Workspace clearing response: ${await clearResponse.text()}`
    ).toBe(200);
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
        name: "Select your workspace",
        exact: true,
      })
    ).toBeVisible();

    const firstButton = page.getByRole("button", {
      name: `${first.name} ${first.slug}`,
      exact: true,
    });

    const secondButton = page.getByRole("button", {
      name: `${second.name} ${second.slug}`,
      exact: true,
    });

    await expect(firstButton).toBeEnabled();
    await expect(secondButton).toBeEnabled();

    await firstButton.click();

    await expect(
      page.getByRole("heading", {
        name: first.name,
        exact: true,
      })
    ).toBeVisible();

    const switcher = page.getByLabel("Active workspace", {
      exact: true,
    });

    await expect(
      switcher.locator("option:checked")
    ).toHaveText(first.name);

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
        name: first.name,
        exact: true,
      })
    ).toBeVisible();

    await expect(
      switcher.locator("option:checked")
    ).toHaveText(first.name);

    await expect(
      page.getByRole("heading", {
        name: "Select your workspace",
        exact: true,
      })
    ).toHaveCount(0);

  } finally {
    for (const organization of [second, first]) {
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
    }

    await cleanupTestAccount(account.email);

    expect(
      await countTestAccounts(account.email)
    ).toBe(0);
  }
});
