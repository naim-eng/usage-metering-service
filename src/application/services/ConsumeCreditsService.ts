import type { PrismaClient } from "../../generated/prisma/client.js";

import { QuotaPolicy } from "../../domain/services/QuotaPolicy.js";
import { LowCreditNotificationPolicy } from "../../domain/services/LowCreditNotificationPolicy.js";
import { AccountLockRepository } from "../../infrastructure/repositories/AccountLockRepository.js";
import { UsageRepository } from "../../infrastructure/repositories/UsageRepository.js";
import { IdempotencyRepository } from "../../infrastructure/repositories/IdempotencyRepository.js";
import { LowCreditNotificationRepository } from "../../infrastructure/repositories/LowCreditNotificationRepository.js";
import { QuotaEventProducer } from "../../infrastructure/events/QuotaEventProducer.js";

export interface ConsumeCreditsInput {
    accountId: bigint;
    externalUserId: string;
    units: bigint;
    requestId: string;
}

export interface ConsumeCreditsResult {
    accepted: boolean;
    scope: string | null;
    rule: string | null;
    replayed: boolean;
    accountRemaining: string | null;
    userRemaining: string | null;
}

export class ConsumeCreditsService {
    private readonly accountLocks = new AccountLockRepository();
    private readonly usageRepository = new UsageRepository();
    private readonly idempotencyRepository =
        new IdempotencyRepository();
    private readonly notificationRepository =
        new LowCreditNotificationRepository();
    private readonly eventProducer = new QuotaEventProducer();

    constructor(private readonly prisma: PrismaClient) {}

    async execute(
        input: ConsumeCreditsInput
    ): Promise<ConsumeCreditsResult> {
        if (input.units <= 0n) {
            throw new Error("Units must be positive");
        }

        const externalUserId = input.externalUserId.trim();

        if (
            !externalUserId ||
            externalUserId.length > 100 ||
            !input.requestId.trim() ||
            input.requestId.length > 100
        ) {
            throw new Error("Invalid userId or requestId");
        }

        return this.prisma.$transaction(async (tx) => {
            // Synchronize consumption with plan changes.
            await this.accountLocks.lockAccount(
                tx,
                input.accountId
            );

            const user = await tx.users.findUnique({
                where: {
                    account_id_external_user_id: {
                        account_id: input.accountId,
                        external_user_id: externalUserId
                    }
                },
                include: {
                    plans: true
                }
            });

            if (!user) {
                throw new Error("User not found in account");
            }

            const previous =
                await this.idempotencyRepository.findByRequestId(
                    tx,
                    input.accountId,
                    input.requestId
                );

            if (previous) {
                if (
                    previous.user_id !== user.id ||
                    previous.units_requested !== input.units
                ) {
                    throw new Error(
                        "Request ID already used with different parameters"
                    );
                }

                return {
                    accepted: previous.accepted,
                    scope: previous.rejection_scope,
                    rule: previous.rejection_rule,
                    replayed: true,
                    accountRemaining:
                        previous.account_remaining_after?.toString() ?? null,
                    userRemaining:
                        previous.user_remaining_after?.toString() ?? null
                };
            }

            const account = await tx.accounts.findUnique({
                where: { id: input.accountId },
                include: {
                    plans_accounts_plan_idToplans: true
                }
            });

            if (!account) {
                throw new Error("Account not found");
            }

            const now = new Date();

            const monthStart = new Date(
                Date.UTC(
                    now.getUTCFullYear(),
                    now.getUTCMonth(),
                    1
                )
            );

            await this.usageRepository.ensureMonthlyRows(
                tx,
                input.accountId,
                user.id,
                monthStart
            );

            const accountUsage = await tx.monthly_usage.findFirst({
                where: {
                    account_id: input.accountId,
                    user_id: null,
                    month_start: monthStart
                }
            });

            const userUsage = await tx.monthly_usage.findFirst({
                where: {
                    account_id: input.accountId,
                    user_id: user.id,
                    month_start: monthStart
                }
            });

            if (!accountUsage || !userUsage) {
                throw new Error("Monthly usage records not found");
            }

            const accountPlan = account.plans_accounts_plan_idToplans;
            const userPlan = user.plans;

            const accountRemaining =
                accountPlan.monthly_limit > accountUsage.units_used
                    ? accountPlan.monthly_limit - accountUsage.units_used
                    : 0n;

            const userRemaining =
                userPlan.monthly_limit > userUsage.units_used
                    ? userPlan.monthly_limit - userUsage.units_used
                    : 0n;

            const decision = QuotaPolicy.evaluate(input.units, {
                accountRemaining,
                userRemaining,
                accountMaxRequest: accountPlan.max_per_request,
                userMaxRequest: userPlan.max_per_request
            });

            if (decision.accepted) {
                const accountUpdated =
                    await this.usageRepository.incrementIfWithinLimit(
                        tx,
                        accountUsage.id,
                        input.units,
                        accountPlan.monthly_limit
                    );

                if (!accountUpdated) {
                    throw new Error("Concurrent account quota update");
                }

                const userUpdated =
                    await this.usageRepository.incrementIfWithinLimit(
                        tx,
                        userUsage.id,
                        input.units,
                        userPlan.monthly_limit
                    );

                if (!userUpdated) {
                    throw new Error("Concurrent user quota update");
                }

                // Create alerts only when accepted usage crosses
                // a threshold. All writes share the transaction.
                const accountUsedAfter =
                    accountUsage.units_used + input.units;

                const userUsedAfter =
                    userUsage.units_used + input.units;

                const accountThresholds =
                    LowCreditNotificationPolicy.crossedThresholds(
                        accountUsage.units_used,
                        accountUsedAfter,
                        accountPlan.monthly_limit
                    );

                for (const threshold of accountThresholds) {
                    const notification = {
                        accountId: input.accountId,
                        userId: null,
                        monthStart,
                        thresholdPercent: threshold,
                        monthlyLimit: accountPlan.monthly_limit,
                        unitsUsed: accountUsedAfter,
                        remainingCredits:
                            accountPlan.monthly_limit - accountUsedAfter
                    };

                    await this.notificationRepository.record(tx, notification);
                    await this.eventProducer.publishThresholdReached(tx, notification);
                }

                const userThresholds =
                    LowCreditNotificationPolicy.crossedThresholds(
                        userUsage.units_used,
                        userUsedAfter,
                        userPlan.monthly_limit
                    );

                for (const threshold of userThresholds) {
                    const notification = {
                        accountId: input.accountId,
                        userId: user.id,
                        monthStart,
                        thresholdPercent: threshold,
                        monthlyLimit: userPlan.monthly_limit,
                        unitsUsed: userUsedAfter,
                        remainingCredits:
                            userPlan.monthly_limit - userUsedAfter
                    };

                    await this.notificationRepository.record(tx, notification);
                    await this.eventProducer.publishThresholdReached(tx, notification);
                }
            }

            const chargedUnits = decision.accepted
                ? input.units
                : 0n;

            const accountRemainingAfter =
                accountRemaining - chargedUnits;

            const userRemainingAfter =
                userRemaining - chargedUnits;

            await this.idempotencyRepository.record(tx, {
                accountId: input.accountId,
                userId: user.id,
                requestId: input.requestId,
                unitsRequested: input.units,
                accepted: decision.accepted,
                rejectionScope: decision.accepted
                    ? null
                    : decision.scope,
                rejectionRule: decision.accepted
                    ? null
                    : decision.rule,
                accountRemainingAfter,
                userRemainingAfter
            });

            return {
                accepted: decision.accepted,
                scope: decision.accepted ? null : decision.scope,
                rule: decision.accepted ? null : decision.rule,
                replayed: false,
                accountRemaining: accountRemainingAfter.toString(),
                userRemaining: userRemainingAfter.toString()
            };
        }, {
            timeout: 15000
        });
    }
}
