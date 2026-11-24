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
            },

            async getPendingBacklog() {
                const rows = await prisma.$queryRaw<
                    {
                        ready_count: bigint;
                        oldest_age_seconds: number | null;
                    }[]
                >`
                    SELECT
                        COUNT(*) FILTER (
                            WHERE available_at <= NOW()
                        ) AS ready_count,
                        EXTRACT(
                            EPOCH FROM (
                                NOW() - MIN(created_at)
                            )
                        )::double precision AS oldest_age_seconds
                    FROM outbox_events
                    WHERE status = 'pending'
                `;

                return {
                    readyCount: rows[0]?.ready_count ?? 0n,
                    oldestAgeSeconds:
                        rows[0]?.oldest_age_seconds ?? null
                };
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
        console.log(
            "Ready pending events:",
            result.readyPendingEvents.toString()
        );
        console.log(
            "Oldest pending event age (seconds):",
            result.oldestPendingAgeSeconds ?? "none"
        );
    } finally {
        await prisma.$disconnect();
    }
}

main().catch(() => {
    console.error("Outbox monitoring failed");
    process.exitCode = 1;
});
