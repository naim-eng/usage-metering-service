import { logger } from "../logging/logger.js";
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
    logger.info({ event: "consumer_worker_started" }, "Event consumer worker started");

    try {
        while (!stopping) {
            const processed = await consumer.processOne();

            if (!processed) {
                await sleep(POLL_INTERVAL_MS);
            }
        }
    } finally {
        await prisma.$disconnect();
        logger.info({ event: "consumer_worker_stopped" }, "Event consumer worker stopped");
    }
}

main().catch(() => {
    logger.fatal({ event: "consumer_worker_failed" }, "Event consumer worker failed");
    process.exitCode = 1;
});
