import { createHash, randomBytes } from "node:crypto";

// Generate a secure random API key.
export function generateApiKey(): string {
    return `um_${randomBytes(32).toString("hex")}`;
}

// Create a hash to store in PostgreSQL.
export function hashApiKey(apiKey: string): string {
    return createHash("sha256")
        .update(apiKey)
        .digest("hex");
}

// Accept only the canonical generated API key format.
export function isValidApiKey(value: unknown): value is string {
    return (
        typeof value === "string" &&
        value.length === 67 &&
        /^um_[0-9a-f]{64}$/.test(value)
    );
}
