import "dotenv/config";
import { randomUUID } from "node:crypto";

const BASE_URL = "http://localhost:3001";

async function sendRequest(
    method: string,
    path: string,
    body: object,
    apiKey?: string
) {
    const headers: Record<string, string> = {
        "Content-Type": "application/json"
    };

    if (apiKey) {
        headers["X-API-Key"] = apiKey;
    }

    const response = await fetch(`${BASE_URL}${path}`, {
        method,
        headers,
        body: JSON.stringify(body)
    });

    return {
        status: response.status,
        data: await response.json() as any
    };
}

async function main() {
    const adminKey = process.env.ADMIN_API_KEY;

    if (!adminKey) {
        throw new Error("ADMIN_API_KEY is missing");
    }

    console.log("Usage Metering Service - Example Client");
    console.log("Test API:", BASE_URL);

    const demoId = randomUUID();
    console.log("Demo ID:", demoId);

    // 1. Create a fresh account with the Starter plan.
    const accountResponse = await fetch(`${BASE_URL}/accounts`, {
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

    const accountResult = await accountResponse.json() as any;

    if (accountResponse.status !== 201) {
        throw new Error(
            `Account creation failed: ${JSON.stringify(accountResult)}`
        );
    }

    const apiKey = accountResult.apiKey;

    if (typeof apiKey !== "string") {
        throw new Error("Account API key was not returned");
    }

    console.log("\nAccount created:", accountResult.account.id);
    console.log("Initial plan: Starter (100 credits/month)");

    // 2. Create a custom Small Business account plan.
    const customPlan = await sendRequest(
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

    if (customPlan.status !== 201) {
        throw new Error(
            `Custom plan creation failed: ${JSON.stringify(customPlan.data)}`
        );
    }

    // 3. Switch to the custom account plan.
    const customPlanId = Number(customPlan.data.plan.id);

    const initialPlanSwitch = await sendRequest(
        "PATCH",
        "/accounts/plan",
        { planId: customPlanId },
        apiKey
    );

    if (initialPlanSwitch.status !== 200) {
        throw new Error(
            `Plan switching failed: ${JSON.stringify(initialPlanSwitch.data)}`
        );
    }

    console.log("New plan: Small Business (5 shared credits/month)");

    // 4. Create Ahmed and Sara with Premium user plans.
    for (const userId of ["ahmed", "sara"]) {
        const result = await sendRequest(
            "POST",
            "/users",
            { userId, planId: 4 },
            apiKey
        );

        if (result.status !== 201) {
            throw new Error(
                `Failed to create ${userId}: ${JSON.stringify(result.data)}`
            );
        }

        console.log(
            `${userId} created: Premium (100 credits/month)`
        );
    }

    // 5. Ahmed consumes 2 credits.
    // Store the request so we can retry it later.
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

    if (ahmed.status !== 200 || ahmed.data.accepted !== true) {
        throw new Error(
            `Ahmed's request failed: ${JSON.stringify(ahmed.data)}`
        );
    }

    console.log("\nAhmed consumes 2 credits: ACCEPTED");
    console.log("Shared remaining:", ahmed.data.accountRemaining);
    console.log("Ahmed remaining:", ahmed.data.userRemaining);

    // 6. Sara consumes 2 credits.
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

    if (sara.status !== 200 || sara.data.accepted !== true) {
        throw new Error(
            `Sara's request failed: ${JSON.stringify(sara.data)}`
        );
    }

    console.log("\nSara consumes 2 credits: ACCEPTED");
    console.log("Shared remaining:", sara.data.accountRemaining);
    console.log("Sara remaining:", sara.data.userRemaining);

    // 7. Demonstrate a user-level quota rejection.
    const userRejected = await sendRequest(
        "POST",
        "/consume",
        {
            userId: "ahmed",
            units: 11,
            requestId: randomUUID()
        },
        apiKey
    );

    if (
        userRejected.status !== 200 ||
        userRejected.data.accepted !== false ||
        userRejected.data.scope !== "user" ||
        userRejected.data.rule !== "max_per_request"
    ) {
        throw new Error(
            `Unexpected user rejection: ${JSON.stringify(userRejected.data)}`
        );
    }

    console.log("\nAhmed requests 11 credits: REJECTED");
    console.log("Scope:", userRejected.data.scope);
    console.log("Rule:", userRejected.data.rule);

    // 8. Demonstrate an account-level quota rejection.
    const accountRejected = await sendRequest(
        "POST",
        "/consume",
        {
            userId: "sara",
            units: 2,
            requestId: randomUUID()
        },
        apiKey
    );

    if (
        accountRejected.status !== 200 ||
        accountRejected.data.accepted !== false ||
        accountRejected.data.scope !== "account" ||
        accountRejected.data.rule !== "monthly_limit" ||
        Number(accountRejected.data.accountRemaining) !== 1 ||
        Number(accountRejected.data.userRemaining) !== 98
    ) {
        throw new Error(
            `Unexpected account rejection: ${JSON.stringify(accountRejected.data)}`
        );
    }

    console.log("\nSara requests 2 more credits: REJECTED");
    console.log("Scope:", accountRejected.data.scope);
    console.log("Rule:", accountRejected.data.rule);
    console.log("Shared remaining:", accountRejected.data.accountRemaining);
    console.log("Sara remaining:", accountRejected.data.userRemaining);

    // 9. Retry Ahmed's original request (idempotency).
    const retry = await sendRequest(
        "POST",
        "/consume",
        ahmedRequest,
        apiKey
    );

    if (
        retry.status !== 200 ||
        retry.data.accepted !== true ||
        retry.data.replayed !== true
    ) {
        throw new Error(
            `Idempotency check failed: ${JSON.stringify(retry.data)}`
        );
    }

    console.log("\nRetrying Ahmed's original request...");
    console.log("Duplicate recognized:", retry.data.replayed);
    console.log("Additional credits charged: 0");

    // 10. Consume the final shared credit.
    const finalRequest = await sendRequest(
        "POST",
        "/consume",
        {
            userId: "ahmed",
            units: 1,
            requestId: randomUUID()
        },
        apiKey
    );

    if (
        finalRequest.status !== 200 ||
        finalRequest.data.accepted !== true ||
        Number(finalRequest.data.accountRemaining) !== 0 ||
        Number(finalRequest.data.userRemaining) !== 97
    ) {
        throw new Error(
            `Final balance verification failed: ${JSON.stringify(finalRequest.data)}`
        );
    }

    console.log("\nAccount quota exhausted.");
    console.log("Shared remaining:", finalRequest.data.accountRemaining);
    console.log("Ahmed remaining:", finalRequest.data.userRemaining);
    console.log("Sara remaining: 98");

    // 11. Upgrade the account back to Starter.
    // Starter is predefined account plan ID 1.
    const upgrade = await sendRequest(
        "PATCH",
        "/accounts/plan",
        { planId: 1 },
        apiKey
    );

    if (upgrade.status !== 200) {
        throw new Error(
            `Account upgrade failed: ${JSON.stringify(upgrade.data)}`
        );
    }

    console.log("\nAccount upgraded to Starter.");
    console.log("New monthly limit: 100");
    console.log("Credits already consumed: 5");

    // 12. Consume one more credit after upgrading.
    // If the original 5 credits are preserved,
    // the account should have 94 remaining afterward.
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

    if (
        afterUpgrade.status !== 200 ||
        afterUpgrade.data.accepted !== true ||
        Number(afterUpgrade.data.accountRemaining) !== 94 ||
        Number(afterUpgrade.data.userRemaining) !== 97
    ) {
        throw new Error(
            `Upgrade verification failed: ${JSON.stringify(afterUpgrade.data)}`
        );
    }

    console.log("\nSara consumes 1 credit after the upgrade: ACCEPTED");
    console.log("Shared remaining:", afterUpgrade.data.accountRemaining);
    console.log("Sara remaining:", afterUpgrade.data.userRemaining);

    console.log("\nPASS: User and account quotas enforced.");
    console.log("PASS: Rejected requests consumed zero credits.");
    console.log("PASS: Duplicate requests were not double-charged.");
    console.log("PASS: Account upgrade preserved previous usage.");
    console.log("Demo completed successfully!");
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});

