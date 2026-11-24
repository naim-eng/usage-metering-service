
import "dotenv/config";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { Client } from "pg";
import { buildPgClientConfig } from "../../src/infrastructure/database/pg-config.js";

const migrationsDirectory = resolve(process.cwd(), "sql");

type Migration = {
  version: string;
  filename: string;
  checksum: string;
  sql: string;
};

function loadMigrations(): Migration[] {
  const filenames = readdirSync(migrationsDirectory)
    .filter((filename) => /^\d{3}_.+\.sql$/.test(filename))
    .sort();

  if (filenames.length === 0) {
    throw new Error("No SQL migrations found.");
  }

  const migrations = filenames.map((filename) => {
    const sql = readFileSync(
      resolve(migrationsDirectory, filename),
      "utf8"
    );

    return {
      version: filename.slice(0, 3),
      filename,
      checksum: createHash("sha256").update(sql).digest("hex"),
      sql,
    };
  });

  const versions = new Set<string>();

  for (const migration of migrations) {
    if (versions.has(migration.version)) {
      throw new Error(
        `Duplicate migration version: ${migration.version}`
      );
    }

    versions.add(migration.version);
  }

  return migrations;
}

function normalizeTransactionWrappers(
  migration: Migration
): string {
  const legacyVersions = new Set([
    "003",
    "004",
    "005",
    "006",
  ]);

  const transactionStatement =
    /^\s*(BEGIN|COMMIT|ROLLBACK)\s*;\s*(?:--.*)?$/i;

  const lines = migration.sql.split("\n");

  const statements = lines
    .map((line) =>
      line.match(transactionStatement)?.[1]?.toUpperCase()
    )
    .filter(
      (statement): statement is string =>
        Boolean(statement)
    );

  if (!legacyVersions.has(migration.version)) {
    if (statements.length > 0) {
      throw new Error(
        `Migration ${migration.filename} contains explicit transaction statements.`
      );
    }

    return migration.sql;
  }

  if (
    statements.length !== 2 ||
    statements[0] !== "BEGIN" ||
    statements[1] !== "COMMIT"
  ) {
    throw new Error(
      `Unexpected transaction structure in ${migration.filename}.`
    );
  }

  return lines
    .filter((line) => !transactionStatement.test(line))
    .join("\n");
}

async function main(): Promise<void> {
  const migrations = loadMigrations();

  const client = new Client(buildPgClientConfig());

  await client.connect();

  let lockAcquired = false;

  try {
    await client.query(
      "SELECT pg_advisory_lock(719421, 950001)"
    );
    lockAcquired = true;

    const historyExists = await client.query<{
      exists: boolean;
    }>(
      `SELECT to_regclass('public.schema_migrations')
        IS NOT NULL AS exists`
    );

    if (!historyExists.rows[0].exists) {
      const existingTables = await client.query<{
        count: string;
      }>(
        `SELECT COUNT(*)::text AS count
         FROM information_schema.tables
         WHERE table_schema IN ('public', 'auth')
           AND table_type = 'BASE TABLE'`
      );

      if (Number(existingTables.rows[0].count) > 0) {
        throw new Error(
          "Existing database has no migration history. " +
          "A validated baseline is required before migrations can run."
        );
      }

      await client.query(`
        CREATE TABLE public.schema_migrations (
          version VARCHAR(3) PRIMARY KEY,
          filename TEXT NOT NULL,
          checksum VARCHAR(64) NOT NULL,
          applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
    }

    const result = await client.query<{
      version: string;
      filename: string;
      checksum: string;
    }>(
      `SELECT version, filename, checksum
       FROM public.schema_migrations
       ORDER BY version`
    );

    const applied = new Map(
      result.rows.map((row) => [row.version, row])
    );

    for (const row of result.rows) {
      const migration = migrations.find(
        (item) => item.version === row.version
      );

      if (!migration) {
        throw new Error(
          `Applied migration ${row.version} is missing from disk.`
        );
      }

      if (
        row.filename !== migration.filename ||
        row.checksum !== migration.checksum
      ) {
        throw new Error(
          `Migration ${row.version} differs from its recorded version.`
        );
      }
    }

    for (const migration of migrations) {
      if (applied.has(migration.version)) {
        console.log(`SKIP  ${migration.filename}`);
        continue;
      }

      const sql = normalizeTransactionWrappers(migration);

      console.log(`APPLY ${migration.filename}`);

      await client.query("BEGIN");

      try {
        await client.query(sql);

        await client.query(
          `INSERT INTO public.schema_migrations
             (version, filename, checksum)
           VALUES ($1, $2, $3)`,
          [
            migration.version,
            migration.filename,
            migration.checksum,
          ]
        );

        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }

      console.log(`DONE  ${migration.filename}`);
    }

    console.log("All database migrations are up to date.");
  } finally {
    try {
      if (lockAcquired) {
        await client.query(
          "SELECT pg_advisory_unlock(719421, 950001)"
        );
      }
    } finally {
      await client.end();
    }
  }
}

main().catch((error: unknown) => {
  console.error(
    "Migration failed:",
    error instanceof Error ? error.message : error
  );
  process.exitCode = 1;
});
