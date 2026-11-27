import { isSafeText, parsePositiveInteger } from "./input-validation.js";
import { logger } from "./infrastructure/logging/logger.js";

import { Router } from "express";
import { authenticateAccount } from "./auth.js";
import { prisma } from "./infrastructure/database/prisma.js";
import {
    CustomPlanService,
    CustomPlanNotFoundError,
    type CustomPlanType
} from "./application/services/CustomPlanService.js";

export const plansRouter = Router();

const customPlanService = new CustomPlanService(prisma);

// List custom plans belonging to the authenticated account.
plansRouter.get("/custom", authenticateAccount, async (_req, res) => {
    try {
        const result = await customPlanService.list(
            BigInt(res.locals.account.id)
        );

        res.status(200).json(result);
    } catch (error) {
        logger.error({ event: "api_operation_failed", operation: "list_custom_plans" }, "API operation failed");
        res.status(500).json({
            error: "Failed to retrieve custom plans"
        });
    }
});

// Create a custom account or user plan.
plansRouter.post("/", authenticateAccount, async (req, res) => {
    const { name, planType, monthlyLimit, maxPerRequest } =
        req.body ?? {};

    if (
        !isSafeText(name) ||
        !name.trim() ||
        name.length > 100 ||
        !["account", "user"].includes(planType) ||
        !Number.isSafeInteger(monthlyLimit) ||
        monthlyLimit < 0 ||
        !Number.isSafeInteger(maxPerRequest) ||
        maxPerRequest <= 0
    ) {
        res.status(400).json({
            error: "Invalid plan details"
        });
        return;
    }

    try {
        const result = await customPlanService.create({
            accountId: BigInt(res.locals.account.id),
            name,
            planType: planType as CustomPlanType,
            monthlyLimit: BigInt(monthlyLimit),
            maxPerRequest: BigInt(maxPerRequest)
        });

        res.status(201).json(result);
    } catch (error) {
        logger.error({ event: "api_operation_failed", operation: "create_custom_plan" }, "API operation failed");
        res.status(500).json({
            error: "Failed to create plan"
        });
    }
});

// Update a custom plan and record changes for assigned members.
plansRouter.patch("/:planId", authenticateAccount, async (req, res) => {
    const planId = parsePositiveInteger(req.params.planId);

    const { name, monthlyLimit, maxPerRequest } = req.body ?? {};

    if (!Number.isSafeInteger(planId) || planId <= 0) {
        res.status(400).json({
            error: "Invalid plan ID"
        });
        return;
    }

    if (
        name === undefined &&
        monthlyLimit === undefined &&
        maxPerRequest === undefined
    ) {
        res.status(400).json({
            error: "No plan updates provided"
        });
        return;
    }

    if (
        (name !== undefined &&
            (!isSafeText(name) ||
             !name.trim() ||
             name.length > 100)) ||
        (monthlyLimit !== undefined &&
            (!Number.isSafeInteger(monthlyLimit) ||
             monthlyLimit < 0)) ||
        (maxPerRequest !== undefined &&
            (!Number.isSafeInteger(maxPerRequest) ||
             maxPerRequest <= 0))
    ) {
        res.status(400).json({
            error: "Invalid plan update details"
        });
        return;
    }

    try {
        const result = await customPlanService.update({
            accountId: BigInt(res.locals.account.id),
            planId: BigInt(planId),
            name,
            monthlyLimit:
                monthlyLimit === undefined
                    ? undefined
                    : BigInt(monthlyLimit),
            maxPerRequest:
                maxPerRequest === undefined
                    ? undefined
                    : BigInt(maxPerRequest)
        });

        res.status(200).json(result);
    } catch (error) {
        if (
            error instanceof CustomPlanNotFoundError ||
            (error instanceof Error &&
                error.message === "Account not found")
        ) {
            res.status(404).json({
                error: error.message
            });
            return;
        }

        logger.error({ event: "api_operation_failed", operation: "update_custom_plan" }, "API operation failed");
        res.status(500).json({
            error: "Failed to update custom plan"
        });
    }
});
