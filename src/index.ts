import express from "express";
import { pool } from "./db.js";

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

// Start the HTTP server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
