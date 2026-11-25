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

test("preserves an authenticated session after page refresh", async ({
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

    await submitSignIn(
      signInPage,
      account.email,
      account.password
    );

    await expect(signInPage)
      .toHaveURL(/\/create-organization$/);

    await signInPage.reload();

    await expect(signInPage)
      .toHaveURL(/\/create-organization$/);

    await expect(
      signInPage.getByRole("heading", {
        name: "Create your organization",
        exact: true,
      })
    ).toBeVisible();

    await signInPage.reload();

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

test("preserves an authenticated session across protected routes", async ({
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
      account.password
    );

    await expect(signInPage)
      .toHaveURL(/\/create-organization$/);

    const protectedRoutes = [
      "/",
      "/projects",
      "/projects/00000000-0000-4000-8000-000000000001",
      "/create-organization",
    ];

    for (const route of protectedRoutes) {
      await signInPage.goto(route);

      await expect(signInPage)
        .toHaveURL(/\/create-organization$/);

      await expect(
        signInPage.getByRole("heading", {
          name: "Create your organization",
          exact: true,
        })
      ).toBeVisible();
    }

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

test("shares authentication across tabs but not independent browser contexts", async ({
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
      account.password
    );

    await expect(signInPage)
      .toHaveURL(/\/create-organization$/);

    const secondTab = await signInContext.newPage();

    await secondTab.goto("/");

    await expect(secondTab)
      .toHaveURL(/\/create-organization$/);

    await expect(
      secondTab.getByRole("heading", {
        name: "Create your organization",
        exact: true,
      })
    ).toBeVisible();

    const independentContext = await browser.newContext({
      baseURL,
    });

    try {
      const independentPage = await independentContext.newPage();

      await independentPage.goto("/");

      await expect(independentPage)
        .toHaveURL(/\/sign-in$/);

      const response = await independentPage.request.get(
        "/api/projects",
        { maxRedirects: 0 }
      );

      expect(response.status()).toBe(401);

      expect(await response.json()).toEqual({
        error: "Authentication required",
      });
    } finally {
      await independentContext.close();
    }

    await signInPage.reload();

    await expect(signInPage)
      .toHaveURL(/\/create-organization$/);

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
