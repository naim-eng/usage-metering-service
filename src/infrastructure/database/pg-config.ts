
import { readFileSync } from "node:fs";
import type { ClientConfig, PoolConfig } from "pg";
import {
    loadDatabaseConfig,
    type DatabaseConfig
} from "./config.js";

export function buildPgClientConfig(
    config: DatabaseConfig = loadDatabaseConfig()
): ClientConfig {
    const ssl: ClientConfig["ssl"] =
        config.sslMode === "verify-full"
            ? {
                rejectUnauthorized: true,
                servername: config.host,
                ...(config.sslRootCert
                    ? {
                        ca: readFileSync(
                            config.sslRootCert,
                            "utf8"
                        )
                    }
                    : {})
            }
            : false;

    return {
        host: config.host,
        port: config.port,
        user: config.user,
        password: config.password,
        database: config.database,
        connectionTimeoutMillis: config.connectionTimeoutMs,
        ssl
    };
}

export function buildPgPoolConfig(
    config: DatabaseConfig = loadDatabaseConfig()
): PoolConfig {
    return {
        ...buildPgClientConfig(config),
        max: config.poolMax
    };
}
