import {
    MAX_HISTORY_OFFSET,
    parsePositiveInteger
} from "./input-validation.js";
import { logger } from "./infrastructure/logging/logger.js";

import { Router } from "express";
import { authenticateAdmin } from "./admin-auth.js";
import { Prisma } from "./generated/prisma/client.js";
import { prisma } from "./infrastructure/database/prisma.js";
import {
    CreateAccountService,
    InvalidAccountPlanError
} from "./application/services/CreateAccountService.js";
import { CreateProjectService } from "./application/services/CreateProjectService.js";
import { GetAllowancesService } from "./application/services/GetAllowancesService.js";
import { GetMonthlyReportService } from "./application/services/GetMonthlyReportService.js";
import { GetUsageHistoryService } from "./application/services/GetUsageHistoryService.js";
import { GetNotificationsService } from "./application/services/GetNotificationsService.js";
import {
    ManageProjectApiKeysService,
    ProjectNotFoundError,
    ProjectApiKeyNotFoundError,
    InvalidProjectApiKeyNameError
} from "./application/services/ManageProjectApiKeysService.js";

export const projectsRouter = Router();
projectsRouter.use(authenticateAdmin);

const accountService = new CreateAccountService(prisma);
const projectService = new CreateProjectService(prisma, accountService);
const allowancesService = new GetAllowancesService(prisma);
const monthlyReportService = new GetMonthlyReportService(prisma);
const usageHistoryService = new GetUsageHistoryService(prisma);
const notificationsService = new GetNotificationsService(prisma);
const apiKeysService = new ManageProjectApiKeysService(prisma);

function validIdentifier(value: unknown): value is string {
    return (
        typeof value === "string" &&
        value.trim().length > 0 &&
        value.length <= 128
    );
}

projectsRouter.get("/", async (req, res) => {
    const organizationId =
        typeof req.query.organizationId === "string"
            ? req.query.organizationId.trim()
            : "";

    if (!validIdentifier(organizationId)) {
        res.status(400).json({ error: "Invalid organization ID" });
        return;
    }

    try {
        const projects = await prisma.projects.findMany({
            where: {
                organization_id: organizationId
            },
            orderBy: {
                created_at: "desc"
            },
            select: {
                id: true,
                organization_id: true,
                name: true,
                slug: true,
                status: true,
                created_at: true
            }
        });

        res.status(200).json({
            projects: projects.map((project) => ({
                id: project.id,
                organizationId: project.organization_id,
                name: project.name,
                slug: project.slug,
                status: project.status,
                createdAt: project.created_at.toISOString()
            }))
        });
    } catch (error) {
        logger.error({ event: "api_operation_failed", operation: "list_projects" }, "API operation failed");
        res.status(500).json({ error: "Failed to retrieve projects" });
    }
});

// Retrieve dashboard data for an organization-owned project.
projectsRouter.get("/:projectId/dashboard", async (req, res) => {
    const projectId = req.params.projectId.trim();

    const organizationId =
        typeof req.query.organizationId === "string"
            ? req.query.organizationId.trim()
            : "";

    if (
        !validIdentifier(projectId) ||
        !validIdentifier(organizationId)
    ) {
        res.status(400).json({
            error: "Invalid project or organization ID"
        });
        return;
    }

    const requestedMonth = req.query.month;

    if (
        requestedMonth !== undefined &&
        (
            typeof requestedMonth !== "string" ||
            !/^(?!0000)\d{4}-(0[1-9]|1[0-2])$/.test(requestedMonth)
        )
    ) {
        res.status(400).json({
            error: "Month must be in YYYY-MM format"
        });
        return;
    }

    const month =
        typeof requestedMonth === "string"
            ? requestedMonth
            : new Date().toISOString().slice(0, 7);

    const requestedPage = req.query.page ?? "1";
    const requestedLimit = req.query.limit ?? "10";

    if (
        typeof requestedPage !== "string" ||
        typeof requestedLimit !== "string" ||
        !/^[1-9]\d*$/.test(requestedPage) ||
        !/^[1-9]\d*$/.test(requestedLimit)
    ) {
        res.status(400).json({
            error: "Invalid page or limit"
        });
        return;
    }

    const page = parsePositiveInteger(requestedPage);
    const limit = parsePositiveInteger(requestedLimit);

    if (
        !Number.isSafeInteger(page) ||
        !Number.isSafeInteger(limit) ||
        limit > 100 ||
        !Number.isSafeInteger((page - 1) * limit) ||
        (page - 1) * limit > MAX_HISTORY_OFFSET
    ) {
        res.status(400).json({
            error: "Invalid page or limit"
        });
        return;
    }

    try {
        const project = await prisma.projects.findFirst({
            where: {
                id: projectId,
                organization_id: organizationId
            },
            select: {
                id: true,
                organization_id: true,
                name: true,
                slug: true,
                status: true,
                created_at: true,
                metering_account_id: true
            }
        });

        if (!project) {
            res.status(404).json({
                error: "Project not found"
            });
            return;
        }

        if (project.metering_account_id === null) {
            res.status(409).json({
                error: "Project metering account is not available"
            });
            return;
        }

        const accountId = project.metering_account_id;

        const [
            account,
            users,
            monthlyReport,
            usageHistory,
            notifications
        ] = await Promise.all([
            allowancesService.getAccount(accountId),
            allowancesService.getUsers(accountId),
            monthlyReportService.execute(accountId, month),
            usageHistoryService.execute({
                accountId,
                page,
                limit
            }),
            notificationsService.execute(accountId)
        ]);

        res.status(200).json({
            project: {
                id: project.id,
                organizationId: project.organization_id,
                name: project.name,
                slug: project.slug,
                status: project.status,
                createdAt: project.created_at.toISOString()
            },
            account,
            users,
            monthlyReport,
            usageHistory,
            notifications
        });
    } catch (error) {
        logger.error({ event: "api_operation_failed", operation: "get_project_dashboard" }, "API operation failed");

        res.status(500).json({
            error: "Failed to retrieve project dashboard"
        });
    }
});

projectsRouter.post("/", async (req, res) => {
    const { organizationId, name, slug, planId } = req.body ?? {};

    if (
        typeof organizationId !== "string" ||
        !organizationId.trim() ||
        organizationId.length > 128 ||
        typeof name !== "string" ||
        !name.trim() ||
        name.trim().length > 100 ||
        typeof slug !== "string" ||
        slug.length > 100 ||
        !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ||
        !Number.isSafeInteger(planId) ||
        planId <= 0
    ) {
        res.status(400).json({ error: "Invalid project details" });
        return;
    }

    try {
        const result = await projectService.execute(
            organizationId,
            name,
            slug,
            BigInt(planId)
        );

        res.status(201).json(result);
    } catch (error) {
        if (error instanceof InvalidAccountPlanError) {
            res.status(400).json({ error: "Invalid account plan" });
            return;
        }

        if (error instanceof Prisma.PrismaClientKnownRequestError) {
            if (error.code === "P2002") {
                res.status(409).json({ error: "Project conflict" });
                return;
            }

            if (error.code === "P2003") {
                res.status(400).json({ error: "Invalid database reference" });
                return;
            }
        }

        logger.error({ event: "api_operation_failed", operation: "create_project" }, "API operation failed");
        res.status(500).json({ error: "Failed to create project" });
    }
});

// Create a new API key for an organization-owned project.
projectsRouter.post("/:projectId/api-keys", async (req, res) => {
    const projectId = req.params.projectId;
    const { organizationId, name } = req.body ?? {};

    if (
        !validIdentifier(projectId) ||
        !validIdentifier(organizationId) ||
        typeof name !== "string"
    ) {
        res.status(400).json({ error: "Invalid API key details" });
        return;
    }

    try {
        const result = await apiKeysService.create(
            organizationId.trim(),
            projectId.trim(),
            name
        );

        res.setHeader("Cache-Control", "no-store");
        res.status(201).json(result);
    } catch (error) {
        if (error instanceof ProjectNotFoundError) {
            res.status(404).json({ error: "Project not found" });
            return;
        }

        if (error instanceof InvalidProjectApiKeyNameError) {
            res.status(400).json({ error: "Invalid API key name" });
            return;
        }

        logger.error({ event: "api_operation_failed", operation: "create_project_api_key" }, "API operation failed");
        res.status(500).json({ error: "Failed to create API key" });
    }
});

// List API keys without returning their hashes or plaintext secrets.
projectsRouter.get("/:projectId/api-keys", async (req, res) => {
    const projectId = req.params.projectId;
    const organizationId = req.query.organizationId;

    if (
        !validIdentifier(projectId) ||
        !validIdentifier(organizationId)
    ) {
        res.status(400).json({
            error: "Invalid project or organization ID"
        });
        return;
    }

    try {
        const apiKeys = await apiKeysService.list(
            organizationId.trim(),
            projectId.trim()
        );

        res.setHeader("Cache-Control", "no-store");
        res.status(200).json({ apiKeys });
    } catch (error) {
        if (error instanceof ProjectNotFoundError) {
            res.status(404).json({ error: "Project not found" });
            return;
        }

        logger.error({ event: "api_operation_failed", operation: "list_project_api_keys" }, "API operation failed");
        res.status(500).json({ error: "Failed to list API keys" });
    }
});

// Revoke an individual project API key.
projectsRouter.delete("/:projectId/api-keys/:keyId", async (req, res) => {
    const projectId = req.params.projectId;
    const keyId = req.params.keyId;
    const organizationId = req.query.organizationId;

    if (
        !validIdentifier(projectId) ||
        !validIdentifier(keyId) ||
        !validIdentifier(organizationId)
    ) {
        res.status(400).json({
            error: "Invalid project, organization, or key ID"
        });
        return;
    }

    try {
        const result = await apiKeysService.revoke(
            organizationId.trim(),
            projectId.trim(),
            keyId.trim()
        );

        res.setHeader("Cache-Control", "no-store");
        res.status(200).json(result);
    } catch (error) {
        if (
            error instanceof ProjectNotFoundError ||
            error instanceof ProjectApiKeyNotFoundError
        ) {
            res.status(404).json({ error: "API key not found" });
            return;
        }

        logger.error({ event: "api_operation_failed", operation: "revoke_project_api_key" }, "API operation failed");
        res.status(500).json({ error: "Failed to revoke API key" });
    }
});
