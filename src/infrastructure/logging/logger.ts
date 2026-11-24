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
                "apiKey",
                "adminKey",
                "token",
                "authorization",
                "headers.authorization",
                "headers.x-api-key",
                "headers.x-admin-key",
                "req.headers.authorization",
                "req.headers.x-api-key",
                "req.headers.x-admin-key"
            ],
            censor: "[REDACTED]"
        }
    };

    return destination
        ? pino(options, destination)
        : pino(options);
}

export const logger = createLogger();
