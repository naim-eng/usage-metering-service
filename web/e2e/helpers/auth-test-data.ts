import { randomUUID } from "node:crypto";
import { Client } from "pg";

const E2E_DATABASE_URL =
  "postgresql://metering_e2e:e2e_local_password_not_for_production@127.0.0.1:5434/usage_metering_e2e";

const TEST_EMAIL_PATTERN =
  /^e2e-auth-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}@example\.test$/;

export type TestAccount = {
  name: string;
  email: string;
  password: string;
};

export function createTestAccount(): TestAccount {
  return {
    name: "E2E Authentication Tester",
    email: `e2e-auth-${randomUUID()}@example.test`,
    password: `E2e-${randomUUID()}!`,
  };
}

function assertTestEmail(email: string): void {
  if (!TEST_EMAIL_PATTERN.test(email)) {
    throw new Error(
      "Refusing database operation for a non-E2E email address."
    );
  }
}

async function withE2EDatabase<T>(
  operation: (client: Client) => Promise<T>
): Promise<T> {
  const client = new Client({
    connectionString: E2E_DATABASE_URL,
    connectionTimeoutMillis: 5000,
    statement_timeout: 10000,
  });

  try {
    await client.connect();

    const identity = await client.query<{
      database: string;
      username: string;
    }>(
      `SELECT
        current_database() AS database,
        current_user AS username`
    );

    const database = identity.rows[0];

    if (
      database?.database !== "usage_metering_e2e" ||
      database?.username !== "metering_e2e"
    ) {
      throw new Error(
        "Refusing operation against a non-E2E database."
      );
    }

    return await operation(client);
  } finally {
    await client.end();
  }
}

export async function countTestAccounts(
  email: string
): Promise<number> {
  assertTestEmail(email);

  return withE2EDatabase(async (client) => {
    const result = await client.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count
       FROM auth."user"
       WHERE email = $1`,
      [email]
    );

    return result.rows[0].count;
  });
}

export async function cleanupTestAccount(
  email: string
): Promise<number> {
  assertTestEmail(email);

  return withE2EDatabase(async (client) => {
    const result = await client.query(
      `DELETE FROM auth."user"
       WHERE email = $1`,
      [email]
    );

    return result.rowCount ?? 0;
  });
}

export type TestOrganization = {
  name: string;
  slug: string;
};

export function createTestOrganization(
  account: TestAccount
): TestOrganization {
  assertTestEmail(account.email);

  const slug = account.email.split("@")[0]
    .replace(/^e2e-auth-/, "e2e-org-");

  return {
    name: slug,
    slug,
  };
}

function assertTestOrganization(
  email: string,
  slug: string
): void {
  assertTestEmail(email);

  const expectedSlug = email.split("@")[0]
    .replace(/^e2e-auth-/, "e2e-org-");

  if (slug !== expectedSlug) {
    throw new Error(
      "Refusing database operation for an unrelated organization."
    );
  }
}

export async function countTestOrganizations(
  email: string,
  slug: string
): Promise<number> {
  assertTestOrganization(email, slug);

  return withE2EDatabase(async (client) => {
    const result = await client.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count
       FROM auth."organization"
       WHERE slug = $1`,
      [slug]
    );

    return result.rows[0].count;
  });
}

export async function cleanupTestOrganization(
  email: string,
  slug: string
): Promise<number> {
  assertTestOrganization(email, slug);

  return withE2EDatabase(async (client) => {
    const result = await client.query(
      `DELETE FROM auth."organization" AS organization
       WHERE organization.slug = $1
         AND EXISTS (
           SELECT 1
           FROM auth."member" AS member
           JOIN auth."user" AS customer
             ON customer.id = member."userId"
           WHERE member."organizationId" = organization.id
             AND customer.email = $2
             AND member.role = 'owner'
         )`,
      [slug, email]
    );

    return result.rowCount ?? 0;
  });
}

export async function countTestSessions(
  email: string
): Promise<number> {
  assertTestEmail(email);

  return withE2EDatabase(async (client) => {
    const result = await client.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count
       FROM auth."session" AS session
       JOIN auth."user" AS customer
         ON customer.id = session."userId"
       WHERE customer.email = $1`,
      [email]
    );

    return result.rows[0].count;
  });
}
