import type {
    PrismaClient,
    Prisma
} from "../../generated/prisma/client.js";
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
        return this.prisma.$transaction(async (tx) => {
            return this.executeInTransaction(tx, name, planId);
        });
    }

    async executeInTransaction(
        tx: Prisma.TransactionClient,
        name: string,
        planId: bigint
    ) {
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

        const apiKey = generateApiKey();
        const apiKeyHash = hashApiKey(apiKey);

        const account = await tx.accounts.create({
            data: {
                name: name.trim(),
                api_key_hash: apiKeyHash,
                plan_id: plan.id
            }
        });

        await tx.plan_limit_history.create({
            data: {
                account_id: account.id,
                user_id: null,
                plan_id: plan.id,
                plan_name: plan.name,
                monthly_limit: plan.monthly_limit,
                max_per_request: plan.max_per_request,
                change_type: "baseline"
            }
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
