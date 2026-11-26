type Environment = Readonly<Record<string, string | undefined>>;

export function isProductionDeployment(
    env: Environment = process.env
): boolean {
    const mode = env.DEPLOYMENT_ENV ?? "local";

    if (mode !== "local" && mode !== "production") {
        throw new Error("DEPLOYMENT_ENV must be local or production");
    }

    if (mode === "production") {
        if (env.NODE_ENV === "test") {
            throw new Error("Test mode is prohibited in production");
        }

        if (env.E2E_AUTH_RATE_LIMIT !== undefined) {
            throw new Error("E2E overrides are prohibited in production");
        }
    }

    return mode === "production";
}

export function requireProductionSecret(
    value: string,
    name: string
): void {
    if (
        value.length < 32 ||
        /not[-_ ]for[-_ ]production|placeholder|replace[-_ ]with|change[-_ ]me/i.test(value) ||
        /^(test|e2e|ci|demo|example|synthetic)[-_]/i.test(value) ||
        new Set(value).size < 8
    ) {
        throw new Error(`${name} must contain a strong production secret`);
    }
}
