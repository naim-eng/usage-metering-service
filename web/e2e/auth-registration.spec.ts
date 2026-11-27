import { verifyTestAccountEmail, establishTestAccountPassword } from "./helpers/auth-email";
import { test, expect } from "@playwright/test";
import {
  createTestAccount,
  countTestAccounts,
  countTestSessions,
  cleanupTestAccount,
} from "./helpers/auth-test-data";
import { submitSignIn } from "./helpers/auth-browser";

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
        name: "Registration submitted",
        exact: true,
      })
    ).toBeVisible();

    expect(await countTestAccounts(account.email)).toBe(1);

    await page.getByRole("button", {
      name: "Continue to sign in",
      exact: true,
    }).click();

    await expect(page).toHaveURL(/\/sign-in$/);
    expect(await countTestSessions(account.email)).toBe(0);

    await verifyTestAccountEmail(page.request, account.email);
    await establishTestAccountPassword(page.request, account.email, account.password);

    await submitSignIn(page, account.email, account.password);

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
      name: "Registration submitted",
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
      name: "Registration submitted",
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

test("returns generic confirmation for duplicate email registration", async ({
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
        name: "Registration submitted",
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

    expect(response.status()).toBe(200);
    expect((await response.json()).token).toBeNull();
    expect(await countTestSessions(account.email)).toBe(0);

    await expect(
      duplicatePage.locator('main [role="alert"]')
    ).toHaveCount(0);

    await expect(
      duplicatePage.getByRole("heading", {
        name: "Registration submitted",
        exact: true,
      })
    ).toBeVisible();

    expect(await countTestAccounts(account.email)).toBe(1);

    await duplicatePage.goto("http://localhost:3004/");

    await expect(duplicatePage).toHaveURL(/\/sign-in$/);

    await page.goto("/");

    await expect(page).toHaveURL(/\/sign-in$/);
    expect(await countTestSessions(account.email)).toBe(0);

    await verifyTestAccountEmail(page.request, account.email);
    await establishTestAccountPassword(page.request, account.email, account.password);

    await submitSignIn(page, account.email, account.password);

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

test("new and duplicate registrations return equivalent public responses", async ({
  playwright,
  baseURL,
}) => {
  const account = createTestAccount();

  const first = await playwright.request.newContext({
    baseURL,
    extraHTTPHeaders: { origin: baseURL! },
  });

  const second = await playwright.request.newContext({
    baseURL,
    extraHTTPHeaders: { origin: baseURL! },
  });

  try {
    expect(await countTestAccounts(account.email)).toBe(0);

    const original = await first.post(
      "/api/auth/sign-up/email",
      { data: account }
    );

    const duplicate = await second.post(
      "/api/auth/sign-up/email",
      { data: account }
    );

    expect(original.status()).toBe(200);
    expect(duplicate.status()).toBe(original.status());

    const originalBody = await original.json();
    const duplicateBody = await duplicate.json();

    expect(Object.keys(duplicateBody).sort())
      .toEqual(Object.keys(originalBody).sort());

    expect(originalBody.token).toBeNull();
    expect(duplicateBody.token).toBeNull();

    expect(Object.keys(duplicateBody.user).sort())
      .toEqual(Object.keys(originalBody.user).sort());

    expect(duplicateBody.user.email)
      .toBe(originalBody.user.email);

    expect(duplicateBody.user.emailVerified)
      .toBe(originalBody.user.emailVerified);

    expect(await countTestAccounts(account.email)).toBe(1);
    expect(await countTestSessions(account.email)).toBe(0);

    expect(
      (await first.get("/api/auth/get-session")).status()
    ).toBe(200);

    expect(
      await (await first.get("/api/auth/get-session")).json()
    ).toBeNull();

    expect(
      await (await second.get("/api/auth/get-session")).json()
    ).toBeNull();

    expect((await first.get("/api/projects")).status())
      .toBe(401);

    expect((await second.get("/api/projects")).status())
      .toBe(401);
  } finally {
    try {
      await first.dispose();
      await second.dispose();
    } finally {
      await cleanupTestAccount(account.email);
      expect(await countTestAccounts(account.email)).toBe(0);
    }
  }
});

test("invalid credentials and unknown accounts return identical authentication errors", async ({
  request,
  baseURL,
}) => {
  const existing = createTestAccount();
  const unknown = createTestAccount();

  try {
    expect(await countTestAccounts(unknown.email)).toBe(0);

    const registration = await request.post(
      "/api/auth/sign-up/email",
      {
        headers: { origin: baseURL! },
        data: existing,
      }
    );

    expect(registration.status()).toBe(200);

    const incorrectPassword = existing.password + "-incorrect";

    const incorrect = await request.post(
      "/api/auth/sign-in/email",
      {
        headers: { origin: baseURL! },
        data: {
          email: existing.email,
          password: incorrectPassword,
        },
      }
    );

    const nonexistent = await request.post(
      "/api/auth/sign-in/email",
      {
        headers: { origin: baseURL! },
        data: {
          email: unknown.email,
          password: incorrectPassword,
        },
      }
    );

    expect(incorrect.status()).toBe(401);
    expect(nonexistent.status()).toBe(incorrect.status());

    const incorrectBody = await incorrect.json();
    const nonexistentBody = await nonexistent.json();

    expect(incorrectBody.code)
      .toBe("INVALID_EMAIL_OR_PASSWORD");

    expect(nonexistentBody).toEqual(incorrectBody);

    expect(await countTestSessions(existing.email)).toBe(0);
    expect(await countTestSessions(unknown.email)).toBe(0);
    expect(await countTestAccounts(unknown.email)).toBe(0);

    expect((await request.get("/api/projects")).status())
      .toBe(401);
  } finally {
    await cleanupTestAccount(existing.email);
    await cleanupTestAccount(unknown.email);
  }
});
