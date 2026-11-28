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

test("displays the dashboard for a newly created project", async ({
  page,
}) => {
  const account = createTestAccount();
  const organization = createTestOrganization(account);
  const project = createTestProject(account);

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

    await expect(
      page.getByRole("heading", {
        name: project.name,
        exact: true,
      })
    ).toBeVisible();

    const expectedMetrics = [
      { label: "Monthly limit", value: "100", description: "Starter" },
      { label: "Credits consumed", value: "0", description: "Current monthly usage" },
      { label: "Credits remaining", value: "100", description: "Available account credits" },
      { label: "Maximum per request", value: "20", description: "Account request limit" },
    ];

    async function verifyQuotaMetrics() {
      for (const metric of expectedMetrics) {
        const card = page
          .getByText(metric.label, { exact: true })
          .locator("..");

        await expect(card).toBeVisible();

        await expect(
          card.getByText(metric.value, { exact: true })
        ).toBeVisible();

        await expect(
          card.getByText(metric.description, { exact: true })
        ).toBeVisible();
      }
    }

    await verifyQuotaMetrics();

    await expect(
      page.getByLabel("Reporting month", {
        exact: true,
      })
    ).toBeVisible();

    for (const message of [
      "No registered users yet.",
      "No API requests recorded yet.",
      "No low-credit notifications recorded.",
    ]) {
      await expect(
        page.getByText(message, { exact: true })
      ).toBeVisible();
    }

    await expect(
      page.getByRole("button", {
        name: "Previous",
        exact: true,
      })
    ).toBeDisabled();

    await expect(
      page.getByRole("button", {
        name: "Next",
        exact: true,
      })
    ).toBeDisabled();

    await page.reload();

    await verifyQuotaMetrics();

    await page.getByRole("link", {
      name: "Back to Projects",
      exact: true,
    }).click();

    await expect(page).toHaveURL(/\/projects$/);

    await expect(
      page.getByRole("heading", {
        name: project.name,
        exact: true,
      })
    ).toBeVisible();
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
