
import "dotenv/config";
import { randomUUID } from "node:crypto";

// Only use the isolated test API.
// Never run this demonstration against the main API.
const BASE_URL =
    process.env.API_BASE_URL ?? "http://localhost:3001";

const target = new URL(BASE_URL);
const isLocalTestApi =
    ["localhost", "127.0.0.1"].includes(target.hostname) &&
    target.port === "3001";

const isDockerDemoApi =
    target.hostname === "demo-api" &&
    target.port === "3000";

if (
    target.protocol !== "http:" ||
    !(isLocalTestApi || isDockerDemoApi)
) {
    throw new Error(
        "Demo must use localhost:3001 or the isolated Docker demo-api:3000"
    );
}

type ApiResult = {
    status: number;
    data: any;
};

async function sendRequest(
    method: string,
    path: string,
    body?: object,
    apiKey?: string
): Promise<ApiResult> {
    const headers: Record<string, string> = {};

    if (body !== undefined) {
        headers["Content-Type"] = "application/json";
    }

    if (apiKey) {
        headers["X-API-Key"] = apiKey;
    }

    const response = await fetch(`${BASE_URL}${path}`, {
        method,
        headers,
        ...(body !== undefined
            ? { body: JSON.stringify(body) }
            : {})
    });

    return {
        status: response.status,
        data: await response.json()
    };
}

function assertResponse(
    condition: boolean,
    message: string,
    data?: unknown
): void {
    if (!condition) {
        throw new Error(
            `${message}${data === undefined
                ? ""
                : `: ${JSON.stringify(data)}`}`
        );
    }
}

async function main() {
    const adminKey = process.env.ADMIN_API_KEY;

    if (!adminKey) {
        throw new Error("ADMIN_API_KEY is missing");
    }

    console.log("Usage Metering Service - Example Client");
    console.log("Test API:", BASE_URL);

    const demoId = randomUUID();

    // 1. Create a fresh account on the Starter plan.
    const accountResponse = await sendRequest(
        "POST",
        "/accounts",
        {
            name: `Demo Account ${demoId}`,
            planId: 1
        }
    );

    // Account creation requires the separate admin key.
    // The request above has no API key, so send it with
    // the administrative authentication header instead.
    // This request is intentionally handled below.
    assertResponse(
        accountResponse.status === 401,
        "Account creation must require admin authentication",
        accountResponse.data
    );

    const createdResponse = await fetch(`${BASE_URL}/accounts`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "X-Admin-Key": adminKey
        },
        body: JSON.stringify({
            name: `Demo Account ${demoId}`,
            planId: 1
        })
    });

    const createdAccount = await createdResponse.json() as any;

    assertResponse(
        createdResponse.status === 201 &&
            typeof createdAccount.apiKey === "string",
        "Account creation failed",
        createdAccount
    );

    const apiKey: string = createdAccount.apiKey;

    console.log("\nAccount created:", createdAccount.account.id);

    // 2. Create and assign a custom account plan.
    const custom = await sendRequest(
        "POST",
        "/plans",
        {
            name: `Small Business ${demoId}`,
            planType: "account",
            monthlyLimit: 5,
            maxPerRequest: 20
        },
        apiKey
    );

    assertResponse(
        custom.status === 201,
        "Custom plan creation failed",
        custom.data
    );

    const customPlanId = Number(custom.data.plan.id);

    const switched = await sendRequest(
        "PATCH",
        "/accounts/plan",
        { planId: customPlanId },
        apiKey
    );

    assertResponse(
        switched.status === 200,
        "Custom account plan assignment failed",
        switched.data
    );

    // 3. Register users with DIFFERENT plans.
    // Ahmed: Premium (100 monthly, 10 per request).
    // Sara: Basic (10 monthly, 2 per request).
    const users = [
        { userId: "ahmed", planId: 4 },
        { userId: "sara", planId: 3 }
    ];

    for (const user of users) {
        const result = await sendRequest(
            "POST",
            "/users",
            user,
            apiKey
        );

        assertResponse(
            result.status === 201,
            `Failed to register ${user.userId}`,
            result.data
        );
    }

    console.log("Ahmed: Premium plan");
    console.log("Sara: Basic plan");

    // 4. Inspect account and user allowances.
    const accountInfo = await sendRequest(
        "GET",
        "/account",
        undefined,
        apiKey
    );

    assertResponse(
        accountInfo.status === 200 &&
            Number(accountInfo.data.account.monthly_limit) === 5 &&
            Number(accountInfo.data.account.units_remaining) === 5,
        "Initial account allowance is incorrect",
        accountInfo.data
    );

    const userInfo = await sendRequest(
        "GET",
        "/users",
        undefined,
        apiKey
    );

    assertResponse(
        userInfo.status === 200,
        "User allowance lookup failed",
        userInfo.data
    );

    const ahmedInfo = userInfo.data.users.find(
        (user: any) => user.user_id === "ahmed"
    );

    const saraInfo = userInfo.data.users.find(
        (user: any) => user.user_id === "sara"
    );

    assertResponse(
        ahmedInfo?.plan_name === "Premium" &&
            Number(ahmedInfo.units_remaining) === 100 &&
            saraInfo?.plan_name === "Basic" &&
            Number(saraInfo.units_remaining) === 10,
        "User plan inspection failed",
        userInfo.data
    );

    // 5. Inspect custom plans.
    const customPlans = await sendRequest(
        "GET",
        "/plans/custom",
        undefined,
        apiKey
    );

    assertResponse(
        customPlans.status === 200 &&
            customPlans.data.plans.some(
                (plan: any) =>
                    String(plan.id) === String(customPlanId)
            ),
        "Custom plan listing failed",
        customPlans.data
    );

    console.log("PASS: Plan and allowance inspection.");

    // 6. Ahmed consumes 2 credits.
    const ahmedRequest = {
        userId: "ahmed",
        units: 2,
        requestId: randomUUID()
    };

    const ahmed = await sendRequest(
        "POST",
        "/consume",
        ahmedRequest,
        apiKey
    );

    assertResponse(
        ahmed.status === 200 &&
            ahmed.data.accepted === true &&
            ahmed.data.accountRemaining === "3" &&
            ahmed.data.userRemaining === "98",
        "Ahmed consumption failed",
        ahmed.data
    );

    // 7. Sara consumes 2 credits.
    const sara = await sendRequest(
        "POST",
        "/consume",
        {
            userId: "sara",
            units: 2,
            requestId: randomUUID()
        },
        apiKey
    );

    assertResponse(
        sara.status === 200 &&
            sara.data.accepted === true &&
            sara.data.accountRemaining === "1" &&
            sara.data.userRemaining === "8",
        "Sara consumption failed",
        sara.data
    );

    console.log("PASS: Two users with different plans consume credits.");

    // 8. Sara exceeds her per-request limit of 2.
    const userRejected = await sendRequest(
        "POST",
        "/consume",
        {
            userId: "sara",
            units: 3,
            requestId: randomUUID()
        },
        apiKey
    );

    assertResponse(
        userRejected.status === 200 &&
            userRejected.data.accepted === false &&
            userRejected.data.scope === "user" &&
            userRejected.data.rule === "max_per_request",
        "User-level rejection failed",
        userRejected.data
    );

    // 9. Ahmed requests more than the shared balance.
    const accountRejected = await sendRequest(
        "POST",
        "/consume",
        {
            userId: "ahmed",
            units: 2,
            requestId: randomUUID()
        },
        apiKey
    );

    assertResponse(
        accountRejected.status === 200 &&
            accountRejected.data.accepted === false &&
            accountRejected.data.scope === "account" &&
            accountRejected.data.rule === "monthly_limit" &&
            accountRejected.data.accountRemaining === "1",
        "Account-level rejection failed",
        accountRejected.data
    );

    console.log("PASS: Account and user quota rejections.");

    // 10. Replay Ahmed's original request.
    const retry = await sendRequest(
        "POST",
        "/consume",
        ahmedRequest,
        apiKey
    );

    assertResponse(
        retry.status === 200 &&
            retry.data.accepted === true &&
            retry.data.replayed === true &&
            retry.data.accountRemaining === ahmed.data.accountRemaining &&
            retry.data.userRemaining === ahmed.data.userRemaining,
        "Idempotent replay failed",
        retry.data
    );

    console.log("PASS: Idempotent retries preserve original balances.");

    // 11. Consume the final shared credit.
    const final = await sendRequest(
        "POST",
        "/consume",
        {
            userId: "ahmed",
            units: 1,
            requestId: randomUUID()
        },
        apiKey
    );

    assertResponse(
        final.status === 200 &&
            final.data.accepted === true &&
            final.data.accountRemaining === "0" &&
            final.data.userRemaining === "97",
        "Final shared credit consumption failed",
        final.data
    );

    // 12. Upgrade to the predefined Starter account plan.
    const upgrade = await sendRequest(
        "PATCH",
        "/accounts/plan",
        { planId: 1 },
        apiKey
    );

    assertResponse(
        upgrade.status === 200,
        "Account upgrade failed",
        upgrade.data
    );

    // 13. Sara consumes another credit after the upgrade.
    const afterUpgrade = await sendRequest(
        "POST",
        "/consume",
        {
            userId: "sara",
            units: 1,
            requestId: randomUUID()
        },
        apiKey
    );

    assertResponse(
        afterUpgrade.status === 200 &&
            afterUpgrade.data.accepted === true &&
            afterUpgrade.data.accountRemaining === "94" &&
            afterUpgrade.data.userRemaining === "7",
        "Usage was not preserved across the account upgrade",
        afterUpgrade.data
    );

    // 14. Confirm final allowance inspection.
    const finalAccount = await sendRequest(
        "GET",
        "/account",
        undefined,
        apiKey
    );

    assertResponse(
        finalAccount.status === 200 &&
            finalAccount.data.account.plan_name === "Starter" &&
            Number(finalAccount.data.account.units_used) === 6 &&
            Number(finalAccount.data.account.units_remaining) === 94,
        "Final account allowance inspection failed",
        finalAccount.data
    );

    console.log("PASS: Plan upgrades preserve consumed credits.");
    console.log("PASS: Final usage and remaining allowances.");

    console.log("\nDemo completed successfully!");
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
