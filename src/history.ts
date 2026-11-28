import { parsePositiveInteger, isValidPagination } from "./input-validation.js";
import { logger } from "./infrastructure/logging/logger.js";

import { Router } from "express";
import { authenticateAccount } from "./auth.js";
import { prisma } from "./infrastructure/database/prisma.js";
import { GetUsageHistoryService } from "./application/services/GetUsageHistoryService.js";

export const historyRouter = Router();

const getUsageHistoryService = new GetUsageHistoryService(prisma);

// Retrieve paginated usage history for the authenticated account.
historyRouter.get(
    "/history",
    authenticateAccount,
    async (req, res) => {
        const page = parsePositiveInteger(req.query.page ?? "1");
        const limit = parsePositiveInteger(req.query.limit ?? "50");

        if (
            !isValidPagination(page, limit)
        ) {
            res.status(400).json({
                error: "Invalid page or limit"
            });
            return;
        }

        try {
            const result = await getUsageHistoryService.execute({
                accountId: BigInt(res.locals.account.id),
                page,
                limit
            });

            res.status(200).json(result);
        } catch (error) {
            logger.error({ event: "api_operation_failed", operation: "get_usage_history" }, "API operation failed");

            res.status(500).json({
                error: "Failed to retrieve usage history"
            });
        }
    }
);
