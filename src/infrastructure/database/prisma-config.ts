import { resolve } from "node:path";

import {
    loadDatabaseConfig,
    type DatabaseConfig
} from "./config.js";

export function buildPrismaDatabaseUrl(
    config: DatabaseConfig = loadDatabaseConfig()
): string {
    const url = new URL("postgresql://localhost");

    url.hostname = config.host;
    url.port = String(config.port);
    url.username = encodeURIComponent(config.user);
    url.password = encodeURIComponent(config.password);
    url.pathname = `/${encodeURIComponent(config.database)}`;

    // Prisma expects connection timeouts in whole seconds.
    const timeoutSeconds = Math.ceil(
        config.connectionTimeoutMs / 1000
    );

    url.searchParams.set(
        "connect_timeout",
        String(timeoutSeconds)
    );

    url.searchParams.set(
        "connection_limit",
        String(config.poolMax)
    );

    if (config.sslMode === "verify-full") {
        url.searchParams.set("sslmode", "require");
        url.searchParams.set("sslaccept", "strict");
        if (config.sslRootCert) {
            url.searchParams.set(
                "sslcert",
                resolve(config.sslRootCert)
            );
        }
    } else {
        url.searchParams.set("sslmode", "disable");
    }

    return url.toString();
}
