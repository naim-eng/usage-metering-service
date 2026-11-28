import { test, expect } from "@playwright/test";

test("sign-in page loads successfully", async ({ page }) => {
  const response = await page.goto("/sign-in");

  expect(response?.status()).toBe(200);

  await expect(page).toHaveURL(/\/sign-in$/);
  await expect(page.locator('input[type="email"]')).toBeVisible();
  await expect(page.locator('input[type="password"]')).toBeVisible();
});

test("sign-up page loads successfully", async ({ page }) => {
  const response = await page.goto("/sign-up");

  expect(response?.status()).toBe(200);

  await expect(page).toHaveURL(/\/sign-up$/);
  await expect(page.locator('input[type="email"]')).toBeVisible();
  await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Confirm password", { exact: true })).toBeVisible();
});
