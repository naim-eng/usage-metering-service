import { logger } from "../logging/logger.js";
import { prisma } from "../database/prisma.js";
import { QuotaEventConsumer } from "./QuotaEventConsumer.js";
import { ConsumerWorker } from "./consumer-worker.js";

const consumer = new QuotaEventConsumer(prisma);
const worker = new ConsumerWorker(consumer);

process.on("SIGINT", () => {
    logger.info(
        { event: "consumer_shutdown_requested", signal: "SIGINT" },
        "Consumer shutdown requested"
    );
    worker.stop();
});

process.on("SIGTERM", () => {
    logger.info(
        { event: "consumer_shutdown_requested", signal: "SIGTERM" },
        "Consumer shutdown requested"
    );
    worker.stop();
});

async function main(): Promise<void> {
    logger.info(
        { event: "consumer_worker_started" },
        "Event consumer worker started"
    );

    try {
        await worker.run();
    } finally {
        await prisma.$disconnect();

        logger.info(
            { event: "consumer_worker_stopped" },
            "Event consumer worker stopped"
        );
    }
}

main().catch(() => {
    logger.fatal(
        { event: "consumer_worker_failed" },
        "Event consumer worker failed"
    );
    process.exitCode = 1;
});
