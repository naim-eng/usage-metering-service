import { Router } from "express";

import { authenticateAccount } from "./auth.js";
import { GetNotificationsService } from "./application/services/GetNotificationsService.js";
import { prisma } from "./infrastructure/database/prisma.js";

export const notificationsRouter = Router();

const getNotificationsService = new GetNotificationsService(prisma);

notificationsRouter.get(
    "/notifications",
    authenticateAccount,
    async (_req, res) => {
        try {
            const accountId = BigInt(res.locals.account.id);

            const result =
                await getNotificationsService.execute(accountId);

            res.status(200).json(result);
        } catch (error) {
            console.error("Failed to retrieve notifications:", error);

            res.status(500).json({
                error: "Failed to retrieve notifications"
            });
        }
    }
);
