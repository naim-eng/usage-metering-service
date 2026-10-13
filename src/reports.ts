
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

        const monthStart = `${month}-01`;

        try {
            // Report boundaries are UTC. For the current month,
            // the as-of boundary is the request's current time.
            const accountResult = await pool.query(
                `WITH bounds AS (
                    SELECT
                        ($2::date::timestamp AT TIME ZONE 'UTC') AS start_at,
                        (($2::date + INTERVAL '1 month')::timestamp
                            AT TIME ZONE 'UTC') AS end_at,
                        LEAST(
                            (($2::date + INTERVAL '1 month')::timestamp
                                AT TIME ZONE 'UTC'),
                            NOW()
                        ) AS as_of
                 )
                 SELECT
                    a.name,
                    snapshot.plan_name,
                    snapshot.monthly_limit,
                    snapshot.max_per_request,
                    COALESCE(m.units_used, 0) AS units_used,
                    (snapshot.id IS NOT NULL) AS historical_limits_available,
                    COALESCE(changes.events, '[]'::json) AS plan_changes
                 FROM accounts a
                 CROSS JOIN bounds b
                 LEFT JOIN monthly_usage m
                   ON m.account_id = a.id
                   AND m.user_id IS NULL
                   AND m.month_start = $2::date
                 LEFT JOIN LATERAL (
                    SELECT
                        h.id,
                        h.plan_name,
                        h.monthly_limit,
                        h.max_per_request
                    FROM plan_limit_history h
                    WHERE h.account_id = a.id
                      AND h.user_id IS NULL
                      AND h.effective_at <= b.as_of
                    ORDER BY h.effective_at DESC, h.id DESC
                    LIMIT 1
                 ) snapshot ON TRUE
                 LEFT JOIN LATERAL (
                    SELECT json_agg(
                        json_build_object(
                            'plan_name', h.plan_name,
                            'monthly_limit', h.monthly_limit,
                            'max_per_request', h.max_per_request,
                            'change_type', h.change_type,
                            'effective_at', h.effective_at
                        )
                        ORDER BY h.effective_at, h.id
                    ) AS events
                    FROM plan_limit_history h
                    WHERE h.account_id = a.id
                      AND h.user_id IS NULL
                      AND h.effective_at >= b.start_at
                      AND h.effective_at < b.end_at
                      AND h.effective_at <= b.as_of
                 ) changes ON TRUE
                 WHERE a.id = $1`,
                [accountId, monthStart]
            );

            const account = accountResult.rows[0];

            if (!account) {
                res.status(404).json({
                    error: "Account not found"
                });
                return;
            }

            const usersResult = await pool.query(
                `WITH bounds AS (
                    SELECT
                        ($2::date::timestamp AT TIME ZONE 'UTC') AS start_at,
                        (($2::date + INTERVAL '1 month')::timestamp
                            AT TIME ZONE 'UTC') AS end_at,
                        LEAST(
                            (($2::date + INTERVAL '1 month')::timestamp
                                AT TIME ZONE 'UTC'),
                            NOW()
                        ) AS as_of
                 )
                 SELECT
                    u.external_user_id AS user_id,
                    snapshot.plan_name,
                    snapshot.monthly_limit,
                    snapshot.max_per_request,
                    COALESCE(m.units_used, 0) AS units_used,
                    (snapshot.id IS NOT NULL) AS historical_limits_available,
                    COALESCE(changes.events, '[]'::json) AS plan_changes
                 FROM users u
                 CROSS JOIN bounds b
                 LEFT JOIN monthly_usage m
                   ON m.account_id = u.account_id
                   AND m.user_id = u.id
                   AND m.month_start = $2::date
                 LEFT JOIN LATERAL (
                    SELECT
                        h.id,
                        h.plan_name,
                        h.monthly_limit,
                        h.max_per_request
                    FROM plan_limit_history h
                    WHERE h.account_id = u.account_id
                      AND h.user_id = u.id
                      AND h.effective_at <= b.as_of
                    ORDER BY h.effective_at DESC, h.id DESC
                    LIMIT 1
                 ) snapshot ON TRUE
                 LEFT JOIN LATERAL (
                    SELECT json_agg(
                        json_build_object(
                            'plan_name', h.plan_name,
                            'monthly_limit', h.monthly_limit,
                            'max_per_request', h.max_per_request,
                            'change_type', h.change_type,
                            'effective_at', h.effective_at
                        )
                        ORDER BY h.effective_at, h.id
                    ) AS events
                    FROM plan_limit_history h
                    WHERE h.account_id = u.account_id
                      AND h.user_id = u.id
                      AND h.effective_at >= b.start_at
                      AND h.effective_at < b.end_at
                      AND h.effective_at <= b.as_of
                 ) changes ON TRUE
                 WHERE u.account_id = $1
                 ORDER BY u.id`,
                [accountId, monthStart]
            );

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
