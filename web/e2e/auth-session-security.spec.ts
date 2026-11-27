import {
  test,
  expect,
  type APIRequestContext,
} from "@playwright/test";

import { Client } from "pg";

import {
  createTestAccount,
  cleanupTestAccount,
} from "./helpers/auth-test-data";

import {
  verifyTestAccountEmail,
  establishTestAccountPassword,
} from "./helpers/auth-email";

async function register(
  client: APIRequestContext,
  account: ReturnType<typeof createTestAccount>
) {
  const response = await client.post(
    "/api/auth/sign-up/email",
    {
      data: {
        name: account.name,
        email: account.email,
        password: account.password,
      },
    }
  );

  expect(response.status()).toBe(200);

  await verifyTestAccountEmail(client, account.email);

  await establishTestAccountPassword(
    client,
    account.email,
    account.password
  );
}

async function signIn(
  client: APIRequestContext,
  account: ReturnType<typeof createTestAccount>
) {
  const response = await client.post(
    "/api/auth/sign-in/email",
    {
      data: {
        email: account.email,
        password: account.password,
      },
    }
  );

  expect(response.status()).toBe(200);

  return response;
}

async function sessionCookie(client: APIRequestContext) {
  const state = await client.storageState();

  const cookie = state.cookies.find(
    (item) => item.name.endsWith(".session_token")
  );

  expect(cookie).toBeDefined();

  return cookie!;
}

test("session cookies enforce explicit security attributes and fixed expiration", async ({
  playwright,
  baseURL,
}) => {
  const account = createTestAccount();

  const client = await playwright.request.newContext({
    baseURL,
    extraHTTPHeaders: { origin: baseURL! },
  });

  try {
    await register(client, account);

    const started = Math.floor(Date.now() / 1000);
    const response = await signIn(client, account);
    const cookie = await sessionCookie(client);

    expect(cookie.httpOnly).toBe(true);
    expect(cookie.sameSite).toBe("Lax");
    expect(cookie.path).toBe("/");
    expect(cookie.domain).toBe(new URL(baseURL!).hostname);

    // The isolated E2E environment uses HTTP.
    expect(cookie.secure).toBe(false);

    expect(cookie.expires).toBeGreaterThanOrEqual(
      started + 86400 - 10
    );

    expect(cookie.expires).toBeLessThanOrEqual(
      started + 86400 + 10
    );

    const header = response.headersArray().find(
      (item) =>
        item.name.toLowerCase() === "set-cookie" &&
        item.value.startsWith(`${cookie.name}=`)
    );

    expect(header).toBeDefined();
    expect(header!.value).not.toMatch(/;\s*domain=/i);

    const session = await client.get("/api/auth/get-session");

    expect(session.status()).toBe(200);

    const body = await session.json();

    const expiresAt = Date.parse(body.session.expiresAt);
    const createdAt = Date.parse(body.session.createdAt);

    expect(expiresAt - createdAt).toBeGreaterThanOrEqual(
      86400000 - 10000
    );

    expect(expiresAt - createdAt).toBeLessThanOrEqual(
      86400000 + 10000
    );

    const repeated = await client.get("/api/auth/get-session");

    expect(repeated.status()).toBe(200);

    expect(
      (await repeated.json()).session.expiresAt
    ).toBe(body.session.expiresAt);

    expect(
      (await sessionCookie(client)).expires
    ).toBe(cookie.expires);
  } finally {
    try {
      await client.dispose();
    } finally {
      await cleanupTestAccount(account.email);
    }
  }
});

test("expired server-side sessions cannot authenticate or renew", async ({
  playwright,
  baseURL,
}) => {
  const account = createTestAccount();

  const client = await playwright.request.newContext({
    baseURL,
    extraHTTPHeaders: { origin: baseURL! },
  });

  const database = new Client({
    connectionString:
      "postgresql://metering_e2e:e2e_local_password_not_for_production@127.0.0.1:5434/usage_metering_e2e",
    connectionTimeoutMillis: 5000,
    statement_timeout: 10000,
  });

  try {
    await database.connect();

    const identity = await database.query(
      "SELECT current_database() AS db, current_user AS role"
    );

    expect(identity.rows[0].db).toBe("usage_metering_e2e");
    expect(identity.rows[0].role).toBe("metering_e2e");

    await register(client, account);
    await signIn(client, account);

    const active = await client.get("/api/auth/get-session");

    expect(active.status()).toBe(200);

    const body = await active.json();

    expect(body.session.id).toBeTruthy();

    const expiredCookie = await sessionCookie(client);

    const expired = await database.query(
      `UPDATE auth.session
       SET "expiresAt" = NOW() - INTERVAL '1 hour'
       WHERE id = $1
         AND "userId" = (
           SELECT id FROM auth."user" WHERE email = $2
         )`,
      [body.session.id, account.email]
    );

    expect(expired.rowCount).toBe(1);

    const rejected = await client.get("/api/auth/get-session");

    expect(rejected.status()).toBe(200);
    expect(await rejected.json()).toBeNull();

    const repeated = await client.get("/api/auth/get-session", {
      headers: {
        cookie: `${expiredCookie.name}=${expiredCookie.value}`,
      },
    });

    expect(repeated.status()).toBe(200);
    expect(await repeated.json()).toBeNull();

    const remaining = await database.query(
      `SELECT id FROM auth.session
       WHERE id = $1 AND "expiresAt" > NOW()`,
      [body.session.id]
    );

    expect(remaining.rowCount).toBe(0);

    await signIn(client, account);

    const renewed = await client.get("/api/auth/get-session");

    expect(renewed.status()).toBe(200);

    expect(
      (await renewed.json()).session.id
    ).not.toBe(body.session.id);
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
});

test("fresh authentication does not reuse supplied or revoked session tokens", async ({
  playwright,
  baseURL,
}) => {
  const account = createTestAccount();

  const options = {
    baseURL,
    extraHTTPHeaders: { origin: baseURL! },
  };

  const client = await playwright.request.newContext(options);
  const replay = await playwright.request.newContext(options);

  try {
    await register(client, account);
    await signIn(client, account);

    const previous = await sessionCookie(client);

    const logout = await client.post("/api/auth/sign-out");

    expect(logout.status()).toBe(200);

    const revoked = await replay.get(
      "/api/auth/get-session",
      {
        headers: {
          cookie: `${previous.name}=${previous.value}`,
        },
      }
    );

    expect(revoked.status()).toBe(200);
    expect(await revoked.json()).toBeNull();

    const authenticated = await replay.post(
      "/api/auth/sign-in/email",
      {
        headers: {
          cookie: `${previous.name}=${previous.value}`,
        },
        data: {
          email: account.email,
          password: account.password,
        },
      }
    );

    expect(authenticated.status()).toBe(200);

    const fresh = await sessionCookie(replay);

    expect(fresh.value).not.toBe(previous.value);

    const active = await replay.get("/api/auth/get-session");

    expect(active.status()).toBe(200);
    expect((await active.json()).user.email).toBe(account.email);

    const old = await client.get("/api/auth/get-session", {
      headers: {
        cookie: `${previous.name}=${previous.value}`,
      },
    });

    expect(old.status()).toBe(200);
    expect(await old.json()).toBeNull();
  } finally {
    try {
      await Promise.all([
        client.dispose(),
        replay.dispose(),
      ]);
    } finally {
      await cleanupTestAccount(account.email);
    }
  }
});

test("stale sessions cannot perform sensitive password changes", async ({
  playwright,
  baseURL,
}) => {
  const account = createTestAccount();
  const replacement = `${account.password}-replacement`;

  const client = await playwright.request.newContext({
    baseURL,
    extraHTTPHeaders: { origin: baseURL! },
  });

  const database = new Client({
    connectionString:
      "postgresql://metering_e2e:e2e_local_password_not_for_production@127.0.0.1:5434/usage_metering_e2e",
    connectionTimeoutMillis: 5000,
    statement_timeout: 10000,
  });

  try {
    await database.connect();

    const identity = await database.query(
      "SELECT current_database() AS db, current_user AS role"
    );

    expect(identity.rows[0].db).toBe("usage_metering_e2e");
    expect(identity.rows[0].role).toBe("metering_e2e");

    await register(client, account);
    await signIn(client, account);

    const active = await client.get("/api/auth/get-session");

    expect(active.status()).toBe(200);

    const body = await active.json();

    const originalCookie = await sessionCookie(client);

    const aged = await database.query(
      `UPDATE auth.session
       SET "createdAt" = NOW() - INTERVAL '20 minutes',
           "updatedAt" = NOW() - INTERVAL '20 minutes'
       WHERE id = $1
         AND "userId" = (
           SELECT id FROM auth."user" WHERE email = $2
         )`,
      [body.session.id, account.email]
    );

    expect(aged.rowCount).toBe(1);

    const ordinary = await client.get("/api/auth/get-session");

    expect(ordinary.status()).toBe(200);
    const ordinaryBody = await ordinary.json();

    expect(ordinaryBody.user.email).toBe(account.email);
    expect(ordinaryBody.session.expiresAt).toBe(body.session.expiresAt);
    expect((await sessionCookie(client)).expires).toBe(
      originalCookie.expires
    );

    const persisted = await database.query(
      `SELECT "expiresAt" FROM auth.session
       WHERE id = $1
         AND "userId" = (
           SELECT id FROM auth."user" WHERE email = $2
         )`,
      [body.session.id, account.email]
    );

    expect(persisted.rowCount).toBe(1);
    expect(new Date(persisted.rows[0].expiresAt).getTime()).toBe(
      Date.parse(body.session.expiresAt)
    );

    const rejected = await client.post(
      "/api/auth/change-password",
      {
        data: {
          currentPassword: account.password,
          newPassword: replacement,
          revokeOtherSessions: true,
        },
      }
    );

    expect(rejected.status()).toBeGreaterThanOrEqual(400);
    expect(rejected.status()).toBeLessThan(500);
    expect(rejected.status()).not.toBe(429);

    await client.post("/api/auth/sign-out");

    await signIn(client, account);

    const accepted = await client.post(
      "/api/auth/change-password",
      {
        data: {
          currentPassword: account.password,
          newPassword: replacement,
          revokeOtherSessions: true,
        },
      }
    );

    expect(accepted.status()).toBe(200);
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
});

test("revoking other sessions preserves only the current session", async ({
  playwright,
  baseURL,
}) => {
  const account = createTestAccount();

  const options = {
    baseURL,
    extraHTTPHeaders: { origin: baseURL! },
  };

  const current = await playwright.request.newContext(options);
  const otherA = await playwright.request.newContext(options);
  const otherB = await playwright.request.newContext(options);

  try {
    await register(current, account);

    for (const client of [current, otherA, otherB]) {
      await signIn(client, account);

      const active = await client.get("/api/auth/get-session");

      expect(active.status()).toBe(200);
      expect((await active.json()).user.email).toBe(account.email);
    }

    const before = await current.get("/api/auth/get-session");
    const original = await before.json();

    const revoked = await current.post(
      "/api/auth/revoke-other-sessions"
    );

    expect(revoked.status()).toBe(200);

    for (const client of [otherA, otherB]) {
      const rejected = await client.get("/api/auth/get-session");

      expect(rejected.status()).toBe(200);
      expect(await rejected.json()).toBeNull();
    }

    const preserved = await current.get("/api/auth/get-session");

    expect(preserved.status()).toBe(200);

    const remaining = await preserved.json();

    expect(remaining.user.email).toBe(account.email);
    expect(remaining.session.id).toBe(original.session.id);

    const logout = await current.post("/api/auth/sign-out");

    expect(logout.status()).toBe(200);

    const ended = await current.get("/api/auth/get-session");

    expect(ended.status()).toBe(200);
    expect(await ended.json()).toBeNull();
  } finally {
    try {
      await Promise.all([
        current.dispose(),
        otherA.dispose(),
        otherB.dispose(),
      ]);
    } finally {
      await cleanupTestAccount(account.email);
    }
  }
});
