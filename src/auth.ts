import type { Request, Response, NextFunction } from "express";
import { pool } from "./db.js";
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
        const result = await pool.query(
            "SELECT id, name, plan_id FROM accounts WHERE api_key_hash = $1",
            [hashApiKey(apiKey)]
        );

        if (result.rowCount === 0) {
            res.status(401).json({
                error: "Invalid API key"
            });
            return;
        }

        res.locals.account = result.rows[0];
        next();
    } catch (error) {
        console.error("Authentication failed:", error);
        res.status(500).json({
            error: "Internal server error"
        });
    }
}
