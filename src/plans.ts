
import { Router } from "express";
import { pool } from "./db.js";
import { authenticateAccount } from "./auth.js";

export const plansRouter = Router();

// Create a custom account or user plan.
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
        res.status(400).json({
            error: "Invalid plan details"
        });
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

        res.status(201).json({
            plan: result.rows[0]
        });
    } catch (error) {
        console.error("Plan creation failed:", error);

        res.status(500).json({
            error: "Failed to create plan"
        });
    }
});

// Update a custom plan and record changes for its assigned members.
plansRouter.patch("/:planId", authenticateAccount, async (req, res) => {
    const accountId = res.locals.account.id;
    const planId = Number(req.params.planId);

    const { name, monthlyLimit, maxPerRequest } = req.body ?? {};

    if (!Number.isSafeInteger(planId) || planId <= 0) {
        res.status(400).json({
            error: "Invalid plan ID"
        });
        return;
    }

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

        // Lock the owning account first.
        // Consumption and plan switching use the same lock.
        const account = await client.query(
            `SELECT id
             FROM accounts
             WHERE id = $1
             FOR UPDATE`,
            [accountId]
        );

        if (account.rowCount === 0) {
            await client.query("ROLLBACK");

            res.status(404).json({
                error: "Account not found"
            });
            return;
        }

        // Lock only a custom plan owned by this account.
        // Predefined plans have no owner and cannot be edited.
        const existing = await client.query(
            `SELECT
                id,
                name,
                plan_type,
                monthly_limit,
                max_per_request
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
            name === undefined
                ? current.name
                : name.trim();

        const updatedMonthlyLimit =
            monthlyLimit === undefined
                ? current.monthly_limit
                : monthlyLimit;

        const updatedMaxPerRequest =
            maxPerRequest === undefined
                ? current.max_per_request
                : maxPerRequest;

        // Compare numerically because PostgreSQL BIGINT values
        // are normally returned to JavaScript as strings.
        const unchanged =
            updatedName === current.name &&
            BigInt(updatedMonthlyLimit) ===
                BigInt(current.monthly_limit) &&
            BigInt(updatedMaxPerRequest) ===
                BigInt(current.max_per_request);

        if (unchanged) {
            await client.query("COMMIT");

            res.json({
                message: "Custom plan is already up to date",
                plan: {
                    id: current.id,
                    name: current.name,
                    plan_type: current.plan_type,
                    owner_account_id: accountId,
                    monthly_limit: current.monthly_limit,
                    max_per_request: current.max_per_request
                }
            });
            return;
        }

        // Update the custom plan.
        const result = await client.query(
            `UPDATE plans
             SET name = $1,
                 monthly_limit = $2,
                 max_per_request = $3
             WHERE id = $4
               AND owner_account_id = $5
             RETURNING
                 id,
                 name,
                 plan_type,
                 owner_account_id,
                 monthly_limit,
                 max_per_request,
                 created_at`,
            [
                updatedName,
                updatedMonthlyLimit,
                updatedMaxPerRequest,
                planId,
                accountId
            ]
        );

        const updatedPlan = result.rows[0];

        // If this is an account plan and the owning account
        // currently uses it, record the new account limits.
        if (updatedPlan.plan_type === "account") {
            await client.query(
                `INSERT INTO plan_limit_history
                    (account_id,
                     user_id,
                     plan_id,
                     plan_name,
                     monthly_limit,
                     max_per_request,
                     effective_at,
                     change_type)
                 SELECT
                     a.id,
                     NULL,
                     p.id,
                     p.name,
                     p.monthly_limit,
                     p.max_per_request,
                     NOW(),
                     'custom_plan_update'
                 FROM accounts a
                 JOIN plans p ON p.id = a.plan_id
                 WHERE a.id = $1
                   AND a.plan_id = $2`,
                [accountId, planId]
            );
        }

        // If this is a user plan, record new limits for
        // every user currently assigned to that plan.
        if (updatedPlan.plan_type === "user") {
            await client.query(
                `INSERT INTO plan_limit_history
                    (account_id,
                     user_id,
                     plan_id,
                     plan_name,
                     monthly_limit,
                     max_per_request,
                     effective_at,
                     change_type)
                 SELECT
                     u.account_id,
                     u.id,
                     p.id,
                     p.name,
                     p.monthly_limit,
                     p.max_per_request,
                     NOW(),
                     'custom_plan_update'
                 FROM users u
                 JOIN plans p ON p.id = u.plan_id
                 WHERE u.account_id = $1
                   AND u.plan_id = $2`,
                [accountId, planId]
            );
        }

        await client.query("COMMIT");

        res.json({
            message: "Custom plan updated",
            plan: updatedPlan
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
