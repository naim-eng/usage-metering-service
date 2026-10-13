
import { Router } from "express";
import { pool } from "./db.js";
import { authenticateAccount } from "./auth.js";

export const plansRouter = Router();

// CREATE a custom account or user plan.
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
            [
                name.trim(),
                planType,
                accountId,
                monthlyLimit,
                maxPerRequest
            ]
        );

        res.status(201).json({ plan: result.rows[0] });
    } catch (error) {
        console.error("Plan creation failed:", error);
        res.status(500).json({
            error: "Failed to create plan"
        });
    }
});

// UPDATE an existing custom plan owned by the authenticated account.
plansRouter.patch("/:planId", authenticateAccount, async (req, res) => {
    const accountId = res.locals.account.id;
    const planId = Number(req.params.planId);

    const { name, monthlyLimit, maxPerRequest } = req.body ?? {};

    // The plan ID must be a valid positive integer.
    if (!Number.isSafeInteger(planId) || planId <= 0) {
        res.status(400).json({ error: "Invalid plan ID" });
        return;
    }

    // At least one property must be provided.
    if (
        name === undefined &&
        monthlyLimit === undefined &&
        maxPerRequest === undefined
    ) {
        res.status(400).json({
            error: "No plan updates provided"
        });
        return;
    }

    // Validate every supplied property.
    if (
        (name !== undefined &&
            (typeof name !== "string" ||
             !name.trim() ||
             name.length > 100)) ||

        (monthlyLimit !== undefined &&
            (!Number.isSafeInteger(monthlyLimit) ||
             monthlyLimit < 0)) ||

        (maxPerRequest !== undefined &&
            (!Number.isSafeInteger(maxPerRequest) ||
             maxPerRequest <= 0))
    ) {
        res.status(400).json({
            error: "Invalid plan update details"
        });
        return;
    }

    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        // Only lock and update a plan owned by this account.
        // Predefined plans have owner_account_id = NULL,
        // so they cannot be updated using this endpoint.
        const existing = await client.query(
            `SELECT id, name, monthly_limit, max_per_request
             FROM plans
             WHERE id = $1
               AND owner_account_id = $2
             FOR UPDATE`,
            [planId, accountId]
        );

        if (existing.rowCount === 0) {
            await client.query("ROLLBACK");

            res.status(404).json({
                error: "Custom plan not found or not owned by account"
            });
            return;
        }

        const current = existing.rows[0];

        const updatedName =
            name === undefined ? current.name : name.trim();

        const updatedMonthlyLimit =
            monthlyLimit === undefined
                ? current.monthly_limit
                : monthlyLimit;

        const updatedMaxPerRequest =
            maxPerRequest === undefined
                ? current.max_per_request
                : maxPerRequest;

        const result = await client.query(
            `UPDATE plans
             SET name = $1,
                 monthly_limit = $2,
                 max_per_request = $3
             WHERE id = $4
               AND owner_account_id = $5
             RETURNING id, name, plan_type, owner_account_id,
                       monthly_limit, max_per_request, created_at`,
            [
                updatedName,
                updatedMonthlyLimit,
                updatedMaxPerRequest,
                planId,
                accountId
            ]
        );

        await client.query("COMMIT");

        res.json({
            message: "Custom plan updated",
            plan: result.rows[0]
        });
    } catch (error) {
        await client.query("ROLLBACK");

        console.error("Plan update failed:", error);

        res.status(500).json({
            error: "Failed to update custom plan"
        });
    } finally {
        client.release();
    }
});
