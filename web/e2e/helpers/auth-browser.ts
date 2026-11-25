import { expect, type Page } from "@playwright/test";
import type { TestAccount } from "./auth-test-data";

export async function registerTestAccount(
  page: Page,
  account: TestAccount
): Promise<void> {
  await page.goto("/sign-up");

  await expect(
    page.getByRole("heading", {
      name: "Create your account",
      exact: true,
    })
  ).toBeVisible();

  await page.getByLabel("Full name", { exact: true })
    .fill(account.name);

  await page.getByLabel("Email address", { exact: true })
    .fill(account.email);

  await page.getByLabel("Password", { exact: true })
    .fill(account.password);

  await page.getByLabel("Confirm password", { exact: true })
    .fill(account.password);

  await page.getByRole("button", {
    name: "Create account",
    exact: true,
  }).click();

  await expect(
    page.getByRole("heading", {
      name: "Account created",
      exact: true,
    })
  ).toBeVisible();
}

export async function submitSignIn(
  page: Page,
  email: string,
  password: string
): Promise<void> {
  await page.goto("/sign-in");

  await expect(
    page.getByRole("heading", {
      name: "Welcome back",
      exact: true,
    })
  ).toBeVisible();

  await page.getByLabel("Email address", { exact: true })
    .fill(email);

  await page.getByLabel("Password", { exact: true })
    .fill(password);

  await page.getByRole("button", {
    name: "Sign in",
    exact: true,
  }).click();
}

export async function createOrganizationThroughUI(
  page: Page,
  organization: { name: string; slug: string }
): Promise<void> {
  await page.goto("/create-organization");

  await expect(page).toHaveURL(
    /\/create-organization$/
  );

  await expect(
    page.getByRole("heading", {
      name: "Create your organization",
      exact: true,
    })
  ).toBeVisible();

  await page.getByLabel("Organization name", {
    exact: true,
  }).fill(organization.name);

  await expect(
    page.getByText(
      `Workspace identifier: ${organization.slug}`,
      { exact: true }
    )
  ).toBeVisible();

  await page.getByRole("button", {
    name: "Create organization",
    exact: true,
  }).click();

  await expect(
    page.getByRole("heading", {
      name: "Organization created!",
      exact: true,
    })
  ).toBeVisible();

  await expect(
    page.getByText(
      `${organization.name} was created successfully.`,
      { exact: true }
    )
  ).toBeVisible();

  await page.getByRole("link", {
    name: "Return to dashboard",
    exact: true,
  }).click();

  await expect(page).toHaveURL(/\/$/);

  await expect(
    page.getByRole("button", {
      name: "Sign out",
      exact: true,
    })
  ).toBeVisible();
}
