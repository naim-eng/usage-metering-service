
import {
    loadDatabaseConfig,
    type DatabaseConfig
} from "./config.js";

export function buildPrismaDatabaseUrl(
    config: DatabaseConfig = loadDatabaseConfig()
): string {
    if (config.sslMode === "verify-full" && config.sslRootCert) {
        throw new Error(
            "Custom CA certificates are not yet supported by the Prisma adapter"
        );
    }

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
    } else {
        url.searchParams.set("sslmode", "disable");
    }

    return url.toString();
}
