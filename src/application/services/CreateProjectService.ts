import { randomUUID } from "node:crypto";
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

            return {
                project: {
                    id: project.id,
                    organizationId: project.organization_id,
                    name: project.name,
                    slug: project.slug,
                    status: project.status,
                    meteringAccountId: result.account.id
                },
                apiKey: result.apiKey
            };
        });
    }
}
