import { test, expect, request } from "@playwright/test";
import { createHmac, randomUUID } from "node:crypto";

import {
  createTestAccount,
  cleanupTestAccount,
  countTestSessions,
} from "./helpers/auth-test-data";

import {
  readTestEmailLink,
  verifyTestAccountEmail,
  establishTestAccountPassword,
  findTestEmails,
} from "./helpers/auth-email";

test("expired verification tokens cannot activate accounts", async ({
  baseURL,
}) => {
  const account = createTestAccount();

  const client = await request.newContext({
    baseURL,
    extraHTTPHeaders: { origin: baseURL! },
  });

  try {
    const registration = await client.post(
      "/api/auth/sign-up/email",
      {
        data: {
          name: account.name,
          email: account.email,
          password: account.password,
        },
      }
    );

    expect(registration.status()).toBe(200);

    const { url } = await readTestEmailLink(
      account.email,
      "verification"
    );

    const expiredURL = new URL(url);
    const token = expiredURL.searchParams.get("token")!;
    const [header, payload, signature] = token.split(".");

    const secret =
      "e2e-only-auth-secret-not-for-production-2026";

    const sign = (value: string) =>
      createHmac("sha256", secret)
        .update(value)
        .digest("base64url");

    expect(sign(`${header}.${payload}`)).toBe(signature);

    const claims = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8")
    );

    const now = Math.floor(Date.now() / 1000);

    claims.iat = now - 7200;
    claims.exp = now - 3600;

    const expiredPayload = Buffer.from(
      JSON.stringify(claims)
    ).toString("base64url");

    const unsigned = `${header}.${expiredPayload}`;

    expiredURL.searchParams.set(
      "token",
      `${unsigned}.${sign(unsigned)}`
    );

    const expired = await client.get(
      expiredURL.toString(),
      { maxRedirects: 0 }
    );

    if (expired.status() >= 300 && expired.status() < 400) {
      const destination = new URL(
        expired.headers()["location"],
        baseURL
      );

      expect(destination.origin).toBe(new URL(baseURL!).origin);
      expect(destination.searchParams.get("error")).toBeTruthy();
    } else {
      expect(expired.status()).toBeGreaterThanOrEqual(400);
      expect(expired.status()).toBeLessThan(500);
    }

    const blocked = await client.post(
      "/api/auth/sign-in/email",
      {
        data: {
          email: account.email,
          password: account.password,
        },
      }
    );

    expect(blocked.status()).toBe(403);
    expect((await blocked.json()).code).toBe(
      "EMAIL_NOT_VERIFIED"
    );

    expect(await countTestSessions(account.email)).toBe(0);

    await verifyTestAccountEmail(client, account.email);
    await establishTestAccountPassword(
      client,
      account.email,
      account.password
    );
  } finally {
    try {
      await client.dispose();
    } finally {
      await cleanupTestAccount(account.email);
    }
  }
});

test("verification resend responses do not disclose account existence", async ({
  baseURL,
}) => {
  const account = createTestAccount();
  const unknown = createTestAccount();

  const client = await request.newContext({
    baseURL,
    extraHTTPHeaders: { origin: baseURL! },
  });

  try {
    const registration = await client.post(
      "/api/auth/sign-up/email",
      {
        data: {
          name: account.name,
          email: account.email,
          password: account.password,
        },
      }
    );

    expect(registration.status()).toBe(200);

    await readTestEmailLink(account.email, "verification");

    const initial = await findTestEmails(account.email);

    async function resend(email: string) {
      return client.post(
        "/api/auth/send-verification-email",
        {
          data: {
            email,
            callbackURL: "/forgot-password",
          },
        }
      );
    }

    const existing = await resend(account.email);
    const missing = await resend(unknown.email);

    expect(existing.status()).toBe(200);
    expect(missing.status()).toBe(200);

    const response = await existing.json();

    expect(await missing.json()).toEqual(response);

    await expect.poll(async () =>
      (await findTestEmails(account.email)).length
    ).toBe(initial.length + 1);

    expect(await findTestEmails(unknown.email)).toHaveLength(0);

    await verifyTestAccountEmail(client, account.email);

    const verified = await resend(account.email);

    expect(verified.status()).toBe(200);
    expect(await verified.json()).toEqual(response);
    expect(await findTestEmails(account.email)).toHaveLength(0);
    expect(await countTestSessions(account.email)).toBe(0);
  } finally {
    try {
      await client.dispose();
    } finally {
      await cleanupTestAccount(account.email);
      await cleanupTestAccount(unknown.email);
    }
  }
});

test("concurrent verification cannot preserve the original credential", async ({
  baseURL,
}) => {
  const account = createTestAccount();
  const replacement = `Owner-${randomUUID()}!`;

  const client = await request.newContext({
    baseURL,
    extraHTTPHeaders: { origin: baseURL! },
  });

  try {
    const registration = await client.post(
      "/api/auth/sign-up/email",
      {
        data: {
          name: account.name,
          email: account.email,
          password: account.password,
        },
      }
    );

    expect(registration.status()).toBe(200);

    const { url } = await readTestEmailLink(
      account.email,
      "verification"
    );

    const responses = await Promise.all(
      Array.from({ length: 3 }, () =>
        client.get(url, { maxRedirects: 0 })
      )
    );

    for (const response of responses) {
      expect(response.status()).toBeGreaterThanOrEqual(200);
      expect(response.status()).toBeLessThan(400);

      if (response.status() >= 300) {
        const location = response.headers()["location"];
        expect(location).toBeTruthy();

        const destination = new URL(location, baseURL);

        expect(destination.origin).toBe(
          new URL(baseURL!).origin
        );
        expect(destination.searchParams.has("error")).toBe(false);
      }
    }

    await verifyTestAccountEmail(client, account.email);

    const original = await client.post(
      "/api/auth/sign-in/email",
      {
        data: {
          email: account.email,
          password: account.password,
        },
      }
    );

    expect(original.status()).toBe(401);
    expect(await countTestSessions(account.email)).toBe(0);

    await establishTestAccountPassword(
      client,
      account.email,
      replacement
    );

    const replays = await Promise.all(
      Array.from({ length: 3 }, () =>
        client.get(url, { maxRedirects: 0 })
      )
    );

    for (const replay of replays) {
      expect(replay.status()).toBeLessThan(500);
    }

    expect(await countTestSessions(account.email)).toBe(0);

    const rejected = await client.post(
      "/api/auth/sign-in/email",
      {
        data: {
          email: account.email,
          password: account.password,
        },
      }
    );

    expect(rejected.status()).toBe(401);

    const accepted = await client.post(
      "/api/auth/sign-in/email",
      {
        data: {
          email: account.email,
          password: replacement,
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
