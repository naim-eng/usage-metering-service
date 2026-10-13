
import { Router } from "express";
import { authenticateAccount } from "./auth.js";
import { pool } from "./db.js";

export const reportsRouter = Router();

reportsRouter.get(
    "/monthly",
    authenticateAccount,
    async (req, res) => {
        const accountId = res.locals.account.id;
        const month = req.query.month;

        if (
            typeof month !== "string" ||
            !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)
        ) {
            res.status(400).json({
                error: "Month must be in YYYY-MM format"
            });
            return;
        }

        try {
            const accountResult = await pool.query(
                `SELECT
                    a.name,
                    p.name AS plan_name,
                    p.monthly_limit,
                    COALESCE(m.units_used, 0) AS units_used
                 FROM accounts a
                 JOIN plans p ON p.id = a.plan_id
                 LEFT JOIN monthly_usage m
                   ON m.account_id = a.id
                   AND m.user_id IS NULL
                   AND m.month_start = $2::date
                 WHERE a.id = $1`,
                [accountId, `${month}-01`]
            );

            const usersResult = await pool.query(
                `SELECT
                    u.external_user_id AS user_id,
                    p.name AS plan_name,
                    p.monthly_limit,
                    COALESCE(m.units_used, 0) AS units_used
                 FROM users u
                 JOIN plans p ON p.id = u.plan_id
                 LEFT JOIN monthly_usage m
                   ON m.user_id = u.id
                   AND m.month_start = $2::date
                 WHERE u.account_id = $1
                 ORDER BY u.id`,
                [accountId, `${month}-01`]
            );

            const account = accountResult.rows[0];

            if (!account) {
                res.status(404).json({ error: "Account not found" });
                return;
            }

            res.json({
                month,
                account,
                users: usersResult.rows
            });
        } catch (error) {
            console.error("Monthly report failed:", error);
            res.status(500).json({
                error: "Failed to retrieve monthly report"
            });
        }
    }
);
