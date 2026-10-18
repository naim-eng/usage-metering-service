
import type { Request, Response, NextFunction } from "express";
import { prisma } from "./infrastructure/database/prisma.js";
import { hashApiKey } from "./api-keys.js";

export async function authenticateAccount(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> {
    const apiKey = req.header("X-API-Key");

    if (!apiKey || !apiKey.startsWith("um_")) {
        res.status(401).json({
            error: "Missing or invalid API key"
        });
        return;
    }

    try {
        const account = await prisma.accounts.findUnique({
            where: {
                api_key_hash: hashApiKey(apiKey)
            },
            select: {
                id: true,
                name: true,
                plan_id: true
            }
        });

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
        console.error("Authentication failed:", error);
        res.status(500).json({
            error: "Internal server error"
        });
    }
}
