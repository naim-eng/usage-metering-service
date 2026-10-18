
import { Router } from "express";
import { authenticateAccount } from "./auth.js";
import { prisma } from "./infrastructure/database/prisma.js";
import {
    GetMonthlyReportService,
    MonthlyReportAccountNotFoundError
} from "./application/services/GetMonthlyReportService.js";

export const reportsRouter = Router();

const getMonthlyReportService = new GetMonthlyReportService(prisma);

// Retrieve monthly account and user usage with historical plan limits.
reportsRouter.get(
    "/monthly",
    authenticateAccount,
    async (req, res) => {
        const month = req.query.month;

        if (
            typeof month !== "string" ||
            !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)
        ) {
            res.status(400).json({
                error: "Month must be in YYYY-MM format"
            });
            return;
        }

        try {
            const result = await getMonthlyReportService.execute(
                BigInt(res.locals.account.id),
                month
            );

            res.status(200).json(result);
        } catch (error) {
            if (error instanceof MonthlyReportAccountNotFoundError) {
                res.status(404).json({
                    error: "Account not found"
                });
                return;
            }

            console.error("Monthly report failed:", error);

            res.status(500).json({
                error: "Failed to retrieve monthly report"
            });
        }
    }
);
