import { isSafeText } from "../../input-validation.js";

import { randomUUID } from "node:crypto";
import type { PrismaClient } from "../../generated/prisma/client.js";
import { generateApiKey, hashApiKey } from "../../api-keys.js";

export class ProjectNotFoundError extends Error {
    constructor() {
        super("Project not found");
        this.name = "ProjectNotFoundError";
    }
}

export class ProjectApiKeyNotFoundError extends Error {
    constructor() {
        super("Project API key not found");
        this.name = "ProjectApiKeyNotFoundError";
    }
}

export class InvalidProjectApiKeyNameError extends Error {
    constructor() {
        super("Invalid API key name");
        this.name = "InvalidProjectApiKeyNameError";
    }
}

export class ManageProjectApiKeysService {
    constructor(private readonly prisma: PrismaClient) {}

    private async findProject(
        organizationId: string,
        projectId: string
    ) {
        const project = await this.prisma.projects.findFirst({
            where: {
                id: projectId,
                organization_id: organizationId,
                status: "active",
                metering_account_id: {
                    not: null
                }
            },
            select: {
                id: true
            }
        });

        if (!project) {
            throw new ProjectNotFoundError();
        }

        return project;
    }

    async create(
        organizationId: string,
        projectId: string,
        name: string
    ) {
        if (!isSafeText(name)) {
            throw new InvalidProjectApiKeyNameError();
        }

        const trimmedName = name.trim();

        if (
            trimmedName.length < 1 ||
            trimmedName.length > 100
        ) {
            throw new InvalidProjectApiKeyNameError();
        }

        await this.findProject(organizationId, projectId);

        const apiKey = generateApiKey();
        const keyHash = hashApiKey(apiKey);
        const keyPrefix = apiKey.slice(0, 12);

        const record = await this.prisma.project_api_keys.create({
            data: {
                id: randomUUID(),
                project_id: projectId,
                name: trimmedName,
                key_hash: keyHash,
                key_prefix: keyPrefix
            }
        });

        return {
            id: record.id,
            projectId: record.project_id,
            name: record.name,
            keyPrefix: record.key_prefix,
            createdAt: record.created_at.toISOString(),
            revokedAt: null,
            apiKey
        };
    }

    async list(
        organizationId: string,
        projectId: string
    ) {
        await this.findProject(organizationId, projectId);

        const records = await this.prisma.project_api_keys.findMany({
            where: {
                project_id: projectId
            },
            orderBy: {
                created_at: "desc"
            },
            select: {
                id: true,
                project_id: true,
                name: true,
                key_prefix: true,
                created_at: true,
                revoked_at: true
            }
        });

        return records.map((record) => ({
            id: record.id,
            projectId: record.project_id,
            name: record.name,
            keyPrefix: record.key_prefix,
            createdAt: record.created_at.toISOString(),
            revokedAt: record.revoked_at?.toISOString() ?? null
        }));
    }

    async revoke(
        organizationId: string,
        projectId: string,
        keyId: string
    ) {
        await this.findProject(organizationId, projectId);

        const result = await this.prisma.project_api_keys.updateMany({
            where: {
                id: keyId,
                project_id: projectId,
                revoked_at: null
            },
            data: {
                revoked_at: new Date()
            }
        });

        if (result.count === 0) {
            throw new ProjectApiKeyNotFoundError();
        }

        return {
            id: keyId,
            revoked: true
        };
    }
}
