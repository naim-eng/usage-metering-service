import { test, expect } from "@playwright/test";
import {
  createTestAccount,
  countTestAccounts,
  cleanupTestAccount,
} from "./helpers/auth-test-data";
import {
  registerTestAccount,
  submitSignIn,
} from "./helpers/auth-browser";

test("signs in an existing customer with valid credentials", async ({
  page,
  browser,
  baseURL,
}) => {
  const account = createTestAccount();
  const signInContext = await browser.newContext({ baseURL });

  try {
    expect(await countTestAccounts(account.email)).toBe(0);

    await registerTestAccount(page, account);

    expect(await countTestAccounts(account.email)).toBe(1);

    const signInPage = await signInContext.newPage();

    await signInPage.goto("/");

    await expect(signInPage).toHaveURL(/\/sign-in$/);

    await submitSignIn(
      signInPage,
      account.email,
      account.password
    );

    await expect(signInPage)
      .toHaveURL(/\/create-organization$/);

    await expect(
      signInPage.getByRole("heading", {
        name: "Create your organization",
        exact: true,
      })
    ).toBeVisible();

    expect(await countTestAccounts(account.email)).toBe(1);
  } finally {
    try {
      await signInContext.close();
    } finally {
      await cleanupTestAccount(account.email);

      expect(await countTestAccounts(account.email)).toBe(0);
    }
  }
});

test("rejects sign-in with an incorrect password", async ({
  page,
  browser,
  baseURL,
}) => {
  const account = createTestAccount();
  const signInContext = await browser.newContext({ baseURL });

  try {
    await registerTestAccount(page, account);

    expect(await countTestAccounts(account.email)).toBe(1);

    const signInPage = await signInContext.newPage();

    await submitSignIn(
      signInPage,
      account.email,
      `${account.password}-incorrect`
    );

    await expect(
      signInPage.getByRole("alert").filter({
        hasText: /^Invalid email or password\. Please try again\.$/,
      })
    ).toBeVisible();

    await expect(signInPage).toHaveURL(/\/sign-in$/);

    await signInPage.goto("/");

    await expect(signInPage).toHaveURL(/\/sign-in$/);

    const response = await signInPage.request.get(
      "/api/projects",
      { maxRedirects: 0 }
    );

    expect(response.status()).toBe(401);

    expect(await response.json()).toEqual({
      error: "Authentication required",
    });

    expect(await countTestAccounts(account.email)).toBe(1);
  } finally {
    try {
      await signInContext.close();
    } finally {
      await cleanupTestAccount(account.email);

      expect(await countTestAccounts(account.email)).toBe(0);
    }
  }
});

test("rejects sign-in with an unregistered email", async ({
  page,
}) => {
  const account = createTestAccount();

  try {
    expect(await countTestAccounts(account.email)).toBe(0);

    await submitSignIn(
      page,
      account.email,
      account.password
    );

    await expect(
      page.getByRole("alert").filter({
        hasText: /^Invalid email or password\. Please try again\.$/,
      })
    ).toBeVisible();

    await expect(page).toHaveURL(/\/sign-in$/);

    await page.goto("/");

    await expect(page).toHaveURL(/\/sign-in$/);

    const response = await page.request.get(
      "/api/projects",
      { maxRedirects: 0 }
    );

    expect(response.status()).toBe(401);

    expect(await response.json()).toEqual({
      error: "Authentication required",
    });

    expect(await countTestAccounts(account.email)).toBe(0);
  } finally {
    await cleanupTestAccount(account.email);

    expect(await countTestAccounts(account.email)).toBe(0);
  }
});
