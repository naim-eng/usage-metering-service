
import type { PrismaClient } from "../../generated/prisma/client.js";

export class MonthlyReportAccountNotFoundError extends Error {
    constructor() {
        super("Account not found");
        this.name = "MonthlyReportAccountNotFoundError";
    }
}

type HistoryRecord = {
    id: bigint;
    user_id: bigint | null;
    plan_name: string;
    monthly_limit: bigint;
    max_per_request: bigint;
    change_type: string;
    effective_at: Date;
};

function historySnapshot(
    records: HistoryRecord[],
    startAt: Date,
    endAt: Date
) {
    // Records arrive in ascending timestamp and ID order.
    // The final record is the effective plan at the cutoff.
    const latest = records.at(-1);

    const changes = records
        .filter(record =>
            record.effective_at >= startAt &&
            record.effective_at < endAt
        )
        .map(record => ({
            plan_name: record.plan_name,
            monthly_limit: record.monthly_limit.toString(),
            max_per_request: record.max_per_request.toString(),
            change_type: record.change_type,
            effective_at: record.effective_at
        }));

    return {
        plan_name: latest?.plan_name ?? null,
        monthly_limit: latest?.monthly_limit.toString() ?? null,
        max_per_request: latest?.max_per_request.toString() ?? null,
        historical_limits_available: latest !== undefined,
        plan_changes: changes
    };
}

export class GetMonthlyReportService {
    constructor(private readonly prisma: PrismaClient) {}

    async execute(accountId: bigint, month: string) {
        const [yearText, monthText] = month.split("-");
        const year = Number(yearText);
        const monthNumber = Number(monthText);

        const startAt = new Date(0);
        startAt.setUTCFullYear(year, monthNumber - 1, 1);
        startAt.setUTCHours(0, 0, 0, 0);

        const endAt = new Date(startAt);
        endAt.setUTCMonth(endAt.getUTCMonth() + 1);

        return this.prisma.$transaction(async tx => {
            // Use the transaction start time as the reporting cutoff.
            // This is consistent with PostgreSQL's now() defaults.
            const clock = await tx.$queryRaw<
                Array<{ as_of: Date }>
            >`
                SELECT transaction_timestamp() AS as_of
            `;

            const databaseNow = clock[0]!.as_of;

            const asOf = databaseNow < endAt
                ? databaseNow
                : endAt;

            const account = await tx.accounts.findUnique({
                where: { id: accountId },
                select: {
                    id: true,
                    name: true
                }
            });

            if (!account) {
                throw new MonthlyReportAccountNotFoundError();
            }

            const users = await tx.users.findMany({
                where: { account_id: accountId },
                orderBy: { id: "asc" },
                select: {
                    id: true,
                    external_user_id: true
                }
            });

            const usage = await tx.monthly_usage.findMany({
                where: {
                    account_id: accountId,
                    month_start: startAt
                },
                select: {
                    user_id: true,
                    units_used: true
                }
            });

            // Include earlier history for the effective snapshot.
            // Only events within this month appear in plan_changes.
            const history = await tx.plan_limit_history.findMany({
                where: {
                    account_id: accountId,
                    effective_at: { lte: asOf }
                },
                orderBy: [
                    { effective_at: "asc" },
                    { id: "asc" }
                ],
                select: {
                    id: true,
                    user_id: true,
                    plan_name: true,
                    monthly_limit: true,
                    max_per_request: true,
                    change_type: true,
                    effective_at: true
                }
            });

            const accountHistory = history.filter(
                record => record.user_id === null
            );

            const accountUsage = usage.find(
                record => record.user_id === null
            );

            const accountReport = {
                name: account.name,
                ...historySnapshot(accountHistory, startAt, endAt),
                units_used: (
                    accountUsage?.units_used ?? 0n
                ).toString()
            };

            const userReports = users.map(user => {
                const userHistory = history.filter(
                    record => record.user_id === user.id
                );

                const userUsage = usage.find(
                    record => record.user_id === user.id
                );

                return {
                    user_id: user.external_user_id,
                    ...historySnapshot(userHistory, startAt, endAt),
                    units_used: (
                        userUsage?.units_used ?? 0n
                    ).toString()
                };
            });

            return {
                month,
                account: accountReport,
                users: userReports
            };
        }, {
            isolationLevel: "RepeatableRead",
            timeout: 15000
        });
    }
}
