import { expect, test } from "@playwright/test";

import {
  createTestAccount,
  cleanupTestAccount,
  countTestAccounts,
  countTestSessions,
} from "./helpers/auth-test-data";

import {
  findTestEmails,
  readTestEmailLink,
  verifyTestAccountEmail,
  establishTestAccountPassword,
} from "./helpers/auth-email";

test("blocks authentication until email ownership is verified", async ({
  playwright,
  baseURL,
}) => {
  const account = createTestAccount();

  const client = await playwright.request.newContext({
    baseURL,
    extraHTTPHeaders: { origin: baseURL! },
  });

  try {
    const registration = await client.post(
      "/api/auth/sign-up/email",
      { data: account }
    );

    expect(registration.status()).toBe(200);
    expect((await registration.json()).token).toBeNull();

    expect(await countTestAccounts(account.email)).toBe(1);
    expect(await countTestSessions(account.email)).toBe(0);

    const credentials = {
      email: account.email,
      password: account.password,
    };

    const rejected = await client.post(
      "/api/auth/sign-in/email",
      { data: credentials }
    );

    expect(rejected.status()).toBe(403);
    expect((await rejected.json()).code)
      .toBe("EMAIL_NOT_VERIFIED");

    expect(await countTestSessions(account.email)).toBe(0);

    const unauthenticated = await client.get(
      "/api/auth/get-session"
    );

    expect(await unauthenticated.json()).toBeNull();

    await verifyTestAccountEmail(client, account.email);
    await establishTestAccountPassword(
      client, account.email, account.password
    );

    expect(await countTestSessions(account.email)).toBe(0);

    const accepted = await client.post(
      "/api/auth/sign-in/email",
      { data: credentials }
    );

    expect(accepted.status()).toBe(200);

    const session = await client.get("/api/auth/get-session");

    expect(session.status()).toBe(200);

    const body = await session.json();

    expect(body.user.email).toBe(account.email);
    expect(body.user.emailVerified).toBe(true);
    expect(await countTestSessions(account.email)).toBe(1);
  } finally {
    try {
      await client.dispose();
    } finally {
      await cleanupTestAccount(account.email);
    }
  }
});

test("rejects tampered verification tokens without verifying the account", async ({
  playwright,
  baseURL,
}) => {
  const account = createTestAccount();

  const client = await playwright.request.newContext({
    baseURL,
    extraHTTPHeaders: { origin: baseURL! },
  });

  try {
    const registration = await client.post(
      "/api/auth/sign-up/email",
      { data: account }
    );

    expect(registration.status()).toBe(200);

    const { url } = await readTestEmailLink(
      account.email,
      "verification"
    );

    const invalidURL = new URL(url);
    const token = invalidURL.searchParams.get("token");

    expect(token).toBeTruthy();

    invalidURL.searchParams.set(
      "token",
      (token![0] === "a" ? "b" : "a") + token!.slice(1)
    );

    const rejected = await client.get(
      invalidURL.toString(),
      { maxRedirects: 0 }
    );

    if (rejected.status() >= 300 && rejected.status() < 400) {
      const location = rejected.headers()["location"];

      expect(location).toBeTruthy();

      const destination = new URL(location, baseURL);

      expect(destination.origin).toBe(new URL(baseURL!).origin);
      expect(destination.searchParams.has("error")).toBe(true);
    } else {
      expect(rejected.status()).toBeGreaterThanOrEqual(400);
      expect(rejected.status()).toBeLessThan(500);
    }

    const signIn = await client.post(
      "/api/auth/sign-in/email",
      {
        data: {
          email: account.email,
          password: account.password,
        },
      }
    );

    expect(signIn.status()).toBe(403);
    expect((await signIn.json()).code)
      .toBe("EMAIL_NOT_VERIFIED");

    expect(await countTestSessions(account.email)).toBe(0);

    await verifyTestAccountEmail(client, account.email);
    await establishTestAccountPassword(
      client, account.email, account.password
    );

    expect(await countTestSessions(account.email)).toBe(0);

    const accepted = await client.post(
      "/api/auth/sign-in/email",
      {
        data: {
          email: account.email,
          password: account.password,
        },
      }
    );

    expect(accepted.status()).toBe(200);
  } finally {
    try {
      await client.dispose();
    } finally {
      await cleanupTestAccount(account.email);
    }
  }
});

test("verification link replay does not create authenticated sessions", async ({
  playwright,
  baseURL,
}) => {
  const account = createTestAccount();

  const client = await playwright.request.newContext({
    baseURL,
    extraHTTPHeaders: { origin: baseURL! },
  });

  try {
    const registration = await client.post(
      "/api/auth/sign-up/email",
      { data: account }
    );

    expect(registration.status()).toBe(200);

    const { url } = await readTestEmailLink(
      account.email,
      "verification"
    );

    await verifyTestAccountEmail(client, account.email);

    expect(await countTestSessions(account.email)).toBe(0);

    for (let attempt = 0; attempt < 2; attempt++) {
      const replay = await client.get(url, {
        maxRedirects: 0,
      });

      expect(replay.status()).toBeLessThan(500);

      expect(await countTestSessions(account.email)).toBe(0);

      const session = await client.get("/api/auth/get-session");

      expect(session.status()).toBe(200);
      expect(await session.json()).toBeNull();
    }

    expect(await countTestAccounts(account.email)).toBe(1);
  } finally {
    try {
      await client.dispose();
    } finally {
      await cleanupTestAccount(account.email);
    }
  }

  expect(await countTestAccounts(account.email)).toBe(0);
  expect(await findTestEmails(account.email)).toHaveLength(0);
});
