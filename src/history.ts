
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
        const page = Number(req.query.page ?? 1);
        const limit = Number(req.query.limit ?? 50);

        if (
            !Number.isSafeInteger(page) ||
            page < 1 ||
            !Number.isSafeInteger(limit) ||
            limit < 1 ||
            limit > 100 ||
            !Number.isSafeInteger((page - 1) * limit)
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
            console.error("History retrieval failed:", error);

            res.status(500).json({
                error: "Failed to retrieve usage history"
            });
        }
    }
);
