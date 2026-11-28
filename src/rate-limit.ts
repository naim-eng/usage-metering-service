import { rateLimit } from "express-rate-limit";

const isTestEnvironment = process.env.NODE_ENV === "test";

export const managementLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: isTestEnvironment ? 10000 : 300,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: {
        error: "Too many requests. Please try again later."
    }
});

// Broad pre-authentication safeguard for consumption traffic.
// Production deployments must configure trusted proxy handling carefully.
export function createConsumptionPreAuthLimiter(limit: number) {
    return rateLimit({
        windowMs: 60 * 1000,
        limit,
        standardHeaders: "draft-8",
        legacyHeaders: false,
        message: {
            error: "Too many requests. Please try again later."
        }
    });
}

export const consumptionPreAuthLimiter = createConsumptionPreAuthLimiter(
    isTestEnvironment ? 100000 : 10000
);

export function createConsumptionLimiter(limit: number) {
    return rateLimit({
        windowMs: 60 * 1000,
        limit,
        keyGenerator: (_req, res) => {
            const accountId = res.locals.account?.id;

            if (typeof accountId !== "string" || !accountId) {
                throw new Error("Authenticated account ID is required");
            }

            return `account:${accountId}`;
        },
        standardHeaders: "draft-8",
        legacyHeaders: false,
        message: {
            error: "Consumption rate limit exceeded. Please try again later."
        }
    });
}

export const consumptionLimiter = createConsumptionLimiter(
    isTestEnvironment ? 10000 : 3000
);
