export const LOW_CREDIT_THRESHOLDS = [80, 90, 100] as const;

export type LowCreditThreshold =
    (typeof LOW_CREDIT_THRESHOLDS)[number];

export class LowCreditNotificationPolicy {
    static crossedThresholds(
        previousUsed: bigint,
        currentUsed: bigint,
        monthlyLimit: bigint
    ): LowCreditThreshold[] {
        if (
            monthlyLimit <= 0n ||
            previousUsed < 0n ||
            currentUsed < previousUsed
        ) {
            throw new Error("Invalid usage or monthly limit");
        }

        return LOW_CREDIT_THRESHOLDS.filter((threshold) => {
            const thresholdValue = BigInt(threshold);

            return (
                previousUsed * 100n < monthlyLimit * thresholdValue &&
                currentUsed * 100n >= monthlyLimit * thresholdValue
            );
        });
    }
}
