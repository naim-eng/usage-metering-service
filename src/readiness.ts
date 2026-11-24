import type { RequestHandler } from "express";

export interface ReadinessDatabase {
    $queryRawUnsafe(query: string): Promise<unknown>;
}

export function createReadinessHandler(
    database: ReadinessDatabase
): RequestHandler {
    return async (_req, res) => {
        res.setHeader("Cache-Control", "no-store");

        try {
            await database.$queryRawUnsafe("SELECT 1");

            res.status(200).json({
                status: "ready"
            });
        } catch (error) {
            console.error("Database readiness check failed");

            res.status(503).json({
                status: "not_ready"
            });
        }
    };
}
