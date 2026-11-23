import { Router } from "express";
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

export const projectsRouter = Router();

const accountService = new CreateAccountService(prisma);
const projectService = new CreateProjectService(prisma, accountService);
const allowancesService = new GetAllowancesService(prisma);
const monthlyReportService = new GetMonthlyReportService(prisma);
const usageHistoryService = new GetUsageHistoryService(prisma);
const notificationsService = new GetNotificationsService(prisma);


projectsRouter.get("/", async (req, res) => {
    const adminKey = req.header("X-Admin-Key");

    if (
        !process.env.ADMIN_API_KEY ||
        adminKey !== process.env.ADMIN_API_KEY
    ) {
        res.status(401).json({ error: "Unauthorized" });
        return;
    }

    const organizationId =
        typeof req.query.organizationId === "string"
            ? req.query.organizationId.trim()
            : "";

    if (!organizationId || organizationId.length > 128) {
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
        console.error("Project listing failed:", error);
        res.status(500).json({ error: "Failed to retrieve projects" });
    }
});


// Retrieve dashboard data for an organization-owned project.
projectsRouter.get("/:projectId/dashboard", async (req, res) => {
    const adminKey = req.header("X-Admin-Key");

    if (
        !process.env.ADMIN_API_KEY ||
        adminKey !== process.env.ADMIN_API_KEY
    ) {
        res.status(401).json({ error: "Unauthorized" });
        return;
    }

    const projectId = req.params.projectId.trim();

    const organizationId =
        typeof req.query.organizationId === "string"
            ? req.query.organizationId.trim()
            : "";

    if (
        !projectId ||
        projectId.length > 128 ||
        !organizationId ||
        organizationId.length > 128
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
            !/^\d{4}-(0[1-9]|1[0-2])$/.test(requestedMonth)
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

    const page = Number(requestedPage);
    const limit = Number(requestedLimit);

    if (
        !Number.isSafeInteger(page) ||
        !Number.isSafeInteger(limit) ||
        limit > 100 ||
        !Number.isSafeInteger((page - 1) * limit)
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
        console.error("Project dashboard retrieval failed:", error);

        res.status(500).json({
            error: "Failed to retrieve project dashboard"
        });
    }
});

projectsRouter.post("/", async (req, res) => {
    const adminKey = req.header("X-Admin-Key");

    if (
        !process.env.ADMIN_API_KEY ||
        adminKey !== process.env.ADMIN_API_KEY
    ) {
        res.status(401).json({ error: "Unauthorized" });
        return;
    }

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

        console.error("Project creation failed:", error);
        res.status(500).json({ error: "Failed to create project" });
    }
});
