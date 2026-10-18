
import type { Prisma } from "../../generated/prisma/client.js";

export class AccountLockRepository {
    async lockAccount(
        tx: Prisma.TransactionClient,
        accountId: bigint
    ): Promise<void> {
        const rows = await tx.$queryRaw<Array<{ id: bigint }>>`
            SELECT id
            FROM accounts
            WHERE id = ${accountId}
            FOR UPDATE
        `;

        if (rows.length === 0) {
            throw new Error("Account not found");
        }
    }
}
