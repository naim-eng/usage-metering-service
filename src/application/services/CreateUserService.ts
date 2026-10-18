
import type { PrismaClient } from "../../generated/prisma/client.js";
import { AccountLockRepository } from "../../infrastructure/repositories/AccountLockRepository.js";

export class InvalidUserPlanError extends Error {
    constructor() {
        super("Invalid or inaccessible user plan");
        this.name = "InvalidUserPlanError";
    }
}

export class AccountNotFoundError extends Error {
    constructor() {
        super("Account not found");
        this.name = "AccountNotFoundError";
    }
}

export class UserAlreadyExistsError extends Error {
    constructor() {
        super("User already exists in this account");
        this.name = "UserAlreadyExistsError";
    }
}

export class CreateUserService {
    private readonly accountLocks = new AccountLockRepository();

    constructor(private readonly prisma: PrismaClient) {}

    async execute(
        accountId: bigint,
        externalUserId: string,
        planId: bigint
    ) {
        try {
            const user = await this.prisma.$transaction(async (tx) => {
                // Coordinate with consumption and plan changes.
                await this.accountLocks.lockAccount(tx, accountId);

                // Only predefined plans or plans owned by
                // this account may be assigned.
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
                    throw new InvalidUserPlanError();
                }

                const created = await tx.users.create({
                    data: {
                        account_id: accountId,
                        external_user_id: externalUserId.trim(),
                        plan_id: plan.id
                    }
                });

                // Store the initial quota limits atomically
                // with user registration.
                await tx.plan_limit_history.create({
                    data: {
                        account_id: accountId,
                        user_id: created.id,
                        plan_id: plan.id,
                        plan_name: plan.name,
                        monthly_limit: plan.monthly_limit,
                        max_per_request: plan.max_per_request,
                        change_type: "baseline"
                    }
                });

                return created;
            });

            return {
                user: {
                    id: user.id.toString(),
                    account_id: user.account_id.toString(),
                    external_user_id: user.external_user_id,
                    plan_id: user.plan_id.toString(),
                    created_at: user.created_at
                }
            };
        } catch (error: unknown) {
            if (
                error instanceof Error &&
                error.message === "Account not found"
            ) {
                throw new AccountNotFoundError();
            }

            // Prisma unique-constraint violation.
            if (
                typeof error === "object" &&
                error !== null &&
                "code" in error &&
                error.code === "P2002"
            ) {
                throw new UserAlreadyExistsError();
            }

            throw error;
        }
    }
}
