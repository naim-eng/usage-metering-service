import { Client } from "pg";
import { test, expect, request } from "@playwright/test";
import { randomUUID } from "node:crypto";

import {
  createTestAccount,
  cleanupTestAccount,
  countTestSessions,
} from "./helpers/auth-test-data";

import {
  verifyTestAccountEmail,
  readTestEmailLink,
  establishTestAccountPassword,
  cleanupTestEmails,
} from "./helpers/auth-email";

test("email verification invalidates the original registration credential", async ({
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
    expect(await countTestSessions(account.email)).toBe(1);
  } finally {
    try {
      await client.dispose();
    } finally {
      await cleanupTestAccount(account.email);
    }
  }
});

test("password reset rejects invalid and consumed tokens and revokes existing sessions", async ({
  baseURL,
}) => {
  const account = createTestAccount();
  const replacement = `Recovery-${randomUUID()}!`;
  const replayPassword = `Replay-${randomUUID()}!`;

  const options = {
    baseURL,
    extraHTTPHeaders: { origin: baseURL! },
  };

  const client = await request.newContext(options);
  const sessionA = await request.newContext(options);
  const sessionB = await request.newContext(options);

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

    await verifyTestAccountEmail(client, account.email);

    await establishTestAccountPassword(
      client,
      account.email,
      account.password
    );

    for (const session of [sessionA, sessionB]) {
      const signedIn = await session.post(
        "/api/auth/sign-in/email",
        {
          data: {
            email: account.email,
            password: account.password,
          },
        }
      );

      expect(signedIn.status()).toBe(200);
    }

    expect(await countTestSessions(account.email)).toBe(2);

    const requested = await client.post(
      "/api/auth/request-password-reset",
      {
        data: {
          email: account.email,
          redirectTo: "/reset-password",
        },
      }
    );

    expect(requested.status()).toBe(200);

    const { url } = await readTestEmailLink(
      account.email,
      "password-reset"
    );

    const callback = await client.get(url, {
      maxRedirects: 0,
    });

    expect(callback.status()).toBeGreaterThanOrEqual(300);
    expect(callback.status()).toBeLessThan(400);

    const location = callback.headers()["location"];
    expect(location).toBeTruthy();

    const destination = new URL(location, baseURL);

    expect(destination.origin).toBe(new URL(baseURL!).origin);
    expect(destination.pathname).toBe("/reset-password");
    expect(destination.searchParams.has("error")).toBe(false);

    const token = destination.searchParams.get("token");
    expect(token).toBeTruthy();

    const invalid = await client.post(
      "/api/auth/reset-password",
      {
        data: {
          token: `${token}-invalid`,
          newPassword: replacement,
        },
      }
    );

    expect(invalid.status()).toBeGreaterThanOrEqual(400);
    expect(invalid.status()).toBeLessThan(500);
    expect(invalid.status()).not.toBe(429);
    expect(await countTestSessions(account.email)).toBe(2);

    const reset = await client.post(
      "/api/auth/reset-password",
      {
        data: {
          token,
          newPassword: replacement,
        },
      }
    );

    expect(reset.status()).toBe(200);
    expect(await countTestSessions(account.email)).toBe(0);

    for (const session of [sessionA, sessionB]) {
      const result = await session.get("/api/auth/get-session");

      expect(result.status()).toBe(200);
      expect(await result.json()).toBeNull();
    }

    const replay = await client.post(
      "/api/auth/reset-password",
      {
        data: {
          token,
          newPassword: replayPassword,
        },
      }
    );

    expect(replay.status()).toBeGreaterThanOrEqual(400);
    expect(replay.status()).toBeLessThan(500);
    expect(replay.status()).not.toBe(429);

    for (const password of [
      account.password,
      replayPassword,
    ]) {
      const rejected = await client.post(
        "/api/auth/sign-in/email",
        {
          data: {
            email: account.email,
            password,
          },
        }
      );

      expect(rejected.status()).toBe(401);
    }

    expect(await countTestSessions(account.email)).toBe(0);

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

    await cleanupTestEmails(account.email);
  } finally {
    try {
      await Promise.all([
        client.dispose(),
        sessionA.dispose(),
        sessionB.dispose(),
      ]);
    } finally {
      await cleanupTestAccount(account.email);
    }
  }
});


test("expired password reset tokens cannot change credentials", async ({
  baseURL,
}) => {
  const account = createTestAccount();
  const replacement = `Expired-${randomUUID()}!`;

  const client = await request.newContext({
    baseURL,
    extraHTTPHeaders: { origin: baseURL! },
  });

  const database = new Client({
    connectionString:
      "postgresql://metering_e2e:e2e_local_password_not_for_production@127.0.0.1:5434/usage_metering_e2e",
    connectionTimeoutMillis: 5000,
    statement_timeout: 10000,
  });

  let identifier: string | undefined;
  let connected = false;
  let databaseVerified = false;

  try {
    await database.connect();
    connected = true;

    const identity = await database.query(
      "SELECT current_database() AS db, current_user AS role"
    );

    expect(identity.rows[0].db).toBe("usage_metering_e2e");
    expect(identity.rows[0].role).toBe("metering_e2e");

    databaseVerified = true;

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

    await verifyTestAccountEmail(client, account.email);

    await establishTestAccountPassword(
      client,
      account.email,
      account.password
    );

    const requested = await client.post(
      "/api/auth/request-password-reset",
      {
        data: {
          email: account.email,
          redirectTo: "/reset-password",
        },
      }
    );

    expect(requested.status()).toBe(200);

    const { url } = await readTestEmailLink(
      account.email,
      "password-reset"
    );

    const token = decodeURIComponent(
      new URL(url).pathname.split("/").pop()!
    );

    expect(token).toBeTruthy();

    const expired = await database.query(
      `UPDATE auth.verification
       SET "expiresAt" = NOW() - INTERVAL '1 hour'
       WHERE identifier = $1
         AND value = (
           SELECT id FROM auth."user" WHERE email = $2
         )
       RETURNING identifier`,
      [`reset-password:${token}`, account.email]
    );

    expect(expired.rowCount).toBe(1);
    identifier = expired.rows[0].identifier;

    const rejected = await client.post(
      "/api/auth/reset-password",
      {
        data: {
          token,
          newPassword: replacement,
        },
      }
    );

    expect(rejected.status()).toBeGreaterThanOrEqual(400);
    expect(rejected.status()).toBeLessThan(500);
    expect(rejected.status()).not.toBe(429);

    expect(await countTestSessions(account.email)).toBe(0);

    const invalid = await client.post(
      "/api/auth/sign-in/email",
      {
        data: {
          email: account.email,
          password: replacement,
        },
      }
    );

    expect(invalid.status()).toBe(401);

    const valid = await client.post(
      "/api/auth/sign-in/email",
      {
        data: {
          email: account.email,
          password: account.password,
        },
      }
    );

    expect(valid.status()).toBe(200);
  } finally {
    try {
      if (connected && databaseVerified && identifier) {
        await database.query(
          `DELETE FROM auth.verification
           WHERE identifier = $1
             AND value = (
               SELECT id FROM auth."user" WHERE email = $2
             )`,
          [identifier, account.email]
        );
      }
    } finally {
      try {
        await database.end();
      } finally {
        try {
          await client.dispose();
        } finally {
          await cleanupTestAccount(account.email);
        }
      }
    }
  }
});
