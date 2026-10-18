
import type { PrismaClient } from "../../generated/prisma/client.js";
import { generateApiKey, hashApiKey } from "../../api-keys.js";

export class InvalidAccountPlanError extends Error {
    constructor() {
        super("Invalid account plan");
        this.name = "InvalidAccountPlanError";
    }
}

export class CreateAccountService {
    constructor(private readonly prisma: PrismaClient) {}

    async execute(name: string, planId: bigint) {
        const apiKey = generateApiKey();
        const apiKeyHash = hashApiKey(apiKey);

        const account = await this.prisma.$transaction(async (tx) => {
            // Only predefined account plans can be selected.
            const plan = await tx.plans.findFirst({
                where: {
                    id: planId,
                    plan_type: "account",
                    owner_account_id: null
                }
            });

            if (!plan) {
                throw new InvalidAccountPlanError();
            }

            // Create the account.
            const created = await tx.accounts.create({
                data: {
                    name: name.trim(),
                    api_key_hash: apiKeyHash,
                    plan_id: plan.id
                }
            });

            // Record the account's initial quota limits.
            await tx.plan_limit_history.create({
                data: {
                    account_id: created.id,
                    user_id: null,
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
            account: {
                id: account.id.toString(),
                name: account.name,
                plan_id: account.plan_id.toString(),
                created_at: account.created_at
            },
            apiKey
        };
    }
}
