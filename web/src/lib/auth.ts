import { betterAuth } from "better-auth";
import { organization } from "better-auth/plugins";
import { PostgresDialect } from "kysely";
import { Pool } from "pg";

const databaseUrl = process.env.AUTH_DATABASE_URL;
const secret = process.env.BETTER_AUTH_SECRET;
const baseURL = process.env.BETTER_AUTH_URL;

if (!databaseUrl) {
  throw new Error("AUTH_DATABASE_URL is required");
}

if (!secret || secret.length < 32) {
  throw new Error("BETTER_AUTH_SECRET must be at least 32 characters");
}

if (!baseURL) {
  throw new Error("BETTER_AUTH_URL is required");
}

export const auth = betterAuth({
  appName: "Usage Metering",

  baseURL,
  trustedOrigins: [
    baseURL,
    ...(process.env.BETTER_AUTH_TRUSTED_ORIGINS ?? "")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
  ],

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
