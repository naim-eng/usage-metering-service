import type { Prisma } from "../../generated/prisma/client.js";
import type { CreateLowCreditNotification } from "../repositories/LowCreditNotificationRepository.js";

export class QuotaEventProducer {
    async publishThresholdReached(
        tx: Prisma.TransactionClient,
        notification: CreateLowCreditNotification
    ): Promise<void> {
        const scope = notification.userId === null ? "account" : "user";
        const month = notification.monthStart.toISOString().slice(0, 7);

        const deduplicationKey = [
            "quota.threshold.reached",
            notification.accountId.toString(),
            scope,
            notification.userId?.toString() ?? "none",
            month,
            notification.thresholdPercent
        ].join(":");

        await tx.outbox_events.createMany({
            data: [{
                event_type: "quota.threshold.reached",
                deduplication_key: deduplicationKey,
                payload: {
                    accountId: notification.accountId.toString(),
                    userId: notification.userId?.toString() ?? null,
                    scope,
                    month,
                    thresholdPercent: notification.thresholdPercent,
                    monthlyLimit: notification.monthlyLimit.toString(),
                    unitsUsed: notification.unitsUsed.toString(),
                    remainingCredits: notification.remainingCredits.toString()
                }
            }],
            skipDuplicates: true
        });
    }
}
