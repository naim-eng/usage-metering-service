import { isProductionDeployment, requireProductionSecret } from "./deployment-config";

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

    if (!adminKey) {
        throw new Error("ADMIN_API_KEY must be configured");
    }

    if (adminKey.length < 32) {
        throw new Error(
            "ADMIN_API_KEY must contain at least 32 characters"
        );
    }

    if (!/^[\x21-\x7E]+$/.test(adminKey)) {
        throw new Error(
            "ADMIN_API_KEY must contain only printable ASCII characters without whitespace"
        );
    }

    if (
        /^(replace[_-]?with|change[_-]?me|your[_-]|placeholder)/i.test(adminKey) ||
        new Set(adminKey).size === 1
    ) {
        throw new Error(
            "ADMIN_API_KEY must not contain a placeholder or trivial secret"
        );
    }

    if (isProductionDeployment(env)) {
        requireProductionSecret(adminKey, "ADMIN_API_KEY");
    }

    return { port };
}
