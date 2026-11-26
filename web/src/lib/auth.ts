import { loadAuthEnvironment } from "./environment";
import { betterAuth } from "better-auth";
import { organization } from "better-auth/plugins";
import { PostgresDialect } from "kysely";
import { Pool } from "pg";

const {
  databaseUrl,
  secret,
  baseURL,
  trustedOrigins
} = loadAuthEnvironment();

const isIsolatedE2E =
  process.env.E2E_AUTH_RATE_LIMIT === "1" &&
  process.env.NEXT_BUILD_DIR === ".next-e2e" &&
  baseURL === "http://localhost:3004" &&
  new URL(databaseUrl).hostname === "127.0.0.1" &&
  new URL(databaseUrl).port === "5434" &&
  new URL(databaseUrl).pathname === "/usage_metering_e2e" &&
  new URL(databaseUrl).username === "metering_e2e";

if (process.env.E2E_AUTH_RATE_LIMIT === "1" && !isIsolatedE2E) {
  throw new Error("E2E rate limit override requires the isolated E2E environment");
}

export const auth = betterAuth({
  ...(isIsolatedE2E
    ? {
        rateLimit: {
          enabled: true,
          customRules: {
            "/sign-up/email": { window: 10, max: 100 },
            "/sign-in/email": { window: 10, max: 100 },
          },
        },
      }
    : {}),

  appName: "Usage Metering",

  baseURL,
  trustedOrigins,

  secret,

  database: {
    dialect: new PostgresDialect({
      pool: new Pool({
        connectionString: databaseUrl,
      }),
    }),
    type: "postgres",
    schemaName: "auth",
  },

  emailAndPassword: {
    enabled: true,
  },

  plugins: [organization()],
});
