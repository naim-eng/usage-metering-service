import { test, expect } from "@playwright/test";

const protectedRoutes = [
  "/",
  "/projects",
  "/projects/00000000-0000-4000-8000-000000000001",
  "/create-organization",
];

for (const route of protectedRoutes) {
  test(`unauthenticated access to ${route} redirects to sign-in`, async ({
    page,
  }) => {
    await page.goto(route);

    await expect(page).toHaveURL(/\/sign-in(?:\?.*)?$/);
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
  });
}
