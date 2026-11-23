import "dotenv/config";

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";

import { prisma } from "../../infrastructure/database/prisma.js";
import { assertTestDatabase } from "../../infrastructure/database/assertTestDatabase.js";
import { hashApiKey } from "../../api-keys.js";
import { CreateAccountService } from "./CreateAccountService.js";
import { CreateProjectService } from "./CreateProjectService.js";

const accountService = new CreateAccountService(prisma);
const projectService = new CreateProjectService(prisma, accountService);

after(async () => {
    await prisma.$disconnect();
});

test("creates a project with its own metering account", async () => {
    await assertTestDatabase(prisma);

    const organizationId = randomUUID();
    let accountId: bigint | undefined;

    try {
        await prisma.$executeRaw`
            INSERT INTO auth.organization
                (id, name, slug, "createdAt")
            VALUES
                (${organizationId},
                 'Provisioning Test',
                 ${organizationId},
                 NOW())
        `;

        const starter = await prisma.plans.findFirstOrThrow({
            where: {
                name: "Starter",
                plan_type: "account",
                owner_account_id: null
            }
        });

        const result = await projectService.execute(
            organizationId,
            "ImageGen Test",
            "imagegen-test",
            starter.id
        );

        accountId = BigInt(result.project.meteringAccountId);

        assert.equal(result.project.organizationId, organizationId);
        assert.equal(result.project.status, "active");

        const account = await prisma.accounts.findUniqueOrThrow({
            where: { id: accountId }
        });

        assert.equal(account.plan_id, starter.id);
        assert.equal(account.api_key_hash, hashApiKey(result.apiKey));

        const history = await prisma.plan_limit_history.findFirstOrThrow({
            where: {
                account_id: accountId,
                change_type: "baseline"
            }
        });

        assert.equal(history.monthly_limit, 100n);
        assert.equal(history.max_per_request, 20n);
    } finally {
        await prisma.projects.deleteMany({
            where: { organization_id: organizationId }
        });

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
});

test("rejects duplicate project slugs without orphaned accounts", async () => {
    await assertTestDatabase(prisma);

    const organizationId = randomUUID();
    let accountId: bigint | undefined;

    try {
        await prisma.$executeRaw`
            INSERT INTO auth.organization
                (id, name, slug, "createdAt")
            VALUES
                (${organizationId},
                 'Duplicate Project Test',
                 ${organizationId},
                 NOW())
        `;

        const starter = await prisma.plans.findFirstOrThrow({
            where: {
                name: "Starter",
                plan_type: "account",
                owner_account_id: null
            }
        });

        const first = await projectService.execute(
            organizationId,
            "First Project",
            "same-slug",
            starter.id
        );

        accountId = BigInt(first.project.meteringAccountId);

        const rejectedAccountName = `Rollback Test ${randomUUID()}`;

        await assert.rejects(
            projectService.execute(
                organizationId,
                rejectedAccountName,
                "same-slug",
                starter.id
            ),
            { code: "P2002" }
        );

        const orphanedAccounts = await prisma.accounts.count({
            where: { name: rejectedAccountName }
        });

        assert.equal(orphanedAccounts, 0);

        const projectCount = await prisma.projects.count({
            where: { organization_id: organizationId }
        });

        assert.equal(projectCount, 1);
    } finally {
        await prisma.projects.deleteMany({
            where: { organization_id: organizationId }
        });

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
});

test("rejects invalid plans without creating accounts or projects", async () => {
    await assertTestDatabase(prisma);

    const organizationId = randomUUID();
    const accountName = `Invalid Plan ${organizationId}`;

    await prisma.$executeRaw`
        INSERT INTO auth.organization
            (id, name, slug, "createdAt")
        VALUES
            (${organizationId},
             'Invalid Plan Test',
             ${organizationId},
             NOW())
    `;

    try {
        await assert.rejects(
            projectService.execute(
                organizationId,
                accountName,
                "invalid-plan",
                -1n
            ),
            { name: "InvalidAccountPlanError" }
        );

        const projects = await prisma.projects.count({
            where: { organization_id: organizationId }
        });

        const accounts = await prisma.accounts.count({
            where: { name: accountName }
        });

        assert.equal(projects, 0);
        assert.equal(accounts, 0);
    } finally {
        await prisma.$executeRaw`
            DELETE FROM auth.organization
            WHERE id = ${organizationId}
        `;
    }
});
