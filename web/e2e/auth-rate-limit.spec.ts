import { test, expect } from "@playwright/test";
import { betterAuth } from "better-auth";
import { PostgresDialect } from "kysely";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";

const databaseUrl =
  "postgresql://metering_e2e:e2e_local_password_not_for_production@127.0.0.1:5434/usage_metering_e2e";

test("persistent authentication rate limits enforce concurrent requests across instances", async () => {
  const pool = new Pool({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 5000,
    statement_timeout: 10000,
  });

  const origin = "http://localhost:3004";
  const basePath = `/api/rate-limit-test-${randomUUID()}`;

  let verifiedDatabase = false;

  function createAuth() {
    return betterAuth({
      baseURL: origin,
      basePath,
      secret: "e2e-only-rate-limit-secret-not-for-production",
      database: {
        dialect: new PostgresDialect({ pool }),
        type: "postgres",
        schemaName: "auth",
      },
      rateLimit: {
        enabled: true,
        storage: "database",
        window: 60,
        max: 3,
        customRules: {
          "/ok": { window: 60, max: 3 },
        },
      },
      advanced: {
        ipAddress: {
          disableIpTracking: false,
          ipAddressHeaders: [],
          ipv6Subnet: 64,
        },
      },
    });
  }

  try {
    const identity = await pool.query(
      "SELECT current_database() AS db, current_user AS username"
    );

    expect(identity.rows[0]).toEqual({
      db: "usage_metering_e2e",
      username: "metering_e2e",
    });

    verifiedDatabase = true;

    // Use a dedicated test endpoint bucket and require it to be empty.
    const existing = await pool.query(
      `SELECT "key" FROM auth."rateLimit"
       WHERE "key" LIKE '%|/ok'`
    );

    expect(existing.rowCount).toBe(0);

    const first = createAuth();
    const second = createAuth();

    async function request(
      instance: ReturnType<typeof createAuth>,
      ip: string
    ) {
      return instance.handler(
        new Request(`${origin}${basePath}/ok`, {
          headers: {
            "x-forwarded-for": ip,
            "x-real-ip": ip,
          },
        })
      );
    }

    const responses = await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        request(
          index % 2 === 0 ? first : second,
          `192.0.2.${index + 1}`
        )
      )
    );

    const statuses = responses.map(response => response.status);

    expect(statuses.filter(status => status === 200)).toHaveLength(3);
    expect(statuses.filter(status => status === 429)).toHaveLength(5);

    for (const response of responses) {
      if (response.status === 429) {
        expect(
          Number(response.headers.get("x-retry-after"))
        ).toBeGreaterThan(0);
      }
    }

    const stored = await pool.query(
      `SELECT "key", "count" FROM auth."rateLimit"
       WHERE "key" LIKE '%|/ok'`
    );

    expect(stored.rowCount).toBe(1);
    expect(Number(stored.rows[0].count)).toBe(3);

    const third = createAuth();

    expect(
      (await request(third, "198.51.100.1")).status
    ).toBe(429);

    await pool.query(
      `UPDATE auth."rateLimit"
       SET "lastRequest" = $1
       WHERE "key" = $2`,
      [Date.now() - 120_000, stored.rows[0].key]
    );

    expect(
      (await request(third, "198.51.100.2")).status
    ).toBe(200);

  } finally {
    if (verifiedDatabase) {
      await pool.query(
        `DELETE FROM auth."rateLimit"
         WHERE "key" LIKE '%|/ok'`
      );
    }

    await pool.end();
  }
});
