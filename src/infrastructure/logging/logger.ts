import type { DestinationStream } from "pino";
import pino from "pino";

const VALID_LOG_LEVELS = new Set([
    "fatal",
    "error",
    "warn",
    "info",
    "debug",
    "trace",
    "silent"
]);

export function resolveLogLevel(
    value: string | undefined
): string {
    if (!value) {
        return "info";
    }

    const normalized = value.toLowerCase();

    if (!VALID_LOG_LEVELS.has(normalized)) {
        throw new Error("Invalid LOG_LEVEL configuration");
    }

    return normalized;
}

export function createLogger(
    level: string | undefined = process.env.LOG_LEVEL,
    destination?: DestinationStream
): pino.Logger {
    const options: pino.LoggerOptions = {
        level: resolveLogLevel(level),
        base: {
            service: "usage-metering-service"
        },
        timestamp: pino.stdTimeFunctions.isoTime,
        redact: {
            paths: [
                "password",
                "currentPassword",
                "newPassword",
                "passwordHash",
                "apiKey",
                "apiKeyHash",
                "api_key",
                "api_key_hash",
                "keyHash",
                "key_hash",
                "adminKey",
                "token",
                "sessionToken",
                "accessToken",
                "refreshToken",
                "resetToken",
                "verificationToken",
                "secret",
                "databaseUrl",
                "connectionString",
                "authorization",
                "cookie",
                "set-cookie",
                "x-api-key",
                "x-admin-key",
                "*.password",
                "*.currentPassword",
                "*.newPassword",
                "*.passwordHash",
                "*.apiKey",
                "*.apiKeyHash",
                "*.api_key",
                "*.api_key_hash",
                "*.keyHash",
                "*.key_hash",
                "*.adminKey",
                "*.token",
                "*.sessionToken",
                "*.accessToken",
                "*.refreshToken",
                "*.resetToken",
                "*.verificationToken",
                "*.secret",
                "*.databaseUrl",
                "*.connectionString",
                "*.authorization",
                "*.cookie",
                "*.set-cookie",
                "*.x-api-key",
                "*.x-admin-key",
                "*.*.password",
                "*.*.currentPassword",
                "*.*.newPassword",
                "*.*.passwordHash",
                "*.*.apiKey",
                "*.*.apiKeyHash",
                "*.*.api_key",
                "*.*.api_key_hash",
                "*.*.keyHash",
                "*.*.key_hash",
                "*.*.adminKey",
                "*.*.token",
                "*.*.sessionToken",
                "*.*.accessToken",
                "*.*.refreshToken",
                "*.*.resetToken",
                "*.*.verificationToken",
                "*.*.secret",
                "*.*.databaseUrl",
                "*.*.connectionString",
                "*.*.authorization",
                "*.*.cookie",
                "*.*.set-cookie",
                "*.*.x-api-key",
                "*.*.x-admin-key",
                "*.*.*.password",
                "*.*.*.currentPassword",
                "*.*.*.newPassword",
                "*.*.*.passwordHash",
                "*.*.*.apiKey",
                "*.*.*.apiKeyHash",
                "*.*.*.api_key",
                "*.*.*.api_key_hash",
                "*.*.*.keyHash",
                "*.*.*.key_hash",
                "*.*.*.adminKey",
                "*.*.*.token",
                "*.*.*.sessionToken",
                "*.*.*.accessToken",
                "*.*.*.refreshToken",
                "*.*.*.resetToken",
                "*.*.*.verificationToken",
                "*.*.*.secret",
                "*.*.*.databaseUrl",
                "*.*.*.connectionString",
                "*.*.*.authorization",
                "*.*.*.cookie",
                "*.*.*.set-cookie",
                "*.*.*.x-api-key",
                "*.*.*.x-admin-key"
            ],
            censor: "[REDACTED]"
        }
    };

    return destination
        ? pino(options, destination)
        : pino(options);
}

export const logger = createLogger();
