
import { Router } from "express";
import { authenticateAccount } from "./auth.js";
import { prisma } from "./infrastructure/database/prisma.js";
import {
    GetAllowancesService,
    AccountAllowanceNotFoundError
} from "./application/services/GetAllowancesService.js";

export const allowancesRouter = Router();

const getAllowancesService = new GetAllowancesService(prisma);

// Inspect the authenticated account's plan and remaining quota.
allowancesRouter.get(
    "/account",
    authenticateAccount,
    async (_req, res) => {
        try {
            const result = await getAllowancesService.getAccount(
                BigInt(res.locals.account.id)
            );

            res.status(200).json(result);
        } catch (error) {
            if (error instanceof AccountAllowanceNotFoundError) {
                res.status(404).json({
                    error: "Account not found"
                });
                return;
            }

            console.error("Account allowance lookup failed:", error);

            res.status(500).json({
                error: "Failed to retrieve account allowance"
            });
        }
    }
);

// Inspect all users and their individual quota allowances.
allowancesRouter.get(
    "/users",
    authenticateAccount,
    async (_req, res) => {
        try {
            const result = await getAllowancesService.getUsers(
                BigInt(res.locals.account.id)
            );

            res.status(200).json(result);
        } catch (error) {
            console.error("User allowance lookup failed:", error);

            res.status(500).json({
                error: "Failed to retrieve user allowances"
            });
        }
    }
);
