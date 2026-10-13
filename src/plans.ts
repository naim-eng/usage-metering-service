
import { Router } from "express";
import { pool } from "./db.js";
import { authenticateAccount } from "./auth.js";

export const plansRouter = Router();

plansRouter.post("/", authenticateAccount, async (req, res) => {
    const accountId = res.locals.account.id;
    const { name, planType, monthlyLimit, maxPerRequest } = req.body ?? {};

    if (
        typeof name !== "string" ||
        !name.trim() ||
        name.length > 100 ||
        !["account", "user"].includes(planType) ||
        !Number.isSafeInteger(monthlyLimit) ||
        monthlyLimit < 0 ||
        !Number.isSafeInteger(maxPerRequest) ||
        maxPerRequest <= 0
    ) {
        res.status(400).json({ error: "Invalid plan details" });
        return;
    }

    try {
        const result = await pool.query(
            `INSERT INTO plans
             (name, plan_type, owner_account_id,
              monthly_limit, max_per_request)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id, name, plan_type, owner_account_id,
                       monthly_limit, max_per_request, created_at`,
            [name.trim(), planType, accountId, monthlyLimit, maxPerRequest]
        );

        res.status(201).json({ plan: result.rows[0] });
    } catch (error) {
        console.error("Plan creation failed:", error);
        res.status(500).json({ error: "Failed to create plan" });
    }
});
