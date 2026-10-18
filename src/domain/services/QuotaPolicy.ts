
export type QuotaDecision =
    | { accepted: true }
    | {
          accepted: false;
          scope: "account" | "user";
          rule: "max_per_request" | "monthly_limit";
      };

export interface QuotaLimits {
    accountRemaining: bigint;
    userRemaining: bigint;
    accountMaxRequest: bigint;
    userMaxRequest: bigint;
}

export class QuotaPolicy {
    static evaluate(
        units: bigint,
        limits: QuotaLimits
    ): QuotaDecision {
        if (units <= 0n) {
            throw new Error("Units must be positive");
        }

        if (units > limits.accountMaxRequest) {
            return {
                accepted: false,
                scope: "account",
                rule: "max_per_request"
            };
        }

        if (units > limits.userMaxRequest) {
            return {
                accepted: false,
                scope: "user",
                rule: "max_per_request"
            };
        }

        if (units > limits.accountRemaining) {
            return {
                accepted: false,
                scope: "account",
                rule: "monthly_limit"
            };
        }

        if (units > limits.userRemaining) {
            return {
                accepted: false,
                scope: "user",
                rule: "monthly_limit"
            };
        }

        return { accepted: true };
    }
}
