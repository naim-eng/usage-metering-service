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
