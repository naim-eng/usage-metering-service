
import { checkQuota } from "./consume.js";

function runTest(
    name: string,
    units: bigint,
    accountRemaining: bigint,
    userRemaining: bigint
) {
    const result = checkQuota(
        units,
        accountRemaining,
        userRemaining,
        20n, // Account maximum per request
        2n   // Ahmed's maximum per request
    );

    console.log(name, result);
}

runTest("Test 1: Valid request", 2n, 100n, 10n);
runTest("Test 2: User request limit", 3n, 100n, 10n);
runTest("Test 3: Account monthly limit", 2n, 1n, 10n);
