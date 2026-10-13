
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
        return {
            accepted: false,
            scope: "account",
            rule: "max_per_request"
        };
    }

    if (units > userMaxRequest) {
        return {
            accepted: false,
            scope: "user",
            rule: "max_per_request"
        };
    }

    if (units > accountRemaining) {
        return {
            accepted: false,
            scope: "account",
            rule: "monthly_limit"
        };
    }

    if (units > userRemaining) {
        return {
            accepted: false,
            scope: "user",
            rule: "monthly_limit"
        };
    }

    return { accepted: true };
}

export async function consumeUnits(
    accountId: string,
    userId: string,
    units: number,
    requestId: string
) {
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

        // Serialize consumption and plan changes for this account.
        const account = await client.query(
            `SELECT id
             FROM accounts
             WHERE id = $1
             FOR UPDATE`,
            [accountId]
        );

        if (account.rowCount === 0) {
            throw new Error("Account not found");
        }

        // Resolve the user within the authenticated account.
        const userPlan = await client.query(
            `SELECT
                u.id,
                p.monthly_limit,
                p.max_per_request
             FROM users u
             JOIN plans p ON p.id = u.plan_id
             WHERE u.account_id = $1
               AND u.external_user_id = $2`,
            [accountId, userId.trim()]
        );

        if (userPlan.rowCount === 0) {
            throw new Error("User not found in account");
        }

        const internalUserId = userPlan.rows[0].id;

        // Return the original decision and balances for a retry.
        const previous = await client.query(
            `SELECT
                user_id,
                units_requested,
                accepted,
                rejection_scope,
                rejection_rule,
                account_remaining_after,
                user_remaining_after
             FROM usage_requests
             WHERE account_id = $1
               AND request_id = $2`,
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
                replayed: true,

                // These may be null for requests recorded
                // before migration 004.
                accountRemaining: old.account_remaining_after,
                userRemaining: old.user_remaining_after
            };
        }

        const accountPlan = await client.query(
            `SELECT
                p.monthly_limit,
                p.max_per_request
             FROM accounts a
             JOIN plans p ON p.id = a.plan_id
             WHERE a.id = $1`,
            [accountId]
        );

        if (accountPlan.rowCount === 0) {
            throw new Error("Account plan not found");
        }

        // Determine the UTC month after acquiring the account lock.
        const monthStart = getUtcMonthStart(new Date());

        const accountUsage = await client.query(
            `SELECT units_used
             FROM monthly_usage
             WHERE account_id = $1
               AND user_id IS NULL
               AND month_start = $2`,
            [accountId, monthStart]
        );

        const userUsage = await client.query(
            `SELECT units_used
             FROM monthly_usage
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

        const decision = checkQuota(
            BigInt(units),
            accountRemaining,
            userRemaining,
            BigInt(accountPlan.rows[0].max_per_request),
            BigInt(userPlan.rows[0].max_per_request)
        );

        // Compute balances once, then store and return them.
        const chargedUnits = decision.accepted
            ? BigInt(units)
            : 0n;

        const accountRemainingAfter =
            (accountRemaining - chargedUnits).toString();

        const userRemainingAfter =
            (userRemaining - chargedUnits).toString();

        // Charge credits only for accepted requests.
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

        // Persist the decision and its original balances
        // atomically with any accepted consumption.
        await client.query(
            `INSERT INTO usage_requests
                (
                    account_id,
                    user_id,
                    request_id,
                    units_requested,
                    accepted,
                    rejection_scope,
                    rejection_rule,
                    account_remaining_after,
                    user_remaining_after
                )
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [
                accountId,
                internalUserId,
                requestId,
                units,
                decision.accepted,
                decision.scope ?? null,
                decision.rule ?? null,
                accountRemainingAfter,
                userRemainingAfter
            ]
        );

        await client.query("COMMIT");

        return {
            accepted: decision.accepted,
            scope: decision.scope ?? null,
            rule: decision.rule ?? null,
            replayed: false,
            accountRemaining: accountRemainingAfter,
            userRemaining: userRemainingAfter
        };
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
}
