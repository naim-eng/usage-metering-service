import { Pool } from "pg";

export const pool = new Pool({
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT || 5433),
    user: process.env.DB_USER || "metering",
    password: process.env.DB_PASSWORD || "metering_dev_password",
    database: process.env.DB_NAME || "usage_metering",
});
