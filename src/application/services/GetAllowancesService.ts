
import type { PrismaClient } from "../../generated/prisma/client.js";

export class AccountAllowanceNotFoundError extends Error {
    constructor() {
        super("Account not found");
        this.name = "AccountAllowanceNotFoundError";
    }
}

function getMonthStart(now: Date): Date {
    return new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)
    );
}

function remaining(limit: bigint, used: bigint): bigint {
    const difference = limit - used;
    return difference > 0n ? difference : 0n;
}

export class GetAllowancesService {
    constructor(private readonly prisma: PrismaClient) {}

    async getAccount(accountId: bigint) {
        const monthStart = getMonthStart(new Date());

        const account = await this.prisma.accounts.findUnique({
            where: {
                id: accountId
            },
            include: {
                plans_accounts_plan_idToplans: true
            }
        });

        if (!account) {
            throw new AccountAllowanceNotFoundError();
        }

        const usage = await this.prisma.monthly_usage.findFirst({
            where: {
                account_id: accountId,
                user_id: null,
                month_start: monthStart
            },
            select: {
                units_used: true
            }
        });

        const plan = account.plans_accounts_plan_idToplans;
        const unitsUsed = usage?.units_used ?? 0n;

        return {
            account: {
                id: account.id.toString(),
                name: account.name,
                plan_id: plan.id.toString(),
                plan_name: plan.name,
                monthly_limit: plan.monthly_limit.toString(),
                max_per_request: plan.max_per_request.toString(),
                units_used: unitsUsed.toString(),
                units_remaining: remaining(
                    plan.monthly_limit,
                    unitsUsed
                ).toString(),
                month_start: monthStart.toISOString().slice(0, 10)
            }
        };
    }

    async getUsers(accountId: bigint) {
        const monthStart = getMonthStart(new Date());

        const [users, usageRecords] = await Promise.all([
            this.prisma.users.findMany({
                where: {
                    account_id: accountId
                },
                orderBy: {
                    id: "asc"
                },
                include: {
                    plans: true
                }
            }),
            this.prisma.monthly_usage.findMany({
                where: {
                    account_id: accountId,
                    user_id: {
                        not: null
                    },
                    month_start: monthStart
                },
                select: {
                    user_id: true,
                    units_used: true
                }
            })
        ]);

        const usageByUser = new Map(
            usageRecords
                .filter(record => record.user_id !== null)
                .map(record => [
                    record.user_id!.toString(),
                    record.units_used
                ])
        );

        return {
            users: users.map(user => {
                const plan = user.plans;
                const unitsUsed =
                    usageByUser.get(user.id.toString()) ?? 0n;

                return {
                    user_id: user.external_user_id,
                    plan_id: plan.id.toString(),
                    plan_name: plan.name,
                    monthly_limit: plan.monthly_limit.toString(),
                    max_per_request:
                        plan.max_per_request.toString(),
                    units_used: unitsUsed.toString(),
                    units_remaining: remaining(
                        plan.monthly_limit,
                        unitsUsed
                    ).toString(),
                    month_start: monthStart.toISOString().slice(0, 10)
                };
            })
        };
    }
}
