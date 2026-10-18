
import type { PrismaClient } from "../../generated/prisma/client.js";
import { AccountLockRepository } from "../../infrastructure/repositories/AccountLockRepository.js";

export class UserNotFoundForPlanChangeError extends Error {
    constructor() {
        super("User not found in account");
        this.name = "UserNotFoundForPlanChangeError";
    }
}

export class InvalidUserPlanSelectionError extends Error {
    constructor() {
        super("Invalid or inaccessible user plan");
        this.name = "InvalidUserPlanSelectionError";
    }
}

export class ChangeUserPlanService {
    private readonly accountLocks = new AccountLockRepository();

    constructor(private readonly prisma: PrismaClient) {}

    async execute(
        accountId: bigint,
        externalUserId: string,
        planId: bigint
    ) {
        return this.prisma.$transaction(async (tx) => {
            // Coordinate with consumption and plan modifications.
            await this.accountLocks.lockAccount(tx, accountId);

            // Ensure the user belongs to the authenticated account.
            const user = await tx.users.findUnique({
                where: {
                    account_id_external_user_id: {
                        account_id: accountId,
                        external_user_id: externalUserId.trim()
                    }
                }
            });

            if (!user) {
                throw new UserNotFoundForPlanChangeError();
            }

            // Allow system plans or custom plans owned by this account.
            const plan = await tx.plans.findFirst({
                where: {
                    id: planId,
                    plan_type: "user",
                    OR: [
                        { owner_account_id: null },
                        { owner_account_id: accountId }
                    ]
                }
            });

            if (!plan) {
                throw new InvalidUserPlanSelectionError();
            }

            // Preserve idempotent plan assignment.
            if (user.plan_id === plan.id) {
                return {
                    message: "User is already on this plan",
                    userId: externalUserId.trim(),
                    planId: plan.id.toString(),
                    planName: plan.name
                };
            }

            await tx.users.update({
                where: {
                    account_id_id: {
                        account_id: accountId,
                        id: user.id
                    }
                },
                data: {
                    plan_id: plan.id
                }
            });

            // Record the exact limits effective after the switch.
            await tx.plan_limit_history.create({
                data: {
                    account_id: accountId,
                    user_id: user.id,
                    plan_id: plan.id,
                    plan_name: plan.name,
                    monthly_limit: plan.monthly_limit,
                    max_per_request: plan.max_per_request,
                    change_type: "user_plan_switch"
                }
            });

            return {
                message: "User plan updated",
                userId: externalUserId.trim(),
                planId: plan.id.toString(),
                planName: plan.name
            };
        });
    }
}
