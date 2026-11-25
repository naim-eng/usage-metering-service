import { test, expect } from "@playwright/test";
import {
  createTestAccount,
  createTestOrganization,
  countTestAccounts,
  countTestOrganizations,
  countTestSessions,
  cleanupTestOrganization,
  cleanupTestAccount,
} from "./helpers/auth-test-data";
import {
  registerTestAccount,
  createOrganizationThroughUI,
} from "./helpers/auth-browser";

test("signs out a customer and invalidates the previous session", async ({
  page,
  browser,
  baseURL,
}) => {
  const account = createTestAccount();
  const organization = createTestOrganization(account);

  const replayContext = await browser.newContext({
    baseURL,
  });

  try {
    expect(
      await countTestAccounts(account.email)
    ).toBe(0);

    expect(
      await countTestOrganizations(
        account.email,
        organization.slug
      )
    ).toBe(0);

    expect(
      await countTestSessions(account.email)
    ).toBe(0);

    await registerTestAccount(page, account);

    expect(
      await countTestAccounts(account.email)
    ).toBe(1);

    expect(
      await countTestSessions(account.email)
    ).toBe(1);

    await createOrganizationThroughUI(
      page,
      organization
    );

    expect(
      await countTestOrganizations(
        account.email,
        organization.slug
      )
    ).toBe(1);

    await expect.poll(async () => {
      const response = await page.request.get(
        "/api/projects",
        { maxRedirects: 0 }
      );

      return response.status();
    }).toBe(200);

    const previousCookies =
      await page.context().cookies();

    expect(previousCookies.length)
      .toBeGreaterThan(0);

    await replayContext.addCookies(previousCookies);

    const authenticatedResponse =
      await replayContext.request.get(
        "/api/projects",
        { maxRedirects: 0 }
      );

    expect(
      authenticatedResponse.status()
    ).toBe(200);

    await page.getByRole("button", {
      name: "Sign out",
      exact: true,
    }).click();

    await expect(page).toHaveURL(
      /\/sign-in$/
    );

    await expect(
      page.getByRole("heading", {
        name: "Welcome back",
        exact: true,
      })
    ).toBeVisible();

    await expect.poll(
      () => countTestSessions(account.email)
    ).toBe(0);

    const protectedRoutes = [
      "/",
      "/projects",
      "/projects/00000000-0000-4000-8000-000000000001",
      "/create-organization",
    ];

    for (const route of protectedRoutes) {
      await page.goto(route);

      await expect(page).toHaveURL(
        /\/sign-in$/
      );
    }

    const signedOutResponse =
      await page.request.get(
        "/api/projects",
        { maxRedirects: 0 }
      );

    expect(
      signedOutResponse.status()
    ).toBe(401);

    expect(
      await signedOutResponse.json()
    ).toEqual({
      error: "Authentication required",
    });

    const replayResponse =
      await replayContext.request.get(
        "/api/projects",
        { maxRedirects: 0 }
      );

    expect(
      replayResponse.status()
    ).toBe(401);

    expect(
      await replayResponse.json()
    ).toEqual({
      error: "Authentication required",
    });

    const replayPage =
      await replayContext.newPage();

    await replayPage.goto("/");

    await expect(replayPage).toHaveURL(
      /\/sign-in$/
    );

    expect(
      await countTestAccounts(account.email)
    ).toBe(1);

    expect(
      await countTestOrganizations(
        account.email,
        organization.slug
      )
    ).toBe(1);

    expect(
      await countTestSessions(account.email)
    ).toBe(0);
  } finally {
    try {
      await replayContext.close();
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

      expect(
        await countTestSessions(account.email)
      ).toBe(0);
    }
  }
});
