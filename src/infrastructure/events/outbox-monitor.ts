export interface OutboxMonitorDatabase {
    getDatabaseName(): Promise<string>;
    getStatusCounts(): Promise<
        { status: string; count: bigint }[]
    >;
    countExpiredLeases(now: Date): Promise<number>;
    countFailedEvents(): Promise<number>;
    getPendingBacklog(): Promise<{
        readyCount: bigint;
        oldestAgeSeconds: number | null;
    }>;
}

export interface OutboxMonitorResult {
    database: string;
    statusCounts: { status: string; count: bigint }[];
    expiredLeases: number;
    failedEvents: number;
    readyPendingEvents: bigint;
    oldestPendingAgeSeconds: number | null;
}

export async function monitorOutbox(
    database: OutboxMonitorDatabase,
    expectedDatabase: string | undefined
): Promise<OutboxMonitorResult> {
    if (!expectedDatabase) {
        throw new Error("DB_NAME must be explicitly set");
    }

    const actualDatabase = await database.getDatabaseName();

    if (actualDatabase !== expectedDatabase) {
        throw new Error("Database identity verification failed");
    }

    const statusCounts = await database.getStatusCounts();
    const expiredLeases = await database.countExpiredLeases(
        new Date()
    );
    const failedEvents = await database.countFailedEvents();
    const backlog = await database.getPendingBacklog();

    return {
        database: actualDatabase,
        statusCounts,
        expiredLeases,
        failedEvents,
        readyPendingEvents: backlog.readyCount,
        oldestPendingAgeSeconds: backlog.oldestAgeSeconds
    };
}
