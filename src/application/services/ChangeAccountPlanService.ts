
import type { PrismaClient } from "../../generated/prisma/client.js";
import { AccountLockRepository } from "../../infrastructure/repositories/AccountLockRepository.js";

export class InvalidAccountPlanSelectionError extends Error {
    constructor() {
        super("Invalid or inaccessible account plan");
        this.name = "InvalidAccountPlanSelectionError";
    }
}

export class ChangeAccountPlanService {
    private readonly accountLocks = new AccountLockRepository();

    constructor(private readonly prisma: PrismaClient) {}

    async execute(accountId: bigint, planId: bigint) {
        return this.prisma.$transaction(async (tx) => {
            // Keep the locking order consistent with consumption.
            await this.accountLocks.lockAccount(tx, accountId);

            const account = await tx.accounts.findUniqueOrThrow({
                where: { id: accountId }
            });

            // Only predefined plans or custom plans owned
            // by the authenticated account are accessible.
            const plan = await tx.plans.findFirst({
                where: {
                    id: planId,
                    plan_type: "account",
                    OR: [
                        { owner_account_id: null },
                        { owner_account_id: accountId }
                    ]
                }
            });

            if (!plan) {
                throw new InvalidAccountPlanSelectionError();
            }

            // Reassigning the same plan must not create
            // a duplicate history event.
            if (account.plan_id === plan.id) {
                return {
                    message: "Account is already on this plan",
                    planId: plan.id.toString(),
                    planName: plan.name
                };
            }

            await tx.accounts.update({
                where: { id: accountId },
                data: { plan_id: plan.id }
            });

            await tx.plan_limit_history.create({
                data: {
                    account_id: accountId,
                    user_id: null,
                    plan_id: plan.id,
                    plan_name: plan.name,
                    monthly_limit: plan.monthly_limit,
                    max_per_request: plan.max_per_request,
                    change_type: "account_plan_switch"
                }
            });

            return {
                message: "Account plan updated",
                planId: plan.id.toString(),
                planName: plan.name
            };
        });
    }
}
