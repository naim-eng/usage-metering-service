import { pool } from "./db.js";

async function testConnection() {
    try {
        const result = await pool.query("SELECT NOW()");
        console.log("Database connected successfully!");
        console.log("Database time:", result.rows[0].now);
    } catch (error) {
        console.error("Database connection failed:", error);
    } finally {
        await pool.end();
    }
}

testConnection();
