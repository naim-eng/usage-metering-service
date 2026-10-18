
import type { PrismaClient } from "../../generated/prisma/client.js";

export class UserRepository {
    constructor(private readonly prisma: PrismaClient) {}

    async findById(accountId: bigint, userId: bigint) {
        return this.prisma.users.findUnique({
            where: {
                account_id_id: {
                    account_id: accountId,
                    id: userId
                }
            },
            include: {
                plans: true
            }
        });
    }
}
