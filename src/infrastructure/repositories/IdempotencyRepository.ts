
import type { Prisma } from "../../generated/prisma/client.js";

export interface RecordedDecision {
    accountId: bigint;
    userId: bigint;
    requestId: string;
    unitsRequested: bigint;
    accepted: boolean;
    rejectionScope: string | null;
    rejectionRule: string | null;
    accountRemainingAfter: bigint;
    userRemainingAfter: bigint;
}

export class IdempotencyRepository {
    async findByRequestId(
        tx: Prisma.TransactionClient,
        accountId: bigint,
        requestId: string
    ) {
        return tx.usage_requests.findUnique({
            where: {
                account_id_request_id: {
                    account_id: accountId,
                    request_id: requestId
                }
            }
        });
    }

    async record(
        tx: Prisma.TransactionClient,
        decision: RecordedDecision
    ) {
        return tx.usage_requests.create({
            data: {
                account_id: decision.accountId,
                user_id: decision.userId,
                request_id: decision.requestId,
                units_requested: decision.unitsRequested,
                accepted: decision.accepted,
                rejection_scope: decision.rejectionScope,
                rejection_rule: decision.rejectionRule,
                account_remaining_after:
                    decision.accountRemainingAfter,
                user_remaining_after:
                    decision.userRemainingAfter
            }
        });
    }
}
