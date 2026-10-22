import type { PrismaClient } from "../../generated/prisma/client.js";

export class GetNotificationsService {
    constructor(private readonly prisma: PrismaClient) {}

    async execute(accountId: bigint) {
        const notifications =
            await this.prisma.low_credit_notifications.findMany({
                where: {
                    account_id: accountId
                },
                orderBy: [
                    { created_at: "desc" },
                    { id: "desc" }
                ],
                take: 100
            });

        return {
            notifications: notifications.map((notification) => ({
                id: notification.id.toString(),
                scope: notification.user_id === null
                    ? "account"
                    : "user",
                userId: notification.user_id?.toString() ?? null,
                month: notification.month_start
                    .toISOString()
                    .slice(0, 7),
                thresholdPercent: notification.threshold_percent,
                monthlyLimit: notification.monthly_limit.toString(),
                unitsUsed: notification.units_used.toString(),
                remainingCredits:
                    notification.remaining_credits.toString(),
                createdAt: notification.created_at.toISOString()
            }))
        };
    }
}
