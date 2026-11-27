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

test("preserves original credentials after duplicate registration", async ({
  page,
  browser,
  baseURL,
}) => {
  const account = createTestAccount();
  const replacementPassword =
    `${account.password}-replacement`;

  const duplicateContext =
    await browser.newContext({ baseURL });

  try {
    expect(
      await countTestAccounts(account.email)
    ).toBe(0);

    await registerTestAccount(page, account);

    expect(
      await countTestAccounts(account.email)
    ).toBe(1);

    const duplicatePage =
      await duplicateContext.newPage();

    await duplicatePage.goto("/sign-up");

    await duplicatePage.getByLabel("Full name", {
      exact: true,
    }).fill("Duplicate Credential Tester");

    await duplicatePage.getByLabel("Email address", {
      exact: true,
    }).fill(account.email);

    await duplicatePage.getByLabel("Password", {
      exact: true,
    }).fill(replacementPassword);

    await duplicatePage.getByLabel("Confirm password", {
      exact: true,
    }).fill(replacementPassword);

    const responsePromise =
      duplicatePage.waitForResponse(
        (response) =>
          new URL(response.url()).pathname ===
            "/api/auth/sign-up/email" &&
          response.request().method() === "POST"
      );

    await duplicatePage.getByRole("button", {
      name: "Create account",
      exact: true,
    }).click();

    const response = await responsePromise;

    expect(response.status()).toBe(200);
    expect((await response.json()).token).toBeNull();

    await expect(
      duplicatePage.getByRole("heading", {
        name: "Registration submitted",
        exact: true,
      })
    ).toBeVisible();

    expect(
      (await duplicatePage.request.get("/api/projects")).status()
    ).toBe(401);

    expect(
      await countTestAccounts(account.email)
    ).toBe(1);

    const replacementContext =
      await browser.newContext({ baseURL });

    try {
      const replacementPage =
        await replacementContext.newPage();

      await submitSignIn(
        replacementPage,
        account.email,
        replacementPassword
      );

      await expect(
        replacementPage.getByRole("alert").filter({
          hasText:
            /^Invalid email or password\. Please try again\.$/,
        })
      ).toBeVisible();

      await expect(replacementPage).toHaveURL(
        /\/sign-in$/
      );

      const unauthorizedResponse =
        await replacementPage.request.get(
          "/api/projects",
          { maxRedirects: 0 }
        );

      expect(
        unauthorizedResponse.status()
      ).toBe(401);

      expect(
        await unauthorizedResponse.json()
      ).toEqual({
        error: "Authentication required",
      });
    } finally {
      await replacementContext.close();
    }

    const originalContext =
      await browser.newContext({ baseURL });

    try {
      const originalPage =
        await originalContext.newPage();

      await submitSignIn(
        originalPage,
        account.email,
        account.password
      );

      await expect(originalPage).toHaveURL(
        /\/create-organization$/
      );

      await expect(
        originalPage.getByRole("heading", {
          name: "Create your organization",
          exact: true,
        })
      ).toBeVisible();

      expect(
        await countTestAccounts(account.email)
      ).toBe(1);
    } finally {
      await originalContext.close();
    }
  } finally {
    try {
      await duplicateContext.close();
    } finally {
      await cleanupTestAccount(account.email);

      expect(
        await countTestAccounts(account.email)
      ).toBe(0);
    }
  }
});
