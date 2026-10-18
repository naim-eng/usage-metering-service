
import "dotenv/config";

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { PrismaClient } from "../../generated/prisma/client.js";
import { assertTestDatabase } from "../../infrastructure/database/assertTestDatabase.js";
import { ConsumeCreditsService } from "./ConsumeCreditsService.js";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
}

const parsedUrl = new URL(databaseUrl);

if (parsedUrl.pathname !== "/usage_metering_test") {
    throw new Error("Integration tests require usage_metering_test");
}

const prisma = new PrismaClient({
    datasources: {
        db: { url: databaseUrl }
    }
});

const service = new ConsumeCreditsService(prisma);

before(async () => {
    await assertTestDatabase(prisma);
});

after(async () => {
    await prisma.$disconnect();
});

test("consumes credits and replays the original decision", async () => {
    const suffix = randomUUID();

    const accountPlan = await prisma.plans.findFirstOrThrow({
        where: {
            name: "Starter",
            plan_type: "account",
            owner_account_id: null
        }
    });

    const userPlan = await prisma.plans.findFirstOrThrow({
        where: {
            name: "Basic",
            plan_type: "user",
            owner_account_id: null
        }
    });

    const account = await prisma.accounts.create({
        data: {
            name: `Prisma Integration ${suffix}`,
            api_key_hash: randomUUID().replaceAll("-", "") +
                randomUUID().replaceAll("-", ""),
            plan_id: accountPlan.id
        }
    });

    await prisma.users.create({
        data: {
            account_id: account.id,
            external_user_id: `test-user-${suffix}`,
            plan_id: userPlan.id
        }
    });

    const requestId = randomUUID();

    const input = {
        accountId: account.id,
        externalUserId: `test-user-${suffix}`,
        units: 2n,
        requestId
    };

    const first = await service.execute(input);

    assert.deepEqual(first, {
        accepted: true,
        scope: null,
        rule: null,
        replayed: false,
        accountRemaining: "98",
        userRemaining: "8"
    });

    const replay = await service.execute(input);

    assert.deepEqual(replay, {
        ...first,
        replayed: true
    });

    const requests = await prisma.usage_requests.findMany({
        where: {
            account_id: account.id,
            request_id: requestId
        }
    });

    assert.equal(requests.length, 1);

    const monthStart = new Date(
        Date.UTC(
            new Date().getUTCFullYear(),
            new Date().getUTCMonth(),
            1
        )
    );

    const usage = await prisma.monthly_usage.findMany({
        where: {
            account_id: account.id,
            month_start: monthStart
        }
    });

    assert.equal(usage.length, 2);

    const accountUsage = usage.find(row => row.user_id === null);
    const userUsage = usage.find(row => row.user_id !== null);

    assert.equal(accountUsage?.units_used, 2n);
    assert.equal(userUsage?.units_used, 2n);
});

test("concurrent requests cannot exceed the user quota", async () => {
    const suffix = randomUUID();

    const accountPlan = await prisma.plans.findFirstOrThrow({
        where: {
            name: "Starter",
            plan_type: "account",
            owner_account_id: null
        }
    });

    const userPlan = await prisma.plans.findFirstOrThrow({
        where: {
            name: "Basic",
            plan_type: "user",
            owner_account_id: null
        }
    });

    const account = await prisma.accounts.create({
        data: {
            name: `Concurrency Test ${suffix}`,
            api_key_hash:
                randomUUID().replaceAll("-", "") +
                randomUUID().replaceAll("-", ""),
            plan_id: accountPlan.id
        }
    });

    const user = await prisma.users.create({
        data: {
            account_id: account.id,
            external_user_id: `concurrent-user-${suffix}`,
            plan_id: userPlan.id
        }
    });

    const results = await Promise.all(
        Array.from({ length: 10 }, () =>
            service.execute({
                accountId: account.id,
                externalUserId: user.external_user_id,
                units: 2n,
                requestId: randomUUID()
            })
        )
    );

    assert.equal(
        results.filter(result => result.accepted).length,
        5
    );

    assert.equal(
        results.filter(result => !result.accepted).length,
        5
    );

    const monthStart = new Date(
        Date.UTC(
            new Date().getUTCFullYear(),
            new Date().getUTCMonth(),
            1
        )
    );

    const accountUsage = await prisma.monthly_usage.findFirstOrThrow({
        where: {
            account_id: account.id,
            user_id: null,
            month_start: monthStart
        }
    });

    const userUsage = await prisma.monthly_usage.findFirstOrThrow({
        where: {
            account_id: account.id,
            user_id: user.id,
            month_start: monthStart
        }
    });

    assert.equal(accountUsage.units_used, 10n);
    assert.equal(userUsage.units_used, 10n);
});

test("rolls back account usage when the transaction fails", async () => {
    const suffix = randomUUID();

    const accountPlan = await prisma.plans.findFirstOrThrow({
        where: {
            name: "Starter",
            plan_type: "account",
            owner_account_id: null
        }
    });

    const account = await prisma.accounts.create({
        data: {
            name: `Rollback Test ${suffix}`,
            api_key_hash:
                randomUUID().replaceAll("-", "") +
                randomUUID().replaceAll("-", ""),
            plan_id: accountPlan.id
        }
    });

    const monthStart = new Date(
        Date.UTC(
            new Date().getUTCFullYear(),
            new Date().getUTCMonth(),
            1
        )
    );

    const usage = await prisma.monthly_usage.create({
        data: {
            account_id: account.id,
            user_id: null,
            month_start: monthStart,
            units_used: 0n
        }
    });

    await assert.rejects(
        prisma.$transaction(async (tx) => {
            const updated = await tx.monthly_usage.updateMany({
                where: {
                    id: usage.id,
                    units_used: { lte: 98n }
                },
                data: {
                    units_used: { increment: 2n }
                }
            });

            assert.equal(updated.count, 1);

            // Deliberately violate the positive-units constraint.
            await tx.usage_requests.create({
                data: {
                    account_id: account.id,
                    user_id: 0n,
                    request_id: randomUUID(),
                    units_requested: -1n,
                    accepted: true
                }
            });
        })
    );

    const afterRollback =
        await prisma.monthly_usage.findUniqueOrThrow({
            where: { id: usage.id }
        });

    assert.equal(afterRollback.units_used, 0n);
});

test("concurrent users cannot exceed the shared account quota", async () => {
    const suffix = randomUUID();

    const accountPlan = await prisma.plans.findFirstOrThrow({
        where: {
            name: "Starter",
            plan_type: "account",
            owner_account_id: null
        }
    });

    const userPlan = await prisma.plans.findFirstOrThrow({
        where: {
            name: "Premium",
            plan_type: "user",
            owner_account_id: null
        }
    });

    const account = await prisma.accounts.create({
        data: {
            name: `Shared Quota Test ${suffix}`,
            api_key_hash:
                randomUUID().replaceAll("-", "") +
                randomUUID().replaceAll("-", ""),
            plan_id: accountPlan.id
        }
    });

    const limitedPlan = await prisma.plans.create({
        data: {
            name: `Five Credit Plan ${suffix}`,
            plan_type: "account",
            owner_account_id: account.id,
            monthly_limit: 5n,
            max_per_request: 5n
        }
    });

    await prisma.accounts.update({
        where: { id: account.id },
        data: { plan_id: limitedPlan.id }
    });

    const users = await Promise.all(
        ["alice", "bob"].map(name =>
            prisma.users.create({
                data: {
                    account_id: account.id,
                    external_user_id: `${name}-${suffix}`,
                    plan_id: userPlan.id
                }
            })
        )
    );

    const results = await Promise.all(
        Array.from({ length: 10 }, (_, index) =>
            service.execute({
                accountId: account.id,
                externalUserId:
                    users[index % users.length].external_user_id,
                units: 1n,
                requestId: randomUUID()
            })
        )
    );

    assert.equal(results.filter(r => r.accepted).length, 5);
    assert.equal(results.filter(r => !r.accepted).length, 5);

    const monthStart = new Date(Date.UTC(
        new Date().getUTCFullYear(),
        new Date().getUTCMonth(),
        1
    ));

    const accountUsage = await prisma.monthly_usage.findFirstOrThrow({
        where: {
            account_id: account.id,
            user_id: null,
            month_start: monthStart
        }
    });

    assert.equal(accountUsage.units_used, 5n);

    const userUsage = await prisma.monthly_usage.findMany({
        where: {
            account_id: account.id,
            user_id: { not: null },
            month_start: monthStart
        }
    });

    assert.equal(
        userUsage.reduce((total, row) => total + row.units_used, 0n),
        5n
    );
});

test("rejects reused request IDs with different units", async () => {
    const suffix = randomUUID();

    const accountPlan = await prisma.plans.findFirstOrThrow({
        where: {
            name: "Starter",
            plan_type: "account",
            owner_account_id: null
        }
    });

    const userPlan = await prisma.plans.findFirstOrThrow({
        where: {
            name: "Basic",
            plan_type: "user",
            owner_account_id: null
        }
    });

    const account = await prisma.accounts.create({
        data: {
            name: `Idempotency Conflict ${suffix}`,
            api_key_hash:
                randomUUID().replaceAll("-", "") +
                randomUUID().replaceAll("-", ""),
            plan_id: accountPlan.id
        }
    });

    const user = await prisma.users.create({
        data: {
            account_id: account.id,
            external_user_id: `conflict-user-${suffix}`,
            plan_id: userPlan.id
        }
    });

    const requestId = randomUUID();

    const first = await service.execute({
        accountId: account.id,
        externalUserId: user.external_user_id,
        units: 1n,
        requestId
    });

    assert.equal(first.accepted, true);

    await assert.rejects(
        service.execute({
            accountId: account.id,
            externalUserId: user.external_user_id,
            units: 2n,
            requestId
        }),
        /Request ID already used with different parameters/
    );

    const records = await prisma.usage_requests.findMany({
        where: {
            account_id: account.id,
            request_id: requestId
        }
    });

    assert.equal(records.length, 1);
    assert.equal(records[0].units_requested, 1n);

    const monthStart = new Date(Date.UTC(
        new Date().getUTCFullYear(),
        new Date().getUTCMonth(),
        1
    ));

    const usage = await prisma.monthly_usage.findMany({
        where: {
            account_id: account.id,
            month_start: monthStart
        }
    });

    assert.equal(
        usage.find(row => row.user_id === null)?.units_used,
        1n
    );

    assert.equal(
        usage.find(row => row.user_id === user.id)?.units_used,
        1n
    );
});
