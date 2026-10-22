import type { Prisma } from "../../generated/prisma/client.js";
import type { LowCreditThreshold } from "../../domain/services/LowCreditNotificationPolicy.js";

export interface CreateLowCreditNotification {
    accountId: bigint;
    userId: bigint | null;
    monthStart: Date;
    thresholdPercent: LowCreditThreshold;
    monthlyLimit: bigint;
    unitsUsed: bigint;
    remainingCredits: bigint;
}

export class LowCreditNotificationRepository {
    async record(
        tx: Prisma.TransactionClient,
        notification: CreateLowCreditNotification
    ): Promise<void> {
        await tx.low_credit_notifications.createMany({
            data: [{
                account_id: notification.accountId,
                user_id: notification.userId,
                month_start: notification.monthStart,
                threshold_percent: notification.thresholdPercent,
                monthly_limit: notification.monthlyLimit,
                units_used: notification.unitsUsed,
                remaining_credits: notification.remainingCredits
            }],
            skipDuplicates: true
        });
    }
}
