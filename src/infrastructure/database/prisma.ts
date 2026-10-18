
import "dotenv/config";
import { PrismaClient } from "../../generated/prisma/client.js";

function buildDatabaseUrl(): string {
    const {
        DB_HOST,
        DB_PORT,
        DB_USER,
        DB_PASSWORD,
        DB_NAME
    } = process.env;

    if (
        !DB_HOST ||
        !DB_PORT ||
        !DB_USER ||
        !DB_PASSWORD ||
        !DB_NAME
    ) {
        throw new Error("Missing PostgreSQL connection configuration");
    }

    const port = Number(DB_PORT);

    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error("Invalid PostgreSQL port");
    }

    const url = new URL("postgresql://localhost");

    url.hostname = DB_HOST;
    url.port = String(port);
    url.username = encodeURIComponent(DB_USER);
    url.password = encodeURIComponent(DB_PASSWORD);
    url.pathname = `/${encodeURIComponent(DB_NAME)}`;

    return url.toString();
}

export const prisma = new PrismaClient({
    datasources: {
        db: {
            url: buildDatabaseUrl()
        }
    }
});
