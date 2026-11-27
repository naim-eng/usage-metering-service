
import "dotenv/config";

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";

import { prisma } from "../../infrastructure/database/prisma.js";
import { assertTestDatabase } from "../../infrastructure/database/assertTestDatabase.js";
import { hashApiKey } from "../../api-keys.js";
import { CreateAccountService } from "./CreateAccountService.js";
import { CreateProjectService } from "./CreateProjectService.js";
import {
    ManageProjectApiKeysService,
    ProjectNotFoundError,
    ProjectApiKeyNotFoundError,
    InvalidProjectApiKeyNameError
} from "./ManageProjectApiKeysService.js";

const accountService = new CreateAccountService(prisma);
const projectService = new CreateProjectService(prisma, accountService);
const apiKeysService = new ManageProjectApiKeysService(prisma);

after(async () => {
    await prisma.$disconnect();
});

test("manages multiple project API keys securely", async () => {
    await assertTestDatabase(prisma);

    const organizationId = randomUUID();
    const otherOrganizationId = randomUUID();

    let projectId: string | undefined;
    let accountId: bigint | undefined;

    try {
        // Create two test organizations.
        for (const id of [organizationId, otherOrganizationId]) {
            await prisma.$executeRaw`
                INSERT INTO auth.organization
                    (id, name, slug, "createdAt")
                VALUES
                    (${id}, 'API Key Test Organization', ${id}, NOW())
            `;
        }

        const starter = await prisma.plans.findFirstOrThrow({
            where: {
                name: "Starter",
                plan_type: "account",
                owner_account_id: null
            }
        });

        const createdProject = await projectService.execute(
            organizationId,
            "API Key Test Project",
            `api-key-test-${randomUUID()}`,
            starter.id
        );

        projectId = createdProject.project.id;
        accountId = BigInt(createdProject.project.meteringAccountId);

        // Create two independently managed keys.
        const first = await apiKeysService.create(
            organizationId,
            projectId,
            "Production"
        );

        const second = await apiKeysService.create(
            organizationId,
            projectId,
            "Development"
        );

        assert.ok(first.apiKey.startsWith("um_"));
        assert.ok(second.apiKey.startsWith("um_"));
        assert.notEqual(first.apiKey, second.apiKey);

        // Verify that plaintext keys are never stored.
        const stored = await prisma.project_api_keys.findMany({
            where: { project_id: projectId }
        });

        assert.equal(stored.length, 3);

        const originalStored = stored.find(
            item => item.key_hash === hashApiKey(createdProject.apiKey)
        );

        assert.ok(originalStored);
        assert.equal(originalStored.name, "Original project key");
        assert.equal(originalStored.revoked_at, null);

        const firstStored = stored.find((item) => item.id === first.id);
        const secondStored = stored.find((item) => item.id === second.id);

        assert.ok(firstStored);
        assert.ok(secondStored);

        assert.equal(firstStored.key_hash, hashApiKey(first.apiKey));
        assert.equal(secondStored.key_hash, hashApiKey(second.apiKey));

        assert.notEqual(firstStored.key_hash, first.apiKey);
        assert.equal(firstStored.key_prefix, first.apiKey.slice(0, 12));

        // Listing must never expose secrets or hashes.
        const listed = await apiKeysService.list(
            organizationId,
            projectId
        );

        assert.equal(listed.length, 3);

        for (const item of listed) {
            assert.equal("apiKey" in item, false);
            assert.equal("key_hash" in item, false);
            assert.equal("keyHash" in item, false);
        }

        // A different organization cannot access the project.
        await assert.rejects(
            apiKeysService.list(otherOrganizationId, projectId),
            ProjectNotFoundError
        );

        await assert.rejects(
            apiKeysService.create(
                otherOrganizationId,
                projectId,
                "Unauthorized"
            ),
            ProjectNotFoundError
        );

        await assert.rejects(
            apiKeysService.revoke(
                otherOrganizationId,
                projectId,
                first.id
            ),
            ProjectNotFoundError
        );

        // Invalid key names must be rejected.
        await assert.rejects(
            apiKeysService.create(organizationId, projectId, "   "),
            InvalidProjectApiKeyNameError
        );

        // Revoke only the first key.
        const revoked = await apiKeysService.revoke(
            organizationId,
            projectId,
            first.id
        );

        assert.deepEqual(revoked, {
            id: first.id,
            revoked: true
        });

        const afterRevocation = await apiKeysService.list(
            organizationId,
            projectId
        );

        const revokedKey = afterRevocation.find(
            (item) => item.id === first.id
        );

        const activeKey = afterRevocation.find(
            (item) => item.id === second.id
        );

        assert.ok(revokedKey?.revokedAt);
        assert.equal(activeKey?.revokedAt, null);

        // The initial project credential is also revocable.
        await apiKeysService.revoke(
            organizationId,
            projectId,
            originalStored.id
        );

        const originalRevoked =
            await prisma.project_api_keys.findUniqueOrThrow({
                where: { id: originalStored.id }
            });

        assert.ok(originalRevoked.revoked_at);

        // Revoking the same key again must fail.
        await assert.rejects(
            apiKeysService.revoke(
                organizationId,
                projectId,
                first.id
            ),
            ProjectApiKeyNotFoundError
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
            WHERE id IN (${organizationId}, ${otherOrganizationId})
        `;
    }
});
