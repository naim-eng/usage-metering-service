
import "dotenv/config";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { Client } from "pg";
import { buildPgClientConfig } from "../../src/infrastructure/database/pg-config.js";

const targetDatabase = process.env.DB_NAME;
const referenceDatabase = process.env.BASELINE_REFERENCE_DB;
const confirmation = process.env.BASELINE_CONFIRM_DB;
const migrationsDirectory = resolve(process.cwd(), "sql");

type Migration = {
  version: string;
  filename: string;
  checksum: string;
};

type Snapshot = {
  tables: string[];
  columns: string[];
  constraints: string[];
  indexes: string[];
};

function connection(database: string): Client {
  return new Client({
    ...buildPgClientConfig(),
    database,
  });
}

function loadMigrations(): Migration[] {
  const filenames = readdirSync(migrationsDirectory)
    .filter((name) => /^\d{3}_.+\.sql$/.test(name))
    .sort();

  const expected = Array.from(
    { length: 9 },
    (_, index) => String(index + 1).padStart(3, "0")
  );

  if (
    filenames.length !== 9 ||
    filenames.some(
      (name, index) => !name.startsWith(expected[index] + "_")
    )
  ) {
    throw new Error(
      "Baseline requires exactly historical migrations 001–009."
    );
  }

  return filenames.map((filename) => ({
    version: filename.slice(0, 3),
    filename,
    checksum: createHash("sha256")
      .update(readFileSync(resolve(migrationsDirectory, filename)))
      .digest("hex"),
  }));
}

async function rows(
  client: Client,
  sql: string
): Promise<string[]> {
  const result = await client.query(sql);

  return result.rows.map((row) =>
    JSON.stringify(Object.values(row))
  );
}

function normalizeConstraintRows(
  entries: string[]
): string[] {
  const allowedValues = new Map<
    string,
    { column: string; values: string[] }
  >([
    [
      "public.outbox_events.outbox_event_status_check",
      {
        column: "status",
        values: [
          "pending",
          "processing",
          "completed",
          "failed",
        ],
      },
    ],
    [
      "public.plan_limit_history.plan_limit_history_change_type_check",
      {
        column: "change_type",
        values: [
          "baseline",
          "account_plan_switch",
          "user_plan_switch",
          "custom_plan_update",
        ],
      },
    ],
    [
      "public.plans.plans_plan_type_check",
      {
        column: "plan_type",
        values: ["account", "user"],
      },
    ],
    [
      "public.projects.projects_status_check",
      {
        column: "status",
        values: ["pending", "active", "failed"],
      },
    ],
    [
      "public.usage_requests.usage_requests_rejection_scope_check",
      {
        column: "rejection_scope",
        values: ["account", "user"],
      },
    ],
  ]);

  return entries.map((entry) => {
    const [schema, table, constraint, definition, validated] =
      JSON.parse(entry) as [
        string,
        string,
        string,
        string,
        boolean
      ];

    const expected = allowedValues.get(
      `${schema}.${table}.${constraint}`
    );

    if (!expected) {
      return entry;
    }

    if (!validated) {
      return entry;
    }

    const freshElements = expected.values.map(
      (value) => `'${value}'::character varying`
    );

    const restoredElements = expected.values.map(
      (value) => `('${value}'::character varying)::text`
    );

    const prefix =
      `CHECK (((${expected.column})::text = ANY (`;

    const freshDefinition =
      prefix +
      `(ARRAY[${freshElements.join(", ")}])::text[])))`;

    const restoredDefinition =
      prefix +
      `ARRAY[${restoredElements.join(", ")}])))`;

    if (
      definition !== freshDefinition &&
      definition !== restoredDefinition
    ) {
      return entry;
    }

    return JSON.stringify([
      schema,
      table,
      constraint,
      `CHECK_ALLOWED_VALUES:${expected.values.join(",")}`,
      validated,
    ]);
  });
}

async function snapshot(client: Client): Promise<Snapshot> {
  return {
    tables: await rows(
      client,
      `SELECT table_schema, table_name
       FROM information_schema.tables
       WHERE table_schema IN ('public', 'auth')
         AND table_type = 'BASE TABLE'
         AND NOT (
           table_schema = 'public'
           AND table_name = 'schema_migrations'
         )
       ORDER BY table_schema, table_name`
    ),

    columns: await rows(
      client,
      `SELECT table_schema, table_name, column_name,
              ordinal_position, data_type,
              character_maximum_length, is_nullable,
              column_default
       FROM information_schema.columns
       WHERE table_schema IN ('public', 'auth')
         AND NOT (
           table_schema = 'public'
           AND table_name = 'schema_migrations'
         )
       ORDER BY table_schema, table_name, ordinal_position`
    ),

    constraints: normalizeConstraintRows(
      await rows(
        client,
        `SELECT n.nspname, t.relname, c.conname,
                pg_get_constraintdef(c.oid) AS definition,
                c.convalidated
         FROM pg_constraint c
         JOIN pg_class t ON t.oid = c.conrelid
         JOIN pg_namespace n ON n.oid = t.relnamespace
         WHERE n.nspname IN ('public', 'auth')
           AND NOT (
             n.nspname = 'public'
             AND t.relname = 'schema_migrations'
           )
         ORDER BY n.nspname, t.relname, c.conname`
      )
    ),

    indexes: await rows(
      client,
      `SELECT schemaname, tablename, indexname, indexdef
       FROM pg_indexes
       WHERE schemaname IN ('public', 'auth')
         AND NOT (
           schemaname = 'public'
           AND tablename = 'schema_migrations'
         )
       ORDER BY schemaname, tablename, indexname`
    ),
  };
}

async function main(): Promise<void> {
  if (!targetDatabase || !referenceDatabase) {
    throw new Error(
      "DB_NAME and BASELINE_REFERENCE_DB are required."
    );
  }

  if (confirmation !== targetDatabase) {
    throw new Error(
      "Set BASELINE_CONFIRM_DB to the exact target database name."
    );
  }

  if (targetDatabase === referenceDatabase) {
    throw new Error(
      "Target and reference databases must be different."
    );
  }

  const migrations = loadMigrations();
  const target = connection(targetDatabase);
  const reference = connection(referenceDatabase);

  await target.connect();

  let referenceConnected = false;
  let lockAcquired = false;
  let transactionOpen = false;

  try {
    await target.query(
      "SELECT pg_advisory_lock(719421, 950001)"
    );
    lockAcquired = true;

    await target.query("BEGIN");
    transactionOpen = true;

    await target.query(
      "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ"
    );

    const existingHistory = await target.query(
      `SELECT to_regclass('public.schema_migrations') AS history`
    );

    if (existingHistory.rows[0].history !== null) {
      throw new Error(
        "Migration history already exists. Baseline refused."
      );
    }

    await reference.connect();
    referenceConnected = true;

    const referenceHistory =
      await reference.query<Migration>(
        `SELECT version, filename, checksum
         FROM public.schema_migrations
         ORDER BY version`
      );

    if (
      referenceHistory.rows.length !== migrations.length ||
      referenceHistory.rows.some((row, index) => {
        const expected = migrations[index];

        return (
          row.version !== expected.version ||
          row.filename !== expected.filename ||
          row.checksum !== expected.checksum
        );
      })
    ) {
      throw new Error(
        "Reference database migration history does not match SQL files."
      );
    }

    const targetSnapshot = await snapshot(target);
    const referenceSnapshot = await snapshot(reference);

    for (const category of [
      "tables",
      "columns",
      "constraints",
      "indexes",
    ] as const) {
      if (
        JSON.stringify(targetSnapshot[category]) !==
        JSON.stringify(referenceSnapshot[category])
      ) {
        throw new Error(
          `Schema mismatch detected in ${category}. Baseline refused.`
        );
      }
      console.log(`MATCH ${category}`);
    }

    if (process.env.BASELINE_DRY_RUN === "true") {
      console.log("DRY RUN PASSED: No database changes made.");
      await target.query("ROLLBACK");
      transactionOpen = false;
      return;
    }

    await target.query(`



      CREATE TABLE public.schema_migrations (
        version VARCHAR(3) PRIMARY KEY,
        filename TEXT NOT NULL,
        checksum VARCHAR(64) NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    for (const migration of migrations) {
      await target.query(
        `INSERT INTO public.schema_migrations
           (version, filename, checksum)
         VALUES ($1, $2, $3)`,
        [
          migration.version,
          migration.filename,
          migration.checksum,
        ]
      );

      console.log(`BASELINE ${migration.filename}`);
    }

    await target.query("COMMIT");
    transactionOpen = false;

    console.log(
      `Baseline completed for database: ${targetDatabase}`
    );
  } catch (error) {
    if (transactionOpen) {
      await target.query("ROLLBACK");
    }

    throw error;
  } finally {
    if (referenceConnected) {
      await reference.end();
    }

    if (lockAcquired) {
      await target.query(
        "SELECT pg_advisory_unlock(719421, 950001)"
      );
    }

    await target.end();
  }
}

main().catch((error: unknown) => {
  console.error(
    "Baseline failed:",
    error instanceof Error ? error.message : error
  );

  process.exitCode = 1;
});
