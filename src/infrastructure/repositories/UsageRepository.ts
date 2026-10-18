
import type { Prisma } from "../../generated/prisma/client.js";

export class UsageRepository {
    async ensureMonthlyRows(
        tx: Prisma.TransactionClient,
        accountId: bigint,
        userId: bigint,
        monthStart: Date
    ): Promise<void> {
        // Create the account-level row if it does not exist.
        await tx.$executeRaw`
            INSERT INTO monthly_usage
                (account_id, user_id, month_start, units_used)
            VALUES
                (${accountId}, NULL, ${monthStart}::date, 0)
            ON CONFLICT (account_id, month_start)
                WHERE user_id IS NULL
            DO NOTHING
        `;

        // Create the user-level row if it does not exist.
        await tx.$executeRaw`
            INSERT INTO monthly_usage
                (account_id, user_id, month_start, units_used)
            VALUES
                (${accountId}, ${userId}, ${monthStart}::date, 0)
            ON CONFLICT (user_id, month_start)
                WHERE user_id IS NOT NULL
            DO NOTHING
        `;
    }

    async incrementIfWithinLimit(
        tx: Prisma.TransactionClient,
        usageId: bigint,
        units: bigint,
        monthlyLimit: bigint
    ): Promise<boolean> {
        if (units <= 0n) {
            throw new Error("Units must be positive");
        }

        if (monthlyLimit < units) {
            return false;
        }

        const result = await tx.monthly_usage.updateMany({
            where: {
                id: usageId,
                units_used: {
                    lte: monthlyLimit - units
                }
            },
            data: {
                units_used: {
                    increment: units
                }
            }
        });

        return result.count === 1;
    }
}
