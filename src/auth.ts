
import type { Request, Response, NextFunction } from "express";
import { prisma } from "./infrastructure/database/prisma.js";
import { hashApiKey, isValidApiKey } from "./api-keys.js";
import { logger } from "./infrastructure/logging/logger.js";

export async function authenticateAccount(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> {
    const values = req.headersDistinct["x-api-key"];
    const apiKey = values?.length === 1 ? values[0] : undefined;

    if (!isValidApiKey(apiKey)) {
        res.status(401).json({
            error: "Invalid API key"
        });
        return;
    }

    try {
        const keyHash = hashApiKey(apiKey);

        // Preserve support for existing account API keys.
        let account = await prisma.accounts.findUnique({
            where: {
                api_key_hash: keyHash
            },
            select: {
                id: true,
                name: true,
                plan_id: true
            }
        });

        // Project-linked accounts must use managed project keys.
        // Standalone accounts remain independently accessible.
        if (account) {
            const linkedProject = await prisma.projects.findUnique({
                where: {
                    metering_account_id: account.id
                },
                select: {
                    status: true
                }
            });

            if (linkedProject) {
                res.status(401).json({
                    error: "Invalid API key"
                });
                return;
            }
        }

        // If the key is not an account key, check project API keys.
        if (!account) {
            const projectKey = await prisma.project_api_keys.findUnique({
                where: {
                    key_hash: keyHash
                },
                select: {
                    revoked_at: true,
                    project: {
                        select: {
                            status: true,
                            metering_account_id: true
                        }
                    }
                }
            });

            if (
                projectKey &&
                projectKey.revoked_at === null &&
                projectKey.project.status === "active" &&
                projectKey.project.metering_account_id !== null
            ) {
                account = await prisma.accounts.findUnique({
                    where: {
                        id: projectKey.project.metering_account_id
                    },
                    select: {
                        id: true,
                        name: true,
                        plan_id: true
                    }
                });
            }
        }

        if (!account) {
            res.status(401).json({
                error: "Invalid API key"
            });
            return;
        }

        // Preserve the string ID format previously returned by pg.
        res.locals.account = {
            id: account.id.toString(),
            name: account.name,
            plan_id: account.plan_id.toString()
        };

        next();
    } catch (error) {
        logger.error({ event: "authentication_failed", operation: "authenticate_account" }, "Authentication operation failed");

        res.status(500).json({
            error: "Internal server error"
        });
    }
}
