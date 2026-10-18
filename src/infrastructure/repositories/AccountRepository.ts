
import type { PrismaClient } from "../../generated/prisma/client.js";

export class AccountRepository {
    constructor(private readonly prisma: PrismaClient) {}

    async findById(accountId: bigint) {
        return this.prisma.accounts.findUnique({
            where: {
                id: accountId
            },
            include: {
                plans_accounts_plan_idToplans: true
            }
        });
    }
}
