
export type DatabaseSslMode = "disable" | "verify-full";

export interface DatabaseConfig {
    host: string;
    port: number;
    user: string;
    password: string;
    database: string;
    connectionTimeoutMs: number;
    poolMax: number;
    sslMode: DatabaseSslMode;
    sslRootCert?: string;
}

export function loadDatabaseConfig(
    env: NodeJS.ProcessEnv = process.env
): DatabaseConfig {
    const required = [
        "DB_HOST",
        "DB_PORT",
        "DB_USER",
        "DB_PASSWORD",
        "DB_NAME"
    ] as const;

    for (const key of required) {
        if (!env[key]) {
            throw new Error(`Missing database configuration: ${key}`);
        }
    }

    const port = Number(env.DB_PORT);

    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error("Invalid PostgreSQL port");
    }

    const timeoutValue = env.DB_CONNECT_TIMEOUT_MS ?? "5000";
    const connectionTimeoutMs = Number(timeoutValue);

    if (
        !Number.isSafeInteger(connectionTimeoutMs) ||
        connectionTimeoutMs < 100 ||
        connectionTimeoutMs > 60000
    ) {
        throw new Error(
            "DB_CONNECT_TIMEOUT_MS must be between 100 and 60000 milliseconds"
        );
    }

    const poolValue = env.DB_POOL_MAX ?? "10";
    const poolMax = Number(poolValue);

    if (
        !Number.isSafeInteger(poolMax) ||
        poolMax < 1 ||
        poolMax > 100
    ) {
        throw new Error(
            "DB_POOL_MAX must be an integer between 1 and 100"
        );
    }

    const sslMode = env.DB_SSL_MODE ?? "disable";

    if (sslMode !== "disable" && sslMode !== "verify-full") {
        throw new Error(
            "DB_SSL_MODE must be disable or verify-full"
        );
    }

    const sslRootCert = env.DB_SSL_ROOT_CERT;

    if (sslRootCert !== undefined && !sslRootCert.trim()) {
        throw new Error("DB_SSL_ROOT_CERT cannot be empty");
    }

    if (sslMode === "disable" && sslRootCert !== undefined) {
        throw new Error(
            "DB_SSL_ROOT_CERT requires DB_SSL_MODE=verify-full"
        );
    }

    return {
        host: env.DB_HOST!,
        port,
        user: env.DB_USER!,
        password: env.DB_PASSWORD!,
        database: env.DB_NAME!,
        connectionTimeoutMs,
        poolMax,
        sslMode,
        ...(sslRootCert !== undefined ? { sslRootCert } : {})
    };
}
