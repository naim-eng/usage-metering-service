import { consumeUnits } from "./consume.js";
import { authenticateAccount } from "./auth.js";
import express from "express";
import { pool } from "./db.js";

import { generateApiKey, hashApiKey } from "./api-keys.js";

const app = express();
const PORT = 3000;

app.use(express.json());

// Health check endpoint
app.get("/health", (req, res) => {
    res.json({ status: "ok" });
});

// Retrieve predefined plans from PostgreSQL
app.get("/plans", async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT id, name, plan_type, monthly_limit, max_per_request
             FROM plans
             WHERE owner_account_id IS NULL
             ORDER BY id`
        );

        res.json(result.rows);
    } catch (error) {
        console.error("Error retrieving plans:", error);

        res.status(500).json({
            error: "Failed to retrieve plans"
        });
    }
});

app.post("/accounts", async (req, res) => {
    // Only the administrator can create accounts.
    const adminKey = req.header("X-Admin-Key");

    if (!process.env.ADMIN_API_KEY ||
        adminKey !== process.env.ADMIN_API_KEY) {
        res.status(401).json({ error: "Unauthorized" });
        return;
    }

    const { name, planId } = req.body ?? {};

    if (typeof name !== "string" ||
        !name.trim() ||
        name.length > 100 ||
        !Number.isSafeInteger(planId) ||
        planId <= 0) {
        res.status(400).json({ error: "Invalid name or planId" });
        return;
    }

    try {
        const plan = await pool.query(
            `SELECT id FROM plans
             WHERE id = $1
               AND plan_type = 'account'
               AND owner_account_id IS NULL`,
            [planId]
        );

        if (plan.rowCount === 0) {
            res.status(400).json({
                error: "Invalid account plan"
            });
            return;
        }

        const apiKey = generateApiKey();
        const apiKeyHash = hashApiKey(apiKey);

        const result = await pool.query(
            `INSERT INTO accounts (name, api_key_hash, plan_id)
             VALUES ($1, $2, $3)
             RETURNING id, name, plan_id, created_at`,
            [name.trim(), apiKeyHash, planId]
        );

        res.status(201).json({
            account: result.rows[0],
            apiKey
        });
    } catch (error) {
        console.error("Account creation failed:", error);
        res.status(500).json({
            error: "Failed to create account"
        });
    }
});
app.post("/users", authenticateAccount, async (req, res) => {
    const accountId = res.locals.account.id;
    const { userId, planId } = req.body ?? {};

    if (
        typeof userId !== "string" ||
        !userId.trim() ||
        userId.length > 100 ||
        !Number.isSafeInteger(planId) ||
        planId <= 0
    ) {
        res.status(400).json({
            error: "Invalid userId or planId"
        });
        return;
    }

    try {
        const plan = await pool.query(
            `SELECT id FROM plans
             WHERE id = $1
               AND plan_type = 'user'
               AND (
                   owner_account_id IS NULL
                   OR owner_account_id = $2
               )`,
            [planId, accountId]
        );

        if (plan.rowCount === 0) {
            res.status(400).json({
                error: "Invalid or inaccessible user plan"
            });
            return;
        }

        const result = await pool.query(
            `INSERT INTO users
             (account_id, external_user_id, plan_id)
             VALUES ($1, $2, $3)
             RETURNING id, account_id, external_user_id,
                       plan_id, created_at`,
            [accountId, userId.trim(), planId]
        );

        res.status(201).json({
            user: result.rows[0]
        });
    } catch (error: unknown) {
        if (
            typeof error === "object" &&
            error !== null &&
            "code" in error &&
            error.code === "23505"
        ) {
            res.status(409).json({
                error: "User already exists in this account"
            });
            return;
        }

        console.error("User registration failed:", error);

        res.status(500).json({
            error: "Failed to register user"
        });
    }
});

app.post("/consume", authenticateAccount, async (req, res) => {
    const accountId = String(res.locals.account.id);
    const { userId, units, requestId } = req.body ?? {};

    if (
        typeof userId !== "string" ||
        !userId.trim() ||
        userId.length > 100 ||
        !Number.isSafeInteger(units) ||
        units <= 0 ||
        typeof requestId !== "string" ||
        !requestId.trim() ||
        requestId.length > 100
    ) {
        res.status(400).json({
            error: "Invalid userId, units or requestId"
        });
        return;
    }

    try {
        const result = await consumeUnits(
            accountId,
            userId,
            units,
            requestId
        );

        res.status(200).json(result);
    } catch (error) {
        const message =
            error instanceof Error ? error.message : "";

        if (message === "User not found in account") {
            res.status(404).json({ error: message });
            return;
        }

        if (message ===
            "Request ID already used with different parameters") {
            res.status(409).json({ error: message });
            return;
        }

        console.error("Consumption failed:", error);
        res.status(500).json({
            error: "Failed to process consumption"
        });
    }
}); 



// Start the HTTP server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
