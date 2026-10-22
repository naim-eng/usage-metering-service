
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
import express from "express";

const app = express();

const consumeCreditsService = new ConsumeCreditsService(prisma);
const createAccountService = new CreateAccountService(prisma);
const createUserService = new CreateUserService(prisma);
const changeAccountPlanService = new ChangeAccountPlanService(prisma);
const changeUserPlanService = new ChangeUserPlanService(prisma);
const listPlansService = new ListPlansService(prisma);

const PORT = Number(process.env.PORT ?? 3000);

app.use(express.json());

// Health check endpoint.
app.get("/health", (req, res) => {
    res.json({ status: "ok" });
});

// Retrieve predefined plans using Prisma.
app.get("/plans", async (_req, res) => {
    try {
        const plans = await listPlansService.execute();

        res.status(200).json(plans);
    } catch (error) {
        console.error("Error retrieving plans:", error);
        res.status(500).json({
            error: "Failed to retrieve plans"
        });
    }
});

// Create an account and its initial quota-history snapshot.
app.post("/accounts", async (req, res) => {
    const adminKey = req.header("X-Admin-Key");

    if (
        !process.env.ADMIN_API_KEY ||
        adminKey !== process.env.ADMIN_API_KEY
    ) {
        res.status(401).json({ error: "Unauthorized" });
        return;
    }

    const { name, planId } = req.body ?? {};

    if (
        typeof name !== "string" ||
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

        console.error("Account creation failed:", error);
        res.status(500).json({
            error: "Failed to create account"
        });
    }
});

// Create a user and their initial quota-history snapshot.
app.post("/users", authenticateAccount, async (req, res) => {
    const accountId = res.locals.account.id;
    const { userId, planId } = req.body ?? {};

    if (
        typeof userId !== "string" ||
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

        console.error("User registration failed:", error);
        res.status(500).json({
            error: "Failed to register user"
        });
    }
});

// Consume credits.
app.post("/consume", authenticateAccount, async (req, res) => {
    const accountId = String(res.locals.account.id);
    const { userId, units, requestId } = req.body ?? {};

    if (
        typeof userId !== "string" ||
        !userId.trim() ||
        userId.length > 100 ||
        !Number.isSafeInteger(units) ||
        units <= 0 ||
        typeof requestId !== "string" ||
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

        console.error("Consumption failed:", error);
        res.status(500).json({
            error: "Failed to process consumption"
        });
    }
});

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

        console.error("Plan assignment failed:", error);
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
        typeof userId !== "string" ||
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

        console.error("User plan update failed:", error);
        res.status(500).json({
            error: "Failed to update user plan"
        });
    }
});

// Start the HTTP server.
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
