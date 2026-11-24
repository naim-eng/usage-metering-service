
import "dotenv/config";
import { PrismaClient } from "../../generated/prisma/client.js";
import { buildPrismaDatabaseUrl } from "./prisma-config.js";

export const prisma = new PrismaClient({
    datasources: {
        db: {
            url: buildPrismaDatabaseUrl()
        }
    }
});
