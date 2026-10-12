
import { pool } from "./db.js";

export function getUtcMonthStart(date: Date): string {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, "0");

    return `${year}-${month}-01`;
}

export function checkQuota(
    units: bigint,
    accountRemaining: bigint,
    userRemaining: bigint,
    accountMaxRequest: bigint,
    userMaxRequest: bigint
): { accepted: boolean; scope?: string; rule?: string } {

    if (units > accountMaxRequest) {
        return { accepted: false, scope: "account", rule: "max_per_request" };
    }

    if (units > userMaxRequest) {
        return { accepted: false, scope: "user", rule: "max_per_request" };
    }

    if (units > accountRemaining) {
        return { accepted: false, scope: "account", rule: "monthly_limit" };
    }

    if (units > userRemaining) {
        return { accepted: false, scope: "user", rule: "monthly_limit" };
    }

    return { accepted: true };
}

export async function consumeUnits(
    accountId: string,
    userId: string,
    units: number,
    requestId: string
) {
    // Validate inputs before accessing the database.
    if (!Number.isSafeInteger(units) || units <= 0) {
        throw new Error("Units must be a positive safe integer");
    }

    if (
        typeof userId !== "string" ||
        !userId.trim() ||
        userId.length > 100 ||
        typeof requestId !== "string" ||
        !requestId.trim() ||
        requestId.length > 100
    ) {
        throw new Error("Invalid userId or requestId");
    }

    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        // Lock the account so competing consumption
        // requests are processed one at a time.
        const account = await client.query(
            `SELECT id FROM accounts
             WHERE id = $1
             FOR UPDATE`,
            [accountId]
        );

        if (account.rowCount === 0) {
            throw new Error("Account not found");
        }

        // Find this account's user and both plans.
        const userPlan = await client.query(
            `SELECT u.id, p.monthly_limit, p.max_per_request
             FROM users u
             JOIN plans p ON u.plan_id = p.id
             WHERE u.account_id = $1
               AND u.external_user_id = $2`,
            [accountId, userId.trim()]
        );

        if (userPlan.rowCount === 0) {
            throw new Error("User not found in account");
        }

        const internalUserId = userPlan.rows[0].id;

        // Check whether this request was already processed.
        const previous = await client.query(
            `SELECT user_id, units_requested, accepted,
                    rejection_scope, rejection_rule
             FROM usage_requests
             WHERE account_id = $1 AND request_id = $2`,
            [accountId, requestId]
        );

        if (previous.rowCount !== 0) {
            const old = previous.rows[0];

            if (
                String(old.user_id) !== String(internalUserId) ||
                BigInt(old.units_requested) !== BigInt(units)
            ) {
                throw new Error(
                    "Request ID already used with different parameters"
                );
            }

            await client.query("COMMIT");

            return {
                accepted: old.accepted as boolean,
                scope: old.rejection_scope,
                rule: old.rejection_rule,
                replayed: true
            };
        }

        const accountPlan = await client.query(
            `SELECT p.monthly_limit, p.max_per_request
             FROM accounts a
             JOIN plans p ON a.plan_id = p.id
             WHERE a.id = $1`,
            [accountId]
        );

        if (accountPlan.rowCount === 0) {
            throw new Error("Account plan not found");
        }

        // Determine the UTC month after acquiring the lock.
        const monthStart = getUtcMonthStart(new Date());

        // Read the account's monthly consumption.
        const accountUsage = await client.query(
            `SELECT units_used FROM monthly_usage
             WHERE account_id = $1
               AND user_id IS NULL
               AND month_start = $2`,
            [accountId, monthStart]
        );

        // Read the user's monthly consumption.
        const userUsage = await client.query(
            `SELECT units_used FROM monthly_usage
             WHERE account_id = $1
               AND user_id = $2
               AND month_start = $3`,
            [accountId, internalUserId, monthStart]
        );

        const accountUsed = BigInt(
            accountUsage.rows[0]?.units_used ?? 0
        );

        const userUsed = BigInt(
            userUsage.rows[0]?.units_used ?? 0
        );

        const accountLimit = BigInt(
            accountPlan.rows[0].monthly_limit
        );

        const userLimit = BigInt(
            userPlan.rows[0].monthly_limit
        );

        const accountRemaining =
            accountLimit > accountUsed
                ? accountLimit - accountUsed
                : 0n;

        const userRemaining =
            userLimit > userUsed
                ? userLimit - userUsed
                : 0n;

        // Apply both account and user quota rules.
        const decision = checkQuota(
            BigInt(units),
            accountRemaining,
            userRemaining,
            BigInt(accountPlan.rows[0].max_per_request),
            BigInt(userPlan.rows[0].max_per_request)
        );

        // Update usage only when the request is accepted.
        if (decision.accepted) {
            await client.query(
                `INSERT INTO monthly_usage
                    (account_id, user_id, month_start, units_used)
                 VALUES ($1, NULL, $2, $3)
                 ON CONFLICT (account_id, month_start)
                    WHERE user_id IS NULL
                 DO UPDATE SET
                    units_used = monthly_usage.units_used
                               + EXCLUDED.units_used`,
                [accountId, monthStart, units]
            );

            await client.query(
                `INSERT INTO monthly_usage
                    (account_id, user_id, month_start, units_used)
                 VALUES ($1, $2, $3, $4)
                 ON CONFLICT (user_id, month_start)
                    WHERE user_id IS NOT NULL
                 DO UPDATE SET
                    units_used = monthly_usage.units_used
                               + EXCLUDED.units_used`,
                [accountId, internalUserId, monthStart, units]
            );
        }

        // Save both accepted and rejected decisions.
        await client.query(
            `INSERT INTO usage_requests
                (account_id, user_id, request_id,
                 units_requested, accepted,
                 rejection_scope, rejection_rule)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
                accountId,
                internalUserId,
                requestId,
                units,
                decision.accepted,
                decision.scope ?? null,
                decision.rule ?? null
            ]
        );

        await client.query("COMMIT");

        return {
            accepted: decision.accepted,
            scope: decision.scope ?? null,
            rule: decision.rule ?? null,
            replayed: false,
            accountRemaining: (
                accountRemaining -
                (decision.accepted ? BigInt(units) : 0n)
            ).toString(),
            userRemaining: (
                userRemaining -
                (decision.accepted ? BigInt(units) : 0n)
            ).toString()
        };

    } catch (error) {
        await client.query("ROLLBACK");
        throw error;

    } finally {
        client.release();
    }
}

