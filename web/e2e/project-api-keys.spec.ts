import { test, expect } from "@playwright/test";
import {
  createTestAccount,
  createTestOrganization,
  createTestProject,
  countTestAccounts,
  countTestOrganizations,
  countTestProjects,
  cleanupTestProject,
  cleanupTestOrganization,
  cleanupTestAccount,
} from "./helpers/auth-test-data";
import {
  registerTestAccount,
  createOrganizationThroughUI,
  createProjectThroughUI,
} from "./helpers/auth-browser";

test("generates and revokes a project API key", async ({
  page,
}) => {
  const account = createTestAccount();
  const organization = createTestOrganization(account);
  const project = createTestProject(account);

  const keyName = "E2E lifecycle key";

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
    }).fill(keyName);

    await page.getByRole("button", {
      name: "Generate API Key",
      exact: true,
    }).click();

    const plaintextKey = page.getByLabel("New API key", {
      exact: true,
    });

    await expect(plaintextKey).toBeVisible();

    const apiKey = await plaintextKey.inputValue();

    expect(/^um_[0-9a-f]{64}$/.test(apiKey)).toBe(true);

    const activeResponse = await page.request.get(
      "http://127.0.0.1:3003/account",
      {
        headers: {
          "X-API-Key": apiKey,
        },
        maxRedirects: 0,
      }
    );

    expect(activeResponse.status()).toBe(200);

    await expect(
      page.getByRole("button", {
        name: "Generate API Key",
        exact: true,
      })
    ).toBeDisabled();

    await page.getByRole("button", {
      name: "Done",
      exact: true,
    }).click();

    await expect(plaintextKey).toHaveCount(0);

    await expect(
      page.getByText(keyName, { exact: true })
    ).toBeVisible();

    await page.reload();

    await expect(
      page.getByText(keyName, { exact: true })
    ).toBeVisible();

    await expect(plaintextKey).toHaveCount(0);

    const revokeButton = page.getByRole("button", {
      name: "Revoke",
      exact: true,
    });

    await expect(revokeButton).toHaveCount(1);

    page.once("dialog", async (dialog) => {
      await dialog.accept();
    });

    await revokeButton.click();

    await expect(
      page.getByText(
        `API key "${keyName}" was revoked.`,
        { exact: true }
      )
    ).toBeVisible();

    await expect(
      page.getByText("Revoked", { exact: true })
    ).toBeVisible();

    await expect(revokeButton).toHaveCount(0);

    const revokedResponse = await page.request.get(
      "http://127.0.0.1:3003/account",
      {
        headers: {
          "X-API-Key": apiKey,
        },
        maxRedirects: 0,
      }
    );

    expect(revokedResponse.status()).toBe(401);

    expect(await revokedResponse.json()).toEqual({
      error: "Invalid API key",
    });

    await page.reload();

    await expect(
      page.getByText(keyName, { exact: true })
    ).toBeVisible();

    await expect(
      page.getByText("Revoked", { exact: true })
    ).toBeVisible();

    await expect(revokeButton).toHaveCount(0);
    await expect(plaintextKey).toHaveCount(0);
  } finally {
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
