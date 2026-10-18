
import type { PrismaClient } from "../../generated/prisma/client.js";

export interface GetUsageHistoryInput {
    accountId: bigint;
    page: number;
    limit: number;
}

export class GetUsageHistoryService {
    constructor(private readonly prisma: PrismaClient) {}

    async execute(input: GetUsageHistoryInput) {
        const offset = (input.page - 1) * input.limit;

        const requests = await this.prisma.usage_requests.findMany({
            where: {
                account_id: input.accountId
            },
            orderBy: [
                { created_at: "desc" },
                { id: "desc" }
            ],
            skip: offset,
            take: input.limit,
            select: {
                request_id: true,
                units_requested: true,
                accepted: true,
                rejection_scope: true,
                rejection_rule: true,
                created_at: true,
                users_usage_requests_account_id_user_idTousers: {
                    select: {
                        external_user_id: true
                    }
                }
            }
        });

        return {
            page: input.page,
            limit: input.limit,
            history: requests.map(request => ({
                request_id: request.request_id,
                user_id:
                    request
                        .users_usage_requests_account_id_user_idTousers
                        .external_user_id,
                units_requested: request.units_requested.toString(),
                accepted: request.accepted,
                rejection_scope: request.rejection_scope,
                rejection_rule: request.rejection_rule,
                created_at: request.created_at
            }))
        };
    }
}
