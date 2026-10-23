import { prisma } from "../database/prisma.js";
import { QuotaEventConsumer } from "./QuotaEventConsumer.js";

if (process.env.DB_NAME !== "usage_metering_test") {
    throw new Error(
        "Consumer test runner must use usage_metering_test"
    );
}

const consumer = new QuotaEventConsumer(prisma);

async function main(): Promise<void> {
    let processed = 0;

    try {
        for (let i = 0; i < 100; i++) {
            const found = await consumer.processOne();

            if (!found) {
                break;
            }

            processed++;
        }

        console.log(`Consumer finished. Processed: ${processed}`);
    } finally {
        await prisma.$disconnect();
    }
}

main().catch((error) => {
    console.error("Consumer failed:", error);
    process.exitCode = 1;
});
