async function main(): Promise<void> {
    const expectedDatabase = process.env.DB_NAME;

    if (!expectedDatabase) {
        throw new Error("DB_NAME must be explicitly set");
    }

    const { prisma } = await import("../src/infrastructure/database/prisma.js");

    try {
        const database = await prisma.$queryRaw<
            { name: string }[]
        >`SELECT current_database() AS name`;

        if (database[0]?.name !== expectedDatabase) {
            throw new Error("Database identity verification failed");
        }

        const rows = await prisma.$queryRaw<
            {
                status: string;
                count: bigint;
            }[]
        >`
            SELECT status, COUNT(*) AS count
            FROM outbox_events
            GROUP BY status
            ORDER BY status
        `;

        const expiredLeases = await prisma.outbox_events.count({
            where: {
                status: "processing",
                available_at: { lte: new Date() }
            }
        });

        const failedEvents = await prisma.outbox_events.count({
            where: { status: "failed" }
        });

        console.log("Database:", database[0].name);
        console.log("Outbox event counts:");

        for (const row of rows) {
            console.log(`  ${row.status}: ${row.count}`);
        }

        console.log("Expired processing leases:", expiredLeases);
        console.log("Permanently failed events:", failedEvents);
    } finally {
        await prisma.$disconnect();
    }
}

main()
    .catch(() => {
        console.error("Outbox monitoring failed");
        process.exitCode = 1;
    });
