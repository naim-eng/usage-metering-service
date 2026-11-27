
import "dotenv/config";

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";

import { prisma } from "./infrastructure/database/prisma.js";
import { assertTestDatabase } from "./infrastructure/database/assertTestDatabase.js";
import { CreateAccountService } from "./application/services/CreateAccountService.js";
import { CreateProjectService } from "./application/services/CreateProjectService.js";
import { ManageProjectApiKeysService } from "./application/services/ManageProjectApiKeysService.js";

const BASE_URL = "http://localhost:3001";

const accountService = new CreateAccountService(prisma);
const projectService = new CreateProjectService(
    prisma,
    accountService
);
const apiKeysService = new ManageProjectApiKeysService(prisma);

after(async () => {
    await prisma.$disconnect();
});

async function authenticatedRequest(apiKey: string) {
    const response = await fetch(
        `${BASE_URL}/account`,
        {
            headers: {
                "X-API-Key": apiKey
            }
        }
    );

    return {
        status: response.status,
        data: await response.json() as Record<string, unknown>
    };
}

test(
    "authenticates active project keys and rejects revoked or inactive keys",
    async () => {
        await assertTestDatabase(prisma);

        const organizationId = randomUUID();

        let projectId: string | undefined;
        let accountId: bigint | undefined;

        try {
            await prisma.$executeRaw`
                INSERT INTO auth.organization
                    (id, name, slug, "createdAt")
                VALUES
                    (
                        ${organizationId},
                        'Project Key Authentication Test',
                        ${organizationId},
                        NOW()
                    )
            `;

            const starter = await prisma.plans.findFirstOrThrow({
                where: {
                    name: "Starter",
                    plan_type: "account",
                    owner_account_id: null
                }
            });

            const created = await projectService.execute(
                organizationId,
                "Authentication Test Project",
                `auth-test-${randomUUID()}`,
                starter.id
            );

            projectId = created.project.id;
            accountId = BigInt(
                created.project.meteringAccountId
            );

            const originalKey = created.apiKey;

            const productionKey = await apiKeysService.create(
                organizationId,
                projectId,
                "Production"
            );

            const developmentKey = await apiKeysService.create(
                organizationId,
                projectId,
                "Development"
            );

            // Both newly generated keys must authenticate.
            const productionResponse =
                await authenticatedRequest(
                    productionKey.apiKey
                );

            const developmentResponse =
                await authenticatedRequest(
                    developmentKey.apiKey
                );

            assert.equal(productionResponse.status, 200);
            assert.equal(developmentResponse.status, 200);

            // The initial managed project key must authenticate.
            const originalResponse =
                await authenticatedRequest(originalKey);

            assert.equal(originalResponse.status, 200);

            // Revoke only the production key.
            await apiKeysService.revoke(
                organizationId,
                projectId,
                productionKey.id
            );

            const revokedResponse =
                await authenticatedRequest(
                    productionKey.apiKey
                );

            assert.equal(revokedResponse.status, 401);
            assert.equal(
                revokedResponse.data.error,
                "Invalid API key"
            );

            // Other keys must remain valid.
            assert.equal(
                (await authenticatedRequest(
                    developmentKey.apiKey
                )).status,
                200
            );

            assert.equal(
                (await authenticatedRequest(
                    originalKey
                )).status,
                200
            );

            // An inactive project must reject its project keys.
            await prisma.projects.update({
                where: { id: projectId },
                data: { status: "failed" }
            });

            const inactiveResponse =
                await authenticatedRequest(
                    developmentKey.apiKey
                );

            assert.equal(inactiveResponse.status, 401);
            assert.equal(
                inactiveResponse.data.error,
                "Invalid API key"
            );

            // Initial managed project keys must also be denied.
            const inactiveOriginalResponse =
                await authenticatedRequest(originalKey);

            assert.equal(inactiveOriginalResponse.status, 401);
            assert.equal(
                inactiveOriginalResponse.data.error,
                "Invalid API key"
            );

            // Reactivation restores valid credentials only.
            await prisma.projects.update({
                where: { id: projectId },
                data: { status: "active" }
            });

            assert.equal(
                (await authenticatedRequest(originalKey)).status,
                200
            );

            assert.equal(
                (await authenticatedRequest(
                    developmentKey.apiKey
                )).status,
                200
            );

            assert.equal(
                (await authenticatedRequest(
                    productionKey.apiKey
                )).status,
                401
            );
            // Revocation must also apply to the original key.
            const originalRecord =
                await prisma.project_api_keys.findFirstOrThrow({
                    where: {
                        project_id: projectId,
                        name: "Original project key"
                    }
                });

            await apiKeysService.revoke(
                organizationId,
                projectId,
                originalRecord.id
            );

            const revokedOriginal =
                await authenticatedRequest(originalKey);

            assert.equal(revokedOriginal.status, 401);
            assert.equal(
                revokedOriginal.data.error,
                "Invalid API key"
            );

            assert.equal(
                (await authenticatedRequest(
                    developmentKey.apiKey
                )).status,
                200
            );

        } finally {
            if (projectId) {
                await prisma.project_api_keys.deleteMany({
                    where: { project_id: projectId }
                });

                await prisma.projects.deleteMany({
                    where: { id: projectId }
                });
            }

            if (accountId !== undefined) {
                await prisma.plan_limit_history.deleteMany({
                    where: { account_id: accountId }
                });

                await prisma.accounts.delete({
                    where: { id: accountId }
                });
            }

            await prisma.$executeRaw`
                DELETE FROM auth.organization
                WHERE id = ${organizationId}
            `;
        }
    }
);
