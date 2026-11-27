import { isProductionDeployment } from "./deployment-config";

export type EmailConfig = {
  host: string;
  port: number;
  secure: boolean;
  requireTLS: boolean;
  from: string;
  auth?: {
    user: string;
    pass: string;
  };
};

export function loadEmailConfig(
  env: Readonly<Record<string, string | undefined>> = process.env
): EmailConfig {
  const production = isProductionDeployment(env);

  const isIsolatedE2E =
    !production &&
    env.DEPLOYMENT_ENV === "local" &&
    env.E2E_AUTH_RATE_LIMIT === "1" &&
    env.NEXT_BUILD_DIR === ".next-e2e" &&
    env.BETTER_AUTH_URL === "http://localhost:3004" &&
    (() => {
      try {
        const database = new URL(env.AUTH_DATABASE_URL ?? "");

        return (
          database.protocol === "postgresql:" &&
          database.hostname === "127.0.0.1" &&
          database.port === "5434" &&
          database.pathname === "/usage_metering_e2e" &&
          database.username === "metering_e2e"
        );
      } catch {
        return false;
      }
    })();

  const localSMTPPort = isIsolatedE2E ? 1026 : 1025;


  function invalid(field: string): never {
    throw new Error(`Invalid email configuration: ${field}`);
  }

  const host = env.SMTP_HOST ?? (production ? "" : "127.0.0.1");
  const rawPort = env.SMTP_PORT ?? (production ? "" : "1025");
  const rawSecure = env.SMTP_SECURE ?? "false";

  const from =
    env.SMTP_FROM ??
    (production ? "" : "no-reply@example.test");

  const user = env.SMTP_USER;
  const pass = env.SMTP_PASSWORD;

  if (!host || !/^[a-zA-Z0-9.-]+$/.test(host)) {
    invalid("SMTP_HOST");
  }

  if (!/^[0-9]+$/.test(rawPort)) {
    invalid("SMTP_PORT");
  }

  const port = Number(rawPort);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    invalid("SMTP_PORT");
  }

  if (rawSecure !== "true" && rawSecure !== "false") {
    invalid("SMTP_SECURE");
  }

  const secure = rawSecure === "true";

  if (
    from.length > 254 ||
    !/^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(from)
  ) {
    invalid("SMTP_FROM");
  }

  if (Boolean(user) !== Boolean(pass)) {
    invalid("SMTP credentials");
  }

  if (user && /[\r\n]/.test(user)) {
    invalid("SMTP_USER");
  }

  if (pass && /[\r\n]/.test(pass)) {
    invalid("SMTP_PASSWORD");
  }

  if (production) {
    if (!user || !user.trim() || !pass || !pass.trim()) {
      invalid("SMTP credentials");
    }

    if (secure ? port !== 465 : port !== 587) {
      invalid("SMTP encryption or port");
    }

    if (
      /(^|\.)(localhost|test|invalid|example|local)$/i.test(host) ||
      /^[0-9.]+$/.test(host)
    ) {
      invalid("SMTP_HOST");
    }

    if (
      /@(?:.*\.)?(?:example\.com|example\.org|example\.net)$/i.test(from) ||
      /\.(test|invalid|example|local)$/i.test(from)
    ) {
      invalid("SMTP_FROM");
    }
  } else {
    if (host !== "127.0.0.1" && host !== "localhost") {
      invalid("Local SMTP_HOST");
    }

    if (port !== localSMTPPort || secure || user || pass) {
      invalid("Local SMTP transport");
    }
  }

  return {
    host,
    port,
    secure,
    requireTLS: production && !secure,
    from,
    ...(user && pass ? { auth: { user, pass } } : {}),
  };
}
