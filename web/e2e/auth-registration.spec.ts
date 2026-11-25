import { test, expect } from "@playwright/test";
import {
  createTestAccount,
  countTestAccounts,
  cleanupTestAccount,
} from "./helpers/auth-test-data";

test("registers a new customer and opens organization onboarding", async ({
  page,
}) => {
  const account = createTestAccount();

  try {
    expect(await countTestAccounts(account.email)).toBe(0);

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

    expect(await countTestAccounts(account.email)).toBe(1);

    await page.getByRole("button", {
      name: "Continue to dashboard",
      exact: true,
    }).click();

    await expect(page).toHaveURL(/\/create-organization$/);

    await expect(
      page.getByRole("heading", {
        name: "Create your organization",
        exact: true,
      })
    ).toBeVisible();
  } finally {
    await cleanupTestAccount(account.email);

    expect(await countTestAccounts(account.email)).toBe(0);
  }
});

test("rejects registration with empty required fields", async ({
  page,
}) => {
  await page.goto("/sign-up");

  await page.getByRole("button", {
    name: "Create account",
    exact: true,
  }).click();

  const nameInput = page.getByLabel("Full name", {
    exact: true,
  });

  expect(
    await nameInput.evaluate(
      (input: HTMLInputElement) => input.validity.valueMissing
    )
  ).toBe(true);

  await expect(page).toHaveURL(/\/sign-up$/);

  await expect(
    page.getByRole("heading", {
      name: "Account created",
      exact: true,
    })
  ).toHaveCount(0);
});

test("rejects registration with an invalid email format", async ({
  page,
}) => {
  const account = createTestAccount();

  await page.goto("/sign-up");

  await page.getByLabel("Full name", { exact: true })
    .fill(account.name);

  const emailInput = page.getByLabel("Email address", {
    exact: true,
  });

  await emailInput.fill("invalid-email");

  await page.getByLabel("Password", { exact: true })
    .fill(account.password);

  await page.getByLabel("Confirm password", { exact: true })
    .fill(account.password);

  await page.getByRole("button", {
    name: "Create account",
    exact: true,
  }).click();

  expect(
    await emailInput.evaluate(
      (input: HTMLInputElement) => input.validity.typeMismatch
    )
  ).toBe(true);

  await expect(page).toHaveURL(/\/sign-up$/);

  await expect(
    page.getByRole("heading", {
      name: "Account created",
      exact: true,
    })
  ).toHaveCount(0);
});

test("rejects registration with a short password", async ({
  page,
}) => {
  const account = createTestAccount();

  try {
    await page.goto("/sign-up");

    await page.getByLabel("Full name", { exact: true })
      .fill(account.name);

    await page.getByLabel("Email address", { exact: true })
      .fill(account.email);

    const passwordInput = page.getByLabel("Password", {
      exact: true,
    });

    await passwordInput.fill("Short1!");

    await page.getByLabel("Confirm password", { exact: true })
      .fill("Short1!");

    await page.getByRole("button", {
      name: "Create account",
      exact: true,
    }).click();

    expect(
      await passwordInput.evaluate(
        (input: HTMLInputElement) => input.validity.tooShort
      )
    ).toBe(true);

    await expect(page).toHaveURL(/\/sign-up$/);

    expect(await countTestAccounts(account.email)).toBe(0);
  } finally {
    await cleanupTestAccount(account.email);
  }
});

test("rejects registration when passwords do not match", async ({
  page,
}) => {
  const account = createTestAccount();

  try {
    await page.goto("/sign-up");

    await page.getByLabel("Full name", { exact: true })
      .fill(account.name);

    await page.getByLabel("Email address", { exact: true })
      .fill(account.email);

    await page.getByLabel("Password", { exact: true })
      .fill(account.password);

    await page.getByLabel("Confirm password", { exact: true })
      .fill(`${account.password}-different`);

    await page.getByRole("button", {
      name: "Create account",
      exact: true,
    }).click();

    await expect(
      page.getByRole("alert").filter({
        hasText: /^Passwords do not match\.$/,
      })
    ).toBeVisible();

    await expect(page).toHaveURL(/\/sign-up$/);

    expect(await countTestAccounts(account.email)).toBe(0);
  } finally {
    await cleanupTestAccount(account.email);
  }
});

test("rejects registration with a whitespace-only name", async ({
  page,
}) => {
  const account = createTestAccount();

  try {
    await page.goto("/sign-up");

    await page.getByLabel("Full name", { exact: true })
      .fill("   ");

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
      page.getByRole("alert").filter({
        hasText: /^Enter a valid name of up to 100 characters\.$/,
      })
    ).toBeVisible();

    await expect(page).toHaveURL(/\/sign-up$/);

    expect(await countTestAccounts(account.email)).toBe(0);
  } finally {
    await cleanupTestAccount(account.email);
  }
});

test("rejects duplicate email registration", async ({
  page,
  browser,
}) => {
  const account = createTestAccount();
  const duplicateContext = await browser.newContext();

  try {
    expect(await countTestAccounts(account.email)).toBe(0);

    await page.goto("/sign-up");

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

    expect(await countTestAccounts(account.email)).toBe(1);

    const duplicatePage = await duplicateContext.newPage();
    const duplicatePassword = `${account.password}-duplicate`;

    await duplicatePage.goto("http://localhost:3004/sign-up");

    await duplicatePage.getByLabel("Full name", { exact: true })
      .fill("Duplicate Registration Tester");

    await duplicatePage.getByLabel("Email address", { exact: true })
      .fill(account.email);

    await duplicatePage.getByLabel("Password", { exact: true })
      .fill(duplicatePassword);

    await duplicatePage.getByLabel("Confirm password", { exact: true })
      .fill(duplicatePassword);

    const responsePromise = duplicatePage.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/auth/sign-up/email" &&
        response.request().method() === "POST"
    );

    await duplicatePage.getByRole("button", {
      name: "Create account",
      exact: true,
    }).click();

    const response = await responsePromise;

    expect(response.status()).toBeGreaterThanOrEqual(400);
    expect(response.status()).toBeLessThan(500);

    await expect(
      duplicatePage.getByRole("alert").filter({
        hasText: /\S/,
      })
    ).toBeVisible();

    await expect(
      duplicatePage.getByRole("heading", {
        name: "Account created",
        exact: true,
      })
    ).toHaveCount(0);

    expect(await countTestAccounts(account.email)).toBe(1);

    await duplicatePage.goto("http://localhost:3004/");

    await expect(duplicatePage).toHaveURL(/\/sign-in$/);

    await page.goto("/");

    await expect(page).toHaveURL(/\/create-organization$/);
  } finally {
    try {
      await duplicateContext.close();
    } finally {
      await cleanupTestAccount(account.email);

      expect(await countTestAccounts(account.email)).toBe(0);
    }
  }
});
