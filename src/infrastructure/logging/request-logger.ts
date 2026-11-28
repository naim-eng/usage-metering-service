import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import type { RequestHandler } from "express";
import type { Logger } from "pino";
import { logger } from "./logger.js";

function safeRoutePath(
    routePath: unknown,
    baseUrl: string
): string {
    if (typeof routePath !== "string") {
        return "[unmatched]";
    }

    // Accept only ordinary static paths and named parameters.
    // Never include arbitrary route expressions in logs.
    if (
        !new RegExp("^/(?:[a-zA-Z0-9_-]+|:[a-zA-Z][a-zA-Z0-9_]*)(?:/(?:[a-zA-Z0-9_-]+|:[a-zA-Z][a-zA-Z0-9_]*))*/?$").test(routePath)
        && routePath !== "/"
    ) {
        return "[unsafe-route]";
    }

    // Only known static router mounts are permitted.
    // Never expose resolved dynamic mount parameters.
    const allowedMounts = new Set([
        "",
        "/",
        "/projects",
        "/plans",
        "/usage"
    ]);

    if (!allowedMounts.has(baseUrl)) {
        return "[unknown-mount]";
    }

    const prefix = baseUrl.replace(/\/$/, "");
    const suffix = routePath.startsWith("/")
        ? routePath
        : `/${routePath}`;

    return `${prefix}${suffix}` || "/";
}

export function createRequestLogger(
    log: Logger = logger
): RequestHandler {
    return (req, res, next) => {
        const requestId = randomUUID();
        const startedAt = performance.now();
        let logged = false;

        res.setHeader("X-Request-ID", requestId);
        res.locals.requestId = requestId;

        const recordRequest = (completed: boolean) => {
            if (logged) {
                return;
            }

            logged = true;

            const durationMs = Math.round(
                (performance.now() - startedAt) * 100
            ) / 100;

            const routePath = req.route?.path;

            const details = {
                event: "http_request",
                requestId,
                method: req.method,
                path: safeRoutePath(
                    routePath,
                    req.baseUrl
                ),
                statusCode: completed
                    ? res.statusCode
                    : null,
                durationMs,
                completed
            };

            if (completed) {
                log.info(details, "HTTP request completed");
            } else {
                log.warn(
                    details,
                    "HTTP connection closed prematurely"
                );
            }
        };

        res.once("finish", () => recordRequest(true));
        res.once("close", () => {
            recordRequest(res.writableFinished);
        });

        next();
    };
}
