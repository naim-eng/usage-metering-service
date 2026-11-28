import { prisma } from "../database/prisma.js";
import { QuotaEventConsumer } from "./QuotaEventConsumer.js";

async function main(): Promise<void> {
    if (process.env.DB_NAME !== "usage_metering_test") {
        throw new Error("Crash-test worker requires usage_metering_test");
    }

    const rawId = process.env.CRASH_TEST_EVENT_ID;

    if (!rawId || !/^[1-9]\d*$/.test(rawId)) {
        throw new Error("Invalid crash-test event ID");
    }

    const eventId = BigInt(rawId);

    const consumer = new QuotaEventConsumer(
        prisma,
        async () => {
            process.stdout.write("HANDLER_STARTED\n");

            // Keep the handler active until the parent test kills
            // this process. No external side effects occur.
            await new Promise<void>(() => {});
        }
    );

    try {
        await consumer.processOne(eventId);
    } finally {
        await prisma.$disconnect();
    }
}

main().catch(() => {
    process.stderr.write("CRASH_TEST_WORKER_FAILED\n");
    process.exitCode = 1;
});
