
import type { PrismaClient } from "../../generated/prisma/client.js";
import { AccountLockRepository } from "../../infrastructure/repositories/AccountLockRepository.js";

export type CustomPlanType = "account" | "user";

export interface CreateCustomPlanInput {
    accountId: bigint;
    name: string;
    planType: CustomPlanType;
    monthlyLimit: bigint;
    maxPerRequest: bigint;
}

export interface UpdateCustomPlanInput {
    accountId: bigint;
    planId: bigint;
    name?: string;
    monthlyLimit?: bigint;
    maxPerRequest?: bigint;
}

export class CustomPlanNotFoundError extends Error {
    constructor() {
        super("Custom plan not found or not owned by account");
        this.name = "CustomPlanNotFoundError";
    }
}

function serializePlan(plan: {
    id: bigint;
    name: string;
    plan_type: string;
    owner_account_id: bigint | null;
    monthly_limit: bigint;
    max_per_request: bigint;
    created_at: Date;
}) {
    return {
        id: plan.id.toString(),
        name: plan.name,
        plan_type: plan.plan_type,
        owner_account_id: plan.owner_account_id?.toString() ?? null,
        monthly_limit: plan.monthly_limit.toString(),
        max_per_request: plan.max_per_request.toString(),
        created_at: plan.created_at
    };
}

export class CustomPlanService {
    private readonly accountLocks = new AccountLockRepository();

    constructor(private readonly prisma: PrismaClient) {}

    async list(accountId: bigint) {
        const plans = await this.prisma.plans.findMany({
            where: {
                owner_account_id: accountId
            },
            orderBy: {
                id: "asc"
            }
        });

        return {
            plans: plans.map(serializePlan)
        };
    }

    async create(input: CreateCustomPlanInput) {
        const plan = await this.prisma.plans.create({
            data: {
                name: input.name.trim(),
                plan_type: input.planType,
                owner_account_id: input.accountId,
                monthly_limit: input.monthlyLimit,
                max_per_request: input.maxPerRequest
            }
        });

        return {
            plan: serializePlan(plan)
        };
    }

    async update(input: UpdateCustomPlanInput) {
        return this.prisma.$transaction(async (tx) => {
            // Preserve the same locking order used by consumption.
            await this.accountLocks.lockAccount(
                tx,
                input.accountId
            );

            // Lock the specific plan to coordinate concurrent updates.
            const lockedPlans = await tx.$queryRaw<
                Array<{ id: bigint }>
            >`
                SELECT id
                FROM plans
                WHERE id = ${input.planId}
                  AND owner_account_id = ${input.accountId}
                FOR UPDATE
            `;

            if (lockedPlans.length === 0) {
                throw new CustomPlanNotFoundError();
            }

            const current = await tx.plans.findFirst({
                where: {
                    id: input.planId,
                    owner_account_id: input.accountId
                }
            });

            if (!current) {
                throw new CustomPlanNotFoundError();
            }

            const name = input.name === undefined
                ? current.name
                : input.name.trim();

            const monthlyLimit = input.monthlyLimit
                ?? current.monthly_limit;

            const maxPerRequest = input.maxPerRequest
                ?? current.max_per_request;

            const unchanged =
                name === current.name &&
                monthlyLimit === current.monthly_limit &&
                maxPerRequest === current.max_per_request;

            if (unchanged) {
                return {
                    message: "Custom plan is already up to date",
                    plan: serializePlan(current)
                };
            }

            const updated = await tx.plans.update({
                where: { id: current.id },
                data: {
                    name,
                    monthly_limit: monthlyLimit,
                    max_per_request: maxPerRequest
                }
            });

            if (updated.plan_type === "account") {
                const account = await tx.accounts.findUnique({
                    where: { id: input.accountId }
                });

                if (account?.plan_id === updated.id) {
                    await tx.plan_limit_history.create({
                        data: {
                            account_id: input.accountId,
                            user_id: null,
                            plan_id: updated.id,
                            plan_name: updated.name,
                            monthly_limit: updated.monthly_limit,
                            max_per_request: updated.max_per_request,
                            change_type: "custom_plan_update"
                        }
                    });
                }
            }

            if (updated.plan_type === "user") {
                const assignedUsers = await tx.users.findMany({
                    where: {
                        account_id: input.accountId,
                        plan_id: updated.id
                    },
                    select: { id: true }
                });

                if (assignedUsers.length > 0) {
                    await tx.plan_limit_history.createMany({
                        data: assignedUsers.map(user => ({
                            account_id: input.accountId,
                            user_id: user.id,
                            plan_id: updated.id,
                            plan_name: updated.name,
                            monthly_limit: updated.monthly_limit,
                            max_per_request: updated.max_per_request,
                            change_type: "custom_plan_update"
                        }))
                    });
                }
            }

            return {
                message: "Custom plan updated",
                plan: serializePlan(updated)
            };
        }, {
            timeout: 15000
        });
    }
}
