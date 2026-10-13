import { Router } from "express";
import { authenticateAccount } from "./auth.js";
import { pool } from "./db.js";

export const historyRouter = Router();

historyRouter.get(
    "/history",
    authenticateAccount,
    async (req, res) => {
        const accountId = res.locals.account.id;

        const page = Number(req.query.page ?? 1);
        const limit = Number(req.query.limit ?? 50);

        if (
            !Number.isSafeInteger(page) ||
            page < 1 ||
            !Number.isSafeInteger(limit) ||
            limit < 1 ||
            limit > 100 ||
            !Number.isSafeInteger((page - 1) * limit)
        ) {
            res.status(400).json({
                error: "Invalid page or limit"
            });
            return;
        }

        const offset = (page - 1) * limit;

        try {
            const result = await pool.query(
                `SELECT
                    r.request_id,
                    u.external_user_id AS user_id,
                    r.units_requested,
                    r.accepted,
                    r.rejection_scope,
                    r.rejection_rule,
                    r.created_at
                 FROM usage_requests r
                 JOIN users u ON u.id = r.user_id
                 WHERE r.account_id = $1
                 ORDER BY r.created_at DESC, r.id DESC
                 LIMIT $2 OFFSET $3`,
                [accountId, limit, offset]
            );

            res.json({
                page,
                limit,
                history: result.rows
            });
        } catch (error) {
            console.error("History retrieval failed:", error);
            res.status(500).json({
                error: "Failed to retrieve usage history"
            });
        }
    }
);
