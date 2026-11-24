import {
    monitorOutbox,
    type OutboxMonitorDatabase
} from "../src/infrastructure/events/outbox-monitor.js";

async function main(): Promise<void> {
    const expectedDatabase = process.env.DB_NAME;

    if (!expectedDatabase) {
        throw new Error("DB_NAME must be explicitly set");
    }

    const { prisma } = await import(
        "../src/infrastructure/database/prisma.js"
    );

    try {
        const database: OutboxMonitorDatabase = {
            async getDatabaseName() {
                const rows = await prisma.$queryRaw<
                    { name: string }[]
                >`SELECT current_database() AS name`;

                return rows[0]?.name ?? "";
            },

            async getStatusCounts() {
                return prisma.$queryRaw<
                    { status: string; count: bigint }[]
                >`
                    SELECT status, COUNT(*) AS count
                    FROM outbox_events
                    GROUP BY status
                    ORDER BY status
                `;
            },

            async countExpiredLeases(now) {
                return prisma.outbox_events.count({
                    where: {
                        status: "processing",
                        available_at: { lte: now }
                    }
                });
            },

            async countFailedEvents() {
                return prisma.outbox_events.count({
                    where: { status: "failed" }
                });
            }
        };

        const result = await monitorOutbox(
            database,
            expectedDatabase
        );

        console.log("Database:", result.database);
        console.log("Outbox event counts:");

        for (const row of result.statusCounts) {
            console.log(`  ${row.status}: ${row.count}`);
        }

        console.log(
            "Expired processing leases:",
            result.expiredLeases
        );
        console.log(
            "Permanently failed events:",
            result.failedEvents
        );
    } finally {
        await prisma.$disconnect();
    }
}

main().catch(() => {
    console.error("Outbox monitoring failed");
    process.exitCode = 1;
});
