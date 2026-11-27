import { randomUUID } from "node:crypto";
import { generateApiKey, hashApiKey } from "../../api-keys.js";
import type { PrismaClient } from "../../generated/prisma/client.js";
import { CreateAccountService } from "./CreateAccountService.js";

export class CreateProjectService {
    constructor(
        private readonly prisma: PrismaClient,
        private readonly createAccountService: CreateAccountService
    ) {}

    async execute(
        organizationId: string,
        name: string,
        slug: string,
        planId: bigint
    ) {
        return this.prisma.$transaction(async (tx) => {
            // Provision the metering account inside this transaction.
            const result =
                await this.createAccountService.executeInTransaction(
                    tx,
                    name,
                    planId
                );

            // Link the project to its metering account.
            const project = await tx.projects.create({
                data: {
                    id: randomUUID(),
                    organization_id: organizationId,
                    name: name.trim(),
                    slug,
                    metering_account_id: BigInt(result.account.id),
                    status: "active"
                }
            });

            const apiKey = generateApiKey();

            await tx.project_api_keys.create({
                data: {
                    id: randomUUID(),
                    project_id: project.id,
                    name: "Original project key",
                    key_hash: hashApiKey(apiKey),
                    key_prefix: apiKey.slice(0, 12)
                }
            });

            return {
                project: {
                    id: project.id,
                    organizationId: project.organization_id,
                    name: project.name,
                    slug: project.slug,
                    status: project.status,
                    meteringAccountId: result.account.id
                },
                apiKey
            };
        });
    }
}
