import { isProductionDeployment } from "./deployment-config";
import { TRUSTED_CLIENT_IP_HEADER } from "./trusted-client-ip";
import { isAllowedRequestOrigin } from "./request-origin";
import { sendAuthEmail } from "./auth-email";
import { loadEmailConfig } from "./email-config";
import { loadAuthEnvironment } from "./environment";
import {
  enforceNewPasswordPolicy,
} from "./password-policy-middleware";
import {
  hashCustomerPassword,
  verifyCustomerPassword,
} from "./password-crypto";
import {
  MIN_PASSWORD_LENGTH,
  MAX_PASSWORD_LENGTH,
} from "./password-policy";
import { betterAuth, type BetterAuthOptions } from "better-auth";
import { organization } from "better-auth/plugins";
import { PostgresDialect } from "kysely";
import { Pool } from "pg";
import { randomBytes } from "node:crypto";

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

loadEmailConfig();

const authPool = new Pool({
  connectionString: databaseUrl,
});


const authRateLimit: NonNullable<BetterAuthOptions["rateLimit"]> = {
    enabled: true,
    storage: isIsolatedE2E ? "memory" : "database",
    window: 60,
    max: 100,
    customRules: isIsolatedE2E
      ? {
          "/sign-up/email": { window: 10, max: 100 },
          "/sign-in/email": { window: 10, max: 100 },
          "/change-password": { window: 10, max: 100 },
          "/request-password-reset": { window: 10, max: 100 },
          "/reset-password": { window: 10, max: 100 },
          "/send-verification-email": { window: 10, max: 100 },
        }
      : {
          "/sign-in/email": { window: 60, max: 5 },
          "/sign-up/email": { window: 300, max: 5 },
          "/change-password": { window: 300, max: 5 },
          "/request-password-reset": { window: 300, max: 3 },
          "/reset-password": { window: 300, max: 5 },
          "/send-verification-email": { window: 300, max: 3 },
          "/change-email": { window: 300, max: 3 },
        },
  };

export const auth = betterAuth({
  logger: {
    level: "warn",
    log: (level) => {
      if (level === "error") {
        console.error("Authentication operation failed");
      } else if (level === "warn") {
        console.warn("Authentication warning");
      }
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    sendOnSignIn: false,
    autoSignInAfterVerification: false,
    expiresIn: 3600,
    beforeEmailVerification: async (user) => {
      const unusablePassword = randomBytes(48).toString("hex");
      const passwordHash = await hashCustomerPassword(unusablePassword);
      const client = await authPool.connect();

      let discardConnection = false;

      try {
        await client.query("BEGIN");

        const customer = await client.query(
          `SELECT "emailVerified"
           FROM auth."user"
           WHERE id = $1
           FOR UPDATE`,
          [user.id]
        );

        if (customer.rowCount !== 1) {
          throw new Error("Unable to prepare verified account");
        }

        if (customer.rows[0].emailVerified === true) {
          await client.query("COMMIT");
          return;
        }

        const credential = await client.query(
          `UPDATE auth.account
           SET password = $1, "updatedAt" = NOW()
           WHERE "userId" = $2
             AND "providerId" = 'credential'`,
          [passwordHash, user.id]
        );

        if (credential.rowCount !== 1) {
          throw new Error("Unable to prepare verified account credentials");
        }

        const activation = await client.query(
          `UPDATE auth."user"
           SET "emailVerified" = TRUE, "updatedAt" = NOW()
           WHERE id = $1
             AND "emailVerified" = FALSE`,
          [user.id]
        );

        if (activation.rowCount !== 1) {
          throw new Error("Unable to activate verified account");
        }

        await client.query("COMMIT");
      } catch {
        try {
          await client.query("ROLLBACK");
        } catch {
          discardConnection = true;
          throw new Error("Account activation failed");
        }

        throw new Error("Account activation failed");
      } finally {
        client.release(discardConnection);
      }

    },

    sendVerificationEmail: async ({ user, url }) => {
      await sendAuthEmail({
        kind: "verification",
        recipient: user.email,
        url,
      });
    },
  },
  rateLimit: authRateLimit,

  session: {
    expiresIn: 24 * 60 * 60,
    updateAge: 0,
    disableSessionRefresh: true,
    freshAge: 15 * 60,
    cookieCache: {
      enabled: false,
    },
  },

  advanced: {
    ipAddress: {
      disableIpTracking: false,
      ipAddressHeaders: isProductionDeployment()
        ? [TRUSTED_CLIENT_IP_HEADER]
        : [],
      ipv6Subnet: 64,
    },
    useSecureCookies: new URL(baseURL).protocol === "https:",
    defaultCookieAttributes: {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
    },
    crossSubDomainCookies: {
      enabled: false,
    },
  },

  appName: "Usage Metering",

  baseURL,
  trustedOrigins,

  secret,

  database: {
    dialect: new PostgresDialect({
      pool: authPool,
    }),
    type: "postgres",
    schemaName: "auth",
  },

  hooks: {
    before: enforceNewPasswordPolicy,
  },

  emailAndPassword: {
    enabled: true,
    autoSignIn: false,
    requireEmailVerification: true,
    resetPasswordTokenExpiresIn: 1800,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      await sendAuthEmail({
        kind: "password-reset",
        recipient: user.email,
        url,
      });
    },
    minPasswordLength: MIN_PASSWORD_LENGTH,
    maxPasswordLength: MAX_PASSWORD_LENGTH,
    password: {
      hash: hashCustomerPassword,
      verify: verifyCustomerPassword,
    },
  },

  plugins: [organization()],
});

export function isTrustedMutationOrigin(request: Request): boolean {
  return isAllowedRequestOrigin(request, trustedOrigins);
}
