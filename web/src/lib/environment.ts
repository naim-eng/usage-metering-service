import { isProductionDeployment, requireProductionSecret } from "./deployment-config";

function requireSecret(
  value: string | undefined,
  name: string
): string {
  if (
    !value ||
    value.length < 32 ||
    !/^[\x21-\x7E]+$/.test(value) ||
    /^(replace[_-]?with|change[_-]?me|your[_-]|placeholder)/i.test(value) ||
    new Set(value).size === 1
  ) {
    throw new Error(`${name} must contain a valid secret of at least 32 characters`);
  }

  return value;
}

function parseUrl(
  value: string | undefined,
  name: string
): URL {
  if (!value || value !== value.trim() || /\s/.test(value)) {
    throw new Error(`${name} must contain a valid URL`);
  }

  try {
    return new URL(value);
  } catch {
    throw new Error(`${name} must contain a valid URL`);
  }
}

function requireHttpOrigin(
  value: string | undefined,
  name: string
): string {
  const url = parseUrl(value, name);

  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    !url.hostname ||
    url.hostname.includes("*") ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error(`${name} must contain a valid HTTP or HTTPS origin`);
  }

  return url.origin;
}

export function loadAuthEnvironment(
  env: Readonly<Record<string, string | undefined>> = process.env
) {
  const database = parseUrl(
    env.AUTH_DATABASE_URL,
    "AUTH_DATABASE_URL"
  );

  if (
    (database.protocol !== "postgresql:" &&
      database.protocol !== "postgres:") ||
    !database.hostname ||
    !database.username ||
    !database.password ||
    database.pathname.length <= 1 ||
    database.hash
  ) {
    throw new Error("AUTH_DATABASE_URL must contain a valid PostgreSQL connection URL");
  }

  const secret = requireSecret(
    env.BETTER_AUTH_SECRET,
    "BETTER_AUTH_SECRET"
  );

  const baseURL = requireHttpOrigin(
    env.BETTER_AUTH_URL,
    "BETTER_AUTH_URL"
  );

  const additionalOrigins = (
    env.BETTER_AUTH_TRUSTED_ORIGINS ?? ""
  )
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
    .map((origin) =>
      requireHttpOrigin(origin, "BETTER_AUTH_TRUSTED_ORIGINS")
    );

  if (isProductionDeployment(env)) {
    if (env.PRODUCTION_INGRESS_CONFIGURED !== "1") {
      throw new Error(
        "Production authentication requires confirmed trusted ingress"
      );
    }

    requireProductionSecret(secret, "BETTER_AUTH_SECRET");
    requireProductionSecret(
      decodeURIComponent(database.password),
      "AUTH_DATABASE_URL password"
    );

    for (const origin of [baseURL, ...additionalOrigins]) {
      if (!origin.startsWith("https://")) {
        throw new Error("Production authentication requires HTTPS origins");
      }
    }

    const allowedDatabaseParameters = new Set(["sslmode"]);

    for (const name of database.searchParams.keys()) {
      if (!allowedDatabaseParameters.has(name)) {
        throw new Error("Unsupported production database connection parameter");
      }
    }

    const sslModes = database.searchParams.getAll("sslmode");

    if (sslModes.length !== 1 || sslModes[0] !== "verify-full") {
      throw new Error("Production AUTH_DATABASE_URL requires sslmode=verify-full");
    }
  }

  return {
    databaseUrl: env.AUTH_DATABASE_URL!,
    secret,
    baseURL,
    trustedOrigins: [...new Set([baseURL, ...additionalOrigins])]
  };
}

export function loadMeteringEnvironment(
  env: Readonly<Record<string, string | undefined>> = process.env
) {
  const apiUrl = requireHttpOrigin(
    env.METERING_API_URL,
    "METERING_API_URL"
  );

  const adminKey = requireSecret(
    env.METERING_ADMIN_API_KEY,
    "METERING_ADMIN_API_KEY"
  );

  if (isProductionDeployment(env)) {
    requireProductionSecret(adminKey, "METERING_ADMIN_API_KEY");

    if (!apiUrl.startsWith("https://")) {
      throw new Error("Production metering API requires HTTPS");
    }
  }

  return { apiUrl, adminKey };
}

export function tryLoadMeteringEnvironment(
  env: Readonly<Record<string, string | undefined>> = process.env
) {
  try {
    return loadMeteringEnvironment(env);
  } catch {
    return null;
  }
}
