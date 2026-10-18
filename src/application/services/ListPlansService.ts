
import type { PrismaClient } from "../../generated/prisma/client.js";

export class ListPlansService {
    constructor(private readonly prisma: PrismaClient) {}

    async execute() {
        const plans = await this.prisma.plans.findMany({
            where: {
                owner_account_id: null
            },
            orderBy: {
                id: "asc"
            },
            select: {
                id: true,
                name: true,
                plan_type: true,
                monthly_limit: true,
                max_per_request: true
            }
        });

        return plans.map(plan => ({
            id: plan.id.toString(),
            name: plan.name,
            plan_type: plan.plan_type,
            monthly_limit: plan.monthly_limit.toString(),
            max_per_request: plan.max_per_request.toString()
        }));
    }
}
