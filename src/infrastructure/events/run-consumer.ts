import { writeFileSync, rmSync } from "node:fs";
import { logger } from "../logging/logger.js";
import { prisma } from "../database/prisma.js";
import { QuotaEventConsumer } from "./QuotaEventConsumer.js";
import { ConsumerWorker } from "./consumer-worker.js";

const consumer = new QuotaEventConsumer(prisma);
const heartbeatPath = "/tmp/metering-consumer-heartbeat";

rmSync(heartbeatPath, { force: true });

let lastHeartbeatWrite = -Infinity;

const worker = new ConsumerWorker(
    consumer,
    2000,
    logger,
    () => performance.now(),
    () => {
        const now = performance.now();

        if (now - lastHeartbeatWrite >= 10_000) {
            writeFileSync(heartbeatPath, String(Date.now()), {
                mode: 0o600
            });
            lastHeartbeatWrite = now;
        }
    }
);

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
        rmSync(heartbeatPath, { force: true });
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
