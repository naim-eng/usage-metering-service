
import { Router } from "express";
import { authenticateAccount } from "./auth.js";
import { pool } from "./db.js";
import { getUtcMonthStart } from "./consume.js";

export const allowancesRouter = Router();

// Inspect the authenticated account's assigned plan and quota.
allowancesRouter.get(
    "/account",
    authenticateAccount,
    async (_req, res) => {
        const accountId = res.locals.account.id;
        const monthStart = getUtcMonthStart(new Date());

        try {
            const result = await pool.query(
                `SELECT
                    a.id,
                    a.name,
                    p.id AS plan_id,
                    p.name AS plan_name,
                    p.monthly_limit,
                    p.max_per_request,
                    COALESCE(m.units_used, 0) AS units_used,
                    GREATEST(
                        p.monthly_limit - COALESCE(m.units_used, 0),
                        0
                    ) AS units_remaining,
                    $2::date AS month_start
                 FROM accounts a
                 JOIN plans p ON p.id = a.plan_id
                 LEFT JOIN monthly_usage m
                   ON m.account_id = a.id
                  AND m.user_id IS NULL
                  AND m.month_start = $2::date
                 WHERE a.id = $1`,
                [accountId, monthStart]
            );

            if (result.rowCount === 0) {
                res.status(404).json({
                    error: "Account not found"
                });
                return;
            }

            res.json({
                account: result.rows[0]
            });
        } catch (error) {
            console.error("Account allowance lookup failed:", error);

            res.status(500).json({
                error: "Failed to retrieve account allowance"
            });
        }
    }
);

// Inspect all users and their individual quota allowances.
allowancesRouter.get(
    "/users",
    authenticateAccount,
    async (_req, res) => {
        const accountId = res.locals.account.id;
        const monthStart = getUtcMonthStart(new Date());

        try {
            const result = await pool.query(
                `SELECT
                    u.external_user_id AS user_id,
                    p.id AS plan_id,
                    p.name AS plan_name,
                    p.monthly_limit,
                    p.max_per_request,
                    COALESCE(m.units_used, 0) AS units_used,
                    GREATEST(
                        p.monthly_limit - COALESCE(m.units_used, 0),
                        0
                    ) AS units_remaining,
                    $2::date AS month_start
                 FROM users u
                 JOIN plans p ON p.id = u.plan_id
                 LEFT JOIN monthly_usage m
                   ON m.account_id = u.account_id
                  AND m.user_id = u.id
                  AND m.month_start = $2::date
                 WHERE u.account_id = $1
                 ORDER BY u.id`,
                [accountId, monthStart]
            );

            res.json({
                users: result.rows
            });
        } catch (error) {
            console.error("User allowance lookup failed:", error);

            res.status(500).json({
                error: "Failed to retrieve user allowances"
            });
        }
    }
);
