export interface ApiConfig {
    port: number;
}

export function loadApiConfig(
    env: NodeJS.ProcessEnv = process.env
): ApiConfig {
    const portValue = env.PORT ?? "3000";

    if (!/^[0-9]+$/.test(portValue)) {
        throw new Error("Invalid PORT configuration");
    }

    const port = Number(portValue);

    if (
        !Number.isSafeInteger(port) ||
        port < 1 ||
        port > 65535
    ) {
        throw new Error("PORT must be between 1 and 65535");
    }

    const adminKey = env.ADMIN_API_KEY;

    if (
        !adminKey ||
        !adminKey.trim() ||
        adminKey === "replace_with_your_admin_key"
    ) {
        throw new Error("ADMIN_API_KEY must be configured");
    }

    return { port };
}
