import { isSafeText } from "./input-validation.js";
import { loadApiConfig } from "./api-config.js";
import { errorHandler } from "./infrastructure/logging/error-handler.js";
import { projectsRouter } from "./projects.js";

import { allowancesRouter } from "./allowances.js";
import { notificationsRouter } from "./notifications.js";
import { reportsRouter } from "./reports.js";
import { historyRouter } from "./history.js";
import { plansRouter } from "./plans.js";

import { ConsumeCreditsService } from "./application/services/ConsumeCreditsService.js";
import {
    CreateAccountService,
    InvalidAccountPlanError
} from "./application/services/CreateAccountService.js";
import {
    CreateUserService,
    InvalidUserPlanError,
    AccountNotFoundError,
    UserAlreadyExistsError
} from "./application/services/CreateUserService.js";
import {
    ChangeAccountPlanService,
    InvalidAccountPlanSelectionError
} from "./application/services/ChangeAccountPlanService.js";
import {
    ChangeUserPlanService,
    InvalidUserPlanSelectionError,
    UserNotFoundForPlanChangeError
} from "./application/services/ChangeUserPlanService.js";
import { ListPlansService } from "./application/services/ListPlansService.js";

import { prisma } from "./infrastructure/database/prisma.js";
import { authenticateAccount } from "./auth.js";
import { authenticateAdmin } from "./admin-auth.js";
import { RotateAccountApiKeyService } from "./application/services/RotateAccountApiKeyService.js";
import express from "express";
import {
    parseJsonBody,
    requireJsonContentType,
    requireJsonObject,
    requestParsingErrorHandler
} from "./request-protection.js";
import helmet from "helmet";
import { configureTrustedProxy } from "./proxy-config.js";
import { createRequestLogger } from "./infrastructure/logging/request-logger.js";
import { logger } from "./infrastructure/logging/logger.js";
import { createReadinessHandler } from "./readiness.js";
import { registerGracefulShutdown, registerShutdownSignals } from "./shutdown.js";
import {
    managementLimiter,
    consumptionPreAuthLimiter,
    consumptionLimiter
} from "./rate-limit.js";

const app = express();
configureTrustedProxy(app);
app.use(createRequestLogger());

const consumeCreditsService = new ConsumeCreditsService(prisma);
const createAccountService = new CreateAccountService(prisma);
const createUserService = new CreateUserService(prisma);
const changeAccountPlanService = new ChangeAccountPlanService(prisma);
const changeUserPlanService = new ChangeUserPlanService(prisma);
const listPlansService = new ListPlansService(prisma);

const { port: PORT } = loadApiConfig();

app.use(helmet());

// Apply separate limits to metering and management traffic.
app.use((req, res, next) => {
    if (req.path === "/health" || req.path === "/ready") {
        next();
        return;
    }

    if (
        req.method === "POST" &&
        /^\/consume\/?$/i.test(req.path)
    ) {
        next();
        return;
    }

    managementLimiter(req, res, next);
});

// Parse management requests only after rate limiting.
app.use((req, res, next) => {
    if (
        req.method === "POST" &&
        /^\/consume\/?$/i.test(req.path)
    ) {
        next();
        return;
    }

    requireJsonContentType(req, res, (error) => {
        if (error) {
            next(error);
            return;
        }

        parseJsonBody(req, res, (parseError) => {
            if (parseError) {
                next(parseError);
                return;
            }

            requireJsonObject(req, res, next);
        });
    });
});

app.use("/projects", projectsRouter);

// Health check endpoint.
app.get("/health", (req, res) => {
    res.json({ status: "ok" });
});

app.get("/ready", createReadinessHandler(prisma));

// Retrieve predefined plans using Prisma.
app.get("/plans", async (_req, res) => {
    try {
        const plans = await listPlansService.execute();

        res.status(200).json(plans);
    } catch (error) {
        logger.error({ event: "api_operation_failed", operation: "list_plans" }, "API operation failed");
        res.status(500).json({
            error: "Failed to retrieve plans"
        });
    }
});

// Create an account and its initial quota-history snapshot.
app.post("/accounts", authenticateAdmin, async (req, res) => {

    const { name, planId } = req.body ?? {};

    if (
        !isSafeText(name) ||
        !name.trim() ||
        name.length > 100 ||
        !Number.isSafeInteger(planId) ||
        planId <= 0
    ) {
        res.status(400).json({
            error: "Invalid name or planId"
        });
        return;
    }

    try {
        const result = await createAccountService.execute(
            name,
            BigInt(planId)
        );

        res.status(201).json(result);
    } catch (error) {
        if (error instanceof InvalidAccountPlanError) {
            res.status(400).json({
                error: "Invalid account plan"
            });
            return;
        }

        logger.error({ event: "api_operation_failed", operation: "create_account" }, "API operation failed");
        res.status(500).json({
            error: "Failed to create account"
        });
    }
});

// Rotate a standalone account credential.
app.post(
    "/accounts/:accountId/api-key/rotate",
    authenticateAdmin,
    async (req, res) => {
        const rawId = req.params.accountId;

        if (
            typeof rawId !== "string" ||
            !/^[1-9][0-9]{0,18}$/.test(rawId) ||
            BigInt(rawId) > 9223372036854775807n
        ) {
            res.status(400).json({
                error: "Invalid account ID"
            });
            return;
        }

        try {
            const service = new RotateAccountApiKeyService(prisma);
            const result = await service.execute(BigInt(rawId));

            if (!result) {
                res.status(404).json({
                    error: "Standalone account not found"
                });
                return;
            }

            res.status(200).json(result);
        } catch {
            logger.error(
                {
                    event: "api_operation_failed",
                    operation: "rotate_account_api_key"
                },
                "API operation failed"
            );

            res.status(500).json({
                error: "Failed to rotate API key"
            });
        }
    }
);

// Create a user and their initial quota-history snapshot.
app.post("/users", authenticateAccount, async (req, res) => {
    const accountId = res.locals.account.id;
    const { userId, planId } = req.body ?? {};

    if (
        !isSafeText(userId) ||
        !userId.trim() ||
        userId.length > 100 ||
        !Number.isSafeInteger(planId) ||
        planId <= 0
    ) {
        res.status(400).json({
            error: "Invalid userId or planId"
        });
        return;
    }

    try {
        const result = await createUserService.execute(
            BigInt(accountId),
            userId,
            BigInt(planId)
        );

        res.status(201).json(result);
    } catch (error) {
        if (error instanceof AccountNotFoundError) {
            res.status(404).json({
                error: "Account not found"
            });
            return;
        }

        if (error instanceof InvalidUserPlanError) {
            res.status(400).json({
                error: "Invalid or inaccessible user plan"
            });
            return;
        }

        if (error instanceof UserAlreadyExistsError) {
            res.status(409).json({
                error: "User already exists in this account"
            });
            return;
        }

        logger.error({ event: "api_operation_failed", operation: "create_user" }, "API operation failed");
        res.status(500).json({
            error: "Failed to register user"
        });
    }
});

// Consume credits.
app.post(
    "/consume",
    consumptionPreAuthLimiter,
    authenticateAccount,
    consumptionLimiter,
    requireJsonContentType,
    parseJsonBody,
    requireJsonObject,
    async (req, res) => {
        const accountId = String(res.locals.account.id);
        const { userId, units, requestId } = req.body ?? {};

        if (
            !isSafeText(userId) ||
            !userId.trim() ||
            userId.length > 100 ||
            !Number.isSafeInteger(units) ||
            units <= 0 ||
            !isSafeText(requestId) ||
            !requestId.trim() ||
            requestId.length > 100
        ) {
            res.status(400).json({
                error: "Invalid userId, units or requestId"
            });
            return;
        }

        try {
            const result = await consumeCreditsService.execute({
                accountId: BigInt(accountId),
                externalUserId: userId,
                units: BigInt(units),
                requestId
            });

            res.status(200).json(result);
        } catch (error) {
            const message =
                error instanceof Error ? error.message : "";

            if (message === "User not found in account") {
                res.status(404).json({ error: message });
                return;
            }

            if (
                message ===
                "Request ID already used with different parameters"
            ) {
                res.status(409).json({ error: message });
                return;
            }

            logger.error({ event: "api_operation_failed", operation: "consume_credits" }, "API operation failed");
            res.status(500).json({
                error: "Failed to process consumption"
            });
        }
    }
);

// Plan-management and reporting routers.
app.use("/plans", plansRouter);
app.use("/usage", historyRouter);
app.use("/usage", reportsRouter);
app.use("/", allowancesRouter);
app.use("/", notificationsRouter);

// Change an account plan and record its new quota limits.
app.patch("/accounts/plan", authenticateAccount, async (req, res) => {
    const accountId = res.locals.account.id;
    const { planId } = req.body ?? {};

    if (!Number.isSafeInteger(planId) || planId <= 0) {
        res.status(400).json({
            error: "Invalid planId"
        });
        return;
    }

    try {
        const result = await changeAccountPlanService.execute(
            BigInt(accountId),
            BigInt(planId)
        );

        res.status(200).json(result);
    } catch (error) {
        if (error instanceof InvalidAccountPlanSelectionError) {
            res.status(400).json({
                error: "Invalid or inaccessible account plan"
            });
            return;
        }

        if (
            error instanceof Error &&
            error.message === "Account not found"
        ) {
            res.status(404).json({
                error: "Account not found"
            });
            return;
        }

        logger.error({ event: "api_operation_failed", operation: "change_account_plan" }, "API operation failed");
        res.status(500).json({
            error: "Failed to update account plan"
        });
    }
});

// Change a user plan and record its new quota limits.
app.patch("/users/plan", authenticateAccount, async (req, res) => {
    const accountId = res.locals.account.id;
    const { userId, planId } = req.body ?? {};

    if (
        !isSafeText(userId) ||
        !userId.trim() ||
        userId.length > 100 ||
        !Number.isSafeInteger(planId) ||
        planId <= 0
    ) {
        res.status(400).json({
            error: "Invalid userId or planId"
        });
        return;
    }

    try {
        const result = await changeUserPlanService.execute(
            BigInt(accountId),
            userId,
            BigInt(planId)
        );

        res.status(200).json(result);
    } catch (error) {
        if (error instanceof UserNotFoundForPlanChangeError) {
            res.status(404).json({
                error: "User not found in account"
            });
            return;
        }

        if (error instanceof InvalidUserPlanSelectionError) {
            res.status(400).json({
                error: "Invalid or inaccessible user plan"
            });
            return;
        }

        if (
            error instanceof Error &&
            error.message === "Account not found"
        ) {
            res.status(404).json({
                error: "Account not found"
            });
            return;
        }

        logger.error({ event: "api_operation_failed", operation: "change_user_plan" }, "API operation failed");
        res.status(500).json({
            error: "Failed to update user plan"
        });
    }
});

app.use(requestParsingErrorHandler);
app.use(errorHandler);

// Start the HTTP server and register graceful shutdown.
const server = app.listen(PORT, () => {
    logger.info(
        {
            event: "api_server_started",
            port: PORT
        },
        "API server started"
    );
});

const shutdown = registerGracefulShutdown(server, prisma);
registerShutdownSignals(shutdown);
