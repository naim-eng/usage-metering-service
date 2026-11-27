import type { PrismaClient } from "../../generated/prisma/client.js";
import { generateApiKey, hashApiKey } from "../../api-keys.js";

export class RotateAccountApiKeyService {
    constructor(private readonly prisma: PrismaClient) {}

    async execute(accountId: bigint) {
        const apiKey = generateApiKey();
        const keyHash = hashApiKey(apiKey);

        const updated = await this.prisma.$executeRaw`
            UPDATE public.accounts AS account
            SET api_key_hash = ${keyHash}
            WHERE account.id = ${accountId}
              AND NOT EXISTS (
                  SELECT 1
                  FROM public.projects AS project
                  WHERE project.metering_account_id = account.id
              )
        `;

        if (updated !== 1) {
            return null;
        }

        return {
            accountId: accountId.toString(),
            apiKey
        };
    }
}
