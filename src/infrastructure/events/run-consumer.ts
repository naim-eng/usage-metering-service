import { setTimeout as sleep } from "node:timers/promises";
import { prisma } from "../database/prisma.js";
import { QuotaEventConsumer } from "./QuotaEventConsumer.js";

const POLL_INTERVAL_MS = 2000;

let stopping = false;

process.on("SIGINT", () => {
    stopping = true;
});

process.on("SIGTERM", () => {
    stopping = true;
});

const consumer = new QuotaEventConsumer(prisma);

async function main(): Promise<void> {
    console.log("[Event Consumer] Worker started");

    try {
        while (!stopping) {
            const processed = await consumer.processOne();

            if (!processed) {
                await sleep(POLL_INTERVAL_MS);
            }
        }
    } finally {
        await prisma.$disconnect();
        console.log("[Event Consumer] Worker stopped");
    }
}

main().catch((error) => {
    console.error("[Event Consumer] Worker failed:", error);
    process.exitCode = 1;
});
