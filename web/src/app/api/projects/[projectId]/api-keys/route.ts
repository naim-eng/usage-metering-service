import { tryLoadMeteringEnvironment } from "@/lib/environment";

import { NextResponse } from "next/server";
import { authorizeProjectCreation } from "@/lib/authorize-project-creation";

type RouteContext = {
  params: Promise<{
    projectId: string;
  }>;
};

function getBackendConfig() {
  const { apiUrl, adminKey } = tryLoadMeteringEnvironment() ?? {};

  if (!apiUrl || !adminKey) {
    return null;
  }

  return {
    apiUrl: apiUrl.replace(/\/$/, ""),
    adminKey,
  };
}

function validProjectId(projectId: string): boolean {
  return (
    projectId.trim().length > 0 &&
    projectId.length <= 128
  );
}

// List project API keys without exposing plaintext secrets.
export async function GET(
  _request: Request,
  context: RouteContext
) {
  const authorization = await authorizeProjectCreation();

  if (!authorization.allowed) {
    return NextResponse.json(
      { error: authorization.error },
      { status: authorization.status }
    );
  }

  const { projectId } = await context.params;

  if (!validProjectId(projectId)) {
    return NextResponse.json(
      { error: "Invalid project ID" },
      { status: 400 }
    );
  }

  const config = getBackendConfig();

  if (!config) {
    return NextResponse.json(
      { error: "Project service unavailable" },
      { status: 503 }
    );
  }

  const query = new URLSearchParams({
    organizationId: authorization.organizationId,
  });

  try {
    const response = await fetch(
      `${config.apiUrl}/projects/${encodeURIComponent(projectId)}/api-keys?${query}`,
      {
        method: "GET",
        headers: {
          "X-Admin-Key": config.adminKey,
        },
        cache: "no-store",
        signal: AbortSignal.timeout(10000),
      }
    );

    if (response.status === 404) {
      return NextResponse.json(
        { error: "Project not found" },
        { status: 404 }
      );
    }

    if (!response.ok) {
      return NextResponse.json(
        { error: "Unable to retrieve API keys" },
        { status: 502 }
      );
    }

    const payload: unknown = await response.json();

    if (
      !payload ||
      typeof payload !== "object" ||
      !("apiKeys" in payload) ||
      !Array.isArray(payload.apiKeys)
    ) {
      throw new Error("Invalid API key listing response");
    }

    const apiKeys = payload.apiKeys.map((item: unknown) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        throw new Error("Invalid API key record");
      }

      const key = item as Record<string, unknown>;

      if (
        typeof key.id !== "string" ||
        key.projectId !== projectId ||
        typeof key.name !== "string" ||
        typeof key.keyPrefix !== "string" ||
        typeof key.createdAt !== "string" ||
        (
          key.revokedAt !== null &&
          typeof key.revokedAt !== "string"
        )
      ) {
        throw new Error("Invalid API key record");
      }

      return {
        id: key.id,
        projectId: key.projectId,
        name: key.name,
        keyPrefix: key.keyPrefix,
        createdAt: key.createdAt,
        revokedAt: key.revokedAt,
      };
    });

    return NextResponse.json(
      { apiKeys },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (error) {
    console.error("Project API key listing failed:", error);

    return NextResponse.json(
      { error: "Unable to retrieve API keys" },
      { status: 502 }
    );
  }
}

// Generate a new API key for an organization-owned project.
export async function POST(
  request: Request,
  context: RouteContext
) {
  const authorization = await authorizeProjectCreation();

  if (!authorization.allowed) {
    return NextResponse.json(
      { error: authorization.error },
      { status: authorization.status }
    );
  }

  const { projectId } = await context.params;

  if (!validProjectId(projectId)) {
    return NextResponse.json(
      { error: "Invalid project ID" },
      { status: 400 }
    );
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON" },
      { status: 400 }
    );
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json(
      { error: "Invalid API key details" },
      { status: 400 }
    );
  }

  const input = body as Record<string, unknown>;

  const name =
    typeof input.name === "string"
      ? input.name.trim()
      : "";

  if (name.length < 1 || name.length > 100) {
    return NextResponse.json(
      { error: "Enter an API key name (1-100 characters)" },
      { status: 400 }
    );
  }

  const config = getBackendConfig();

  if (!config) {
    return NextResponse.json(
      { error: "Project service unavailable" },
      { status: 503 }
    );
  }

  try {
    const response = await fetch(
      `${config.apiUrl}/projects/${encodeURIComponent(projectId)}/api-keys`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Admin-Key": config.adminKey,
        },
        body: JSON.stringify({
          organizationId: authorization.organizationId,
          name,
        }),
        cache: "no-store",
        signal: AbortSignal.timeout(10000),
      }
    );

    if (response.status === 404) {
      return NextResponse.json(
        { error: "Project not found" },
        { status: 404 }
      );
    }

    if (response.status === 400) {
      return NextResponse.json(
        { error: "Invalid API key details" },
        { status: 400 }
      );
    }

    if (!response.ok) {
      return NextResponse.json(
        { error: "Unable to create API key" },
        { status: 502 }
      );
    }

    const payload: unknown = await response.json();

    if (
      !payload ||
      typeof payload !== "object" ||
      !("apiKey" in payload) ||
      typeof payload.apiKey !== "string" ||
      !payload.apiKey.startsWith("um_") ||
      !("projectId" in payload) ||
      payload.projectId !== projectId
    ) {
      throw new Error("Invalid API key creation response");
    }

    return NextResponse.json(payload, {
      status: 201,
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Project API key creation failed:", error);

    return NextResponse.json(
      { error: "Unable to create API key" },
      { status: 502 }
    );
  }
}
