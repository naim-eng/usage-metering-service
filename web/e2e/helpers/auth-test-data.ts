import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { cleanupTestEmails } from "./auth-email";

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

  const deletedCount = await withE2EDatabase(async (client) => {
    const result = await client.query(
      `DELETE FROM auth."user"
       WHERE email = $1`,
      [email]
    );

    return result.rowCount ?? 0;
  });

  await cleanupTestEmails(email);

  return deletedCount;
}

export type TestOrganization = {
  name: string;
  slug: string;
};

export function createTestOrganization(
  account: TestAccount,
  index = 1
): TestOrganization {
  assertTestEmail(account.email);

  if (!Number.isInteger(index) || index < 1 || index > 99) {
    throw new Error("Invalid E2E organization index.");
  }

  const baseSlug = account.email.split("@")[0]
    .replace(/^e2e-auth-/, "e2e-org-");

  const slug =
    index === 1 ? baseSlug : `${baseSlug}-${index}`;

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

  const suffix = slug.slice(expectedSlug.length);

  const isAdditionalOrganization =
    slug.startsWith(expectedSlug) &&
    /^-(?:[2-9]|[1-9][0-9])$/.test(suffix);

  if (slug !== expectedSlug && !isAdditionalOrganization) {
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

export type TestProject = {
  name: string;
  slug: string;
};

export function createTestProject(
  account: TestAccount
): TestProject {
  assertTestEmail(account.email);

  const customerId = account.email
    .split("@")[0]
    .replace(/^e2e-auth-/, "");

  const slug = `e2e-project-${customerId}-${randomUUID()}`;

  return {
    name: slug,
    slug,
  };
}

function assertTestProject(
  email: string,
  slug: string
): void {
  assertTestEmail(email);

  const customerId = email
    .split("@")[0]
    .replace(/^e2e-auth-/, "");

  const prefix = `e2e-project-${customerId}-`;

  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

  if (
    !slug.startsWith(prefix) ||
    !uuidPattern.test(slug.slice(prefix.length))
  ) {
    throw new Error(
      "Refusing database operation for an unrelated project."
    );
  }
}

export async function countTestProjects(
  email: string,
  organizationSlug: string,
  projectSlug: string
): Promise<number> {
  assertTestOrganization(email, organizationSlug);
  assertTestProject(email, projectSlug);

  return withE2EDatabase(async (client) => {
    const result = await client.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count
       FROM public.projects AS project
       JOIN auth."organization" AS organization
         ON organization.id = project.organization_id
       WHERE organization.slug = $1
         AND project.slug = $2`,
      [organizationSlug, projectSlug]
    );

    return result.rows[0].count;
  });
}

export async function cleanupTestProject(
  email: string,
  organizationSlug: string,
  projectSlug: string
): Promise<number> {
  assertTestOrganization(email, organizationSlug);
  assertTestProject(email, projectSlug);

  return withE2EDatabase(async (client) => {
    await client.query("BEGIN");

    try {
      const result = await client.query<{
        id: string;
        metering_account_id: string | null;
      }>(
        `SELECT project.id, project.metering_account_id
         FROM public.projects AS project
         JOIN auth."organization" AS organization
           ON organization.id = project.organization_id
         JOIN auth."member" AS member
           ON member."organizationId" = organization.id
         JOIN auth."user" AS customer
           ON customer.id = member."userId"
         WHERE organization.slug = $1
           AND project.slug = $2
           AND customer.email = $3
           AND member.role = 'owner'
         FOR UPDATE OF project`,
        [organizationSlug, projectSlug, email]
      );

      if (result.rows.length === 0) {
        await client.query("COMMIT");
        return 0;
      }

      if (result.rows.length !== 1) {
        throw new Error(
          "Unexpected project ownership records."
        );
      }

      const project = result.rows[0];

      await client.query(
        `DELETE FROM public.project_api_keys
         WHERE project_id = $1`,
        [project.id]
      );

      const deleted = await client.query(
        `DELETE FROM public.projects
         WHERE id = $1`,
        [project.id]
      );

      if (project.metering_account_id !== null) {
        await client.query(
          `DELETE FROM public.plan_limit_history
           WHERE account_id = $1`,
          [project.metering_account_id]
        );

        await client.query(
          `DELETE FROM public.accounts
           WHERE id = $1`,
          [project.metering_account_id]
        );
      }

      await client.query("COMMIT");

      return deleted.rowCount ?? 0;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}

export async function setTestOrganizationOwnerRole(
  email: string,
  organizationSlug: string,
  role: "owner" | "admin" | "member",
  expectedRole: "owner" | "admin" | "member" =
    role === "owner" ? "member" : "owner"
): Promise<void> {
  assertTestOrganization(email, organizationSlug);

  const validRoles = ["owner", "admin", "member"];

  if (
    !validRoles.includes(role) ||
    !validRoles.includes(expectedRole) ||
    role === expectedRole
  ) {
    throw new Error("Invalid E2E membership role transition.");
  }

  await withE2EDatabase(async (client) => {
    await client.query("BEGIN");

    try {
      const membership = await client.query<{
        id: string;
        role: string;
      }>(
        `SELECT member.id, member.role
         FROM auth."member" AS member
         JOIN auth."organization" AS organization
           ON organization.id = member."organizationId"
         JOIN auth."user" AS customer
           ON customer.id = member."userId"
         WHERE organization.slug = $1
           AND customer.email = $2
         FOR UPDATE OF member`,
        [organizationSlug, email]
      );

      if (
        membership.rows.length !== 1 ||
        membership.rows[0].role !== expectedRole
      ) {
        throw new Error(
          "Expected exactly one E2E membership with the expected role."
        );
      }

      const result = await client.query(
        `UPDATE auth."member"
         SET role = $2
         WHERE id = $1
           AND role = $3`,
        [membership.rows[0].id, role, expectedRole]
      );

      if (result.rowCount !== 1) {
        throw new Error(
          "Expected exactly one E2E membership role update."
        );
      }

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}

async function resolveOwnedTestProject(
  client: Client,
  email: string,
  organizationSlug: string,
  projectSlug: string
): Promise<{ id: string; accountId: string }> {
  assertTestOrganization(email, organizationSlug);
  assertTestProject(email, projectSlug);

  const result = await client.query<{
    id: string;
    account_id: string;
  }>(
    `SELECT
       project.id,
       project.metering_account_id AS account_id
     FROM public.projects AS project
     JOIN auth."organization" AS organization
       ON organization.id = project.organization_id
     JOIN auth."member" AS member
       ON member."organizationId" = organization.id
     JOIN auth."user" AS customer
       ON customer.id = member."userId"
     WHERE organization.slug = $1
       AND project.slug = $2
       AND customer.email = $3
       AND member.role = 'owner'
       AND project.metering_account_id IS NOT NULL`,
    [organizationSlug, projectSlug, email]
  );

  if (result.rows.length !== 1) {
    throw new Error("Expected exactly one owned E2E project.");
  }

  return {
    id: result.rows[0].id,
    accountId: result.rows[0].account_id,
  };
}

export async function addTestCleanupBlocker(
  email: string,
  organizationSlug: string,
  projectSlug: string
): Promise<void> {
  await withE2EDatabase(async (client) => {
    const project = await resolveOwnedTestProject(
      client,
      email,
      organizationSlug,
      projectSlug
    );

    const result = await client.query(
      `INSERT INTO public.users (
         account_id,
         external_user_id,
         plan_id
       )
       SELECT $1, $2, id
       FROM public.plans
       WHERE id = 3
         AND plan_type = 'user'
         AND owner_account_id IS NULL`,
      [project.accountId, `cleanup-blocker-${project.id}`]
    );

    if (result.rowCount !== 1) {
      throw new Error("Expected exactly one E2E cleanup blocker.");
    }
  });
}

export async function removeTestCleanupBlocker(
  email: string,
  organizationSlug: string,
  projectSlug: string
): Promise<number> {
  return withE2EDatabase(async (client) => {
    const project = await resolveOwnedTestProject(
      client,
      email,
      organizationSlug,
      projectSlug
    );

    const result = await client.query(
      `DELETE FROM public.users
       WHERE account_id = $1
         AND external_user_id = $2`,
      [project.accountId, `cleanup-blocker-${project.id}`]
    );

    return result.rowCount ?? 0;
  });
}

export async function countTestProjectDependencies(
  email: string,
  organizationSlug: string,
  projectSlug: string
): Promise<{
  accounts: number;
  api_keys: number;
  plan_history: number;
  users: number;
}> {
  return withE2EDatabase(async (client) => {
    const project = await resolveOwnedTestProject(
      client,
      email,
      organizationSlug,
      projectSlug
    );

    const result = await client.query<{
      accounts: number;
      api_keys: number;
      plan_history: number;
      users: number;
    }>(
      `SELECT
         (SELECT COUNT(*)::int
          FROM public.accounts
          WHERE id = $2) AS accounts,
         (SELECT COUNT(*)::int
          FROM public.project_api_keys
          WHERE project_id = $1) AS api_keys,
         (SELECT COUNT(*)::int
          FROM public.plan_limit_history
          WHERE account_id = $2) AS plan_history,
         (SELECT COUNT(*)::int
          FROM public.users
          WHERE account_id = $2) AS users`,
      [project.id, project.accountId]
    );

    return result.rows[0];
  });
}

type RemovedTestMembership = {
  id: string;
  organizationId: string;
  userId: string;
  role: string;
  createdAt: Date;
};

export async function removeTestOrganizationMembership(
  email: string,
  organizationSlug: string
): Promise<RemovedTestMembership> {
  assertTestOrganization(email, organizationSlug);

  return withE2EDatabase(async (client) => {
    await client.query("BEGIN");

    try {
      const membership = await client.query<RemovedTestMembership>(
        `SELECT
           member.id,
           member."organizationId",
           member."userId",
           member.role,
           member."createdAt"
         FROM auth."member" AS member
         JOIN auth."organization" AS organization
           ON organization.id = member."organizationId"
         JOIN auth."user" AS customer
           ON customer.id = member."userId"
         WHERE organization.slug = $1
           AND customer.email = $2
         FOR UPDATE OF member`,
        [organizationSlug, email]
      );

      if (
        membership.rows.length !== 1 ||
        membership.rows[0].role !== "owner"
      ) {
        throw new Error(
          "Expected exactly one E2E owner membership."
        );
      }

      const original = membership.rows[0];

      const deleted = await client.query(
        `DELETE FROM auth."member"
         WHERE id = $1
           AND "organizationId" = $2
           AND "userId" = $3
           AND role = 'owner'`,
        [
          original.id,
          original.organizationId,
          original.userId,
        ]
      );

      if (deleted.rowCount !== 1) {
        throw new Error(
          "Expected exactly one E2E membership removal."
        );
      }

      await client.query("COMMIT");

      return original;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}

export async function restoreTestOrganizationMembership(
  email: string,
  organizationSlug: string,
  membership: RemovedTestMembership
): Promise<void> {
  assertTestOrganization(email, organizationSlug);

  if (membership.role !== "owner") {
    throw new Error(
      "Refusing to restore a non-owner E2E membership."
    );
  }

  await withE2EDatabase(async (client) => {
    await client.query("BEGIN");

    try {
      const restored = await client.query(
        `INSERT INTO auth."member" (
           id,
           "organizationId",
           "userId",
           role,
           "createdAt"
         )
         SELECT
           $1,
           organization.id,
           customer.id,
           'owner',
           $6
         FROM auth."organization" AS organization
         CROSS JOIN auth."user" AS customer
         WHERE organization.slug = $2
           AND customer.email = $3
           AND organization.id = $4
           AND customer.id = $5
           AND NOT EXISTS (
             SELECT 1
             FROM auth."member" AS existing
             WHERE existing."organizationId" = organization.id
               AND existing."userId" = customer.id
           )`,
        [
          membership.id,
          organizationSlug,
          email,
          membership.organizationId,
          membership.userId,
          membership.createdAt,
        ]
      );

      if (restored.rowCount !== 1) {
        throw new Error(
          "Expected exactly one E2E membership restoration."
        );
      }

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}

export async function readTestPasswordHash(
  email: string
): Promise<string> {
  assertTestEmail(email);

  return withE2EDatabase(async (client) => {
    const result = await client.query<{
      password: string | null;
    }>(
      `SELECT account.password
       FROM auth."account" AS account
       JOIN auth."user" AS customer
         ON customer.id = account."userId"
       WHERE customer.email = $1
         AND account."providerId" = 'credential'`,
      [email]
    );

    if (
      result.rows.length !== 1 ||
      typeof result.rows[0].password !== "string" ||
      result.rows[0].password.length === 0
    ) {
      throw new Error(
        "Expected exactly one E2E password credential."
      );
    }

    return result.rows[0].password;
  });
}

export async function replaceTestPasswordWithLegacyHash(
  email: string,
  legacyHash: string
): Promise<void> {
  assertTestEmail(email);

  if (
    legacyHash.length !== 161 ||
    !/^[0-9a-f]{32}:[0-9a-f]{128}$/.test(legacyHash)
  ) {
    throw new Error("Invalid legacy E2E password hash.");
  }

  await withE2EDatabase(async (client) => {
    await client.query("BEGIN");

    try {
      const result = await client.query(
        `UPDATE auth."account" AS account
         SET password = $2,
             "updatedAt" = CURRENT_TIMESTAMP
         FROM auth."user" AS customer
         WHERE account."userId" = customer.id
           AND account."accountId" = customer.id
           AND customer.email = $1
           AND account."providerId" = 'credential'`,
        [email, legacyHash]
      );

      if (result.rowCount !== 1) {
        throw new Error(
          "Expected exactly one E2E credential update."
        );
      }

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}
