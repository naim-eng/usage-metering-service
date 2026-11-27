import { tryLoadMeteringEnvironment } from "@/lib/environment";
import { NextResponse } from "next/server";
import { sanitizeDashboardResponse } from "@/lib/dashboard-response";
import { authorizeProjectCreation } from "@/lib/authorize-project-creation";

export async function GET(
  request: Request,
  context: { params: Promise<{ projectId: string }> }
) {
  const authorization = await authorizeProjectCreation();

  if (!authorization.allowed) {
    return NextResponse.json(
      { error: authorization.error },
      { status: authorization.status }
    );
  }

  const { projectId } = await context.params;

  if (!projectId.trim() || projectId.length > 128) {
    return NextResponse.json(
      { error: "Invalid project ID" },
      { status: 400 }
    );
  }

  const url = new URL(request.url);

  for (const parameter of ["month", "page", "limit"]) {
    if (url.searchParams.getAll(parameter).length > 1) {
      return NextResponse.json(
        { error: "Duplicate query parameter" },
        { status: 400 }
      );
    }
  }
  const requestedMonth = url.searchParams.get("month");

  const now = new Date();
  const currentMonth =
    `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;

  const month = requestedMonth ?? currentMonth;

  if (!/^(?!0000)\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    return NextResponse.json(
      { error: "Invalid month. Expected YYYY-MM." },
      { status: 400 }
    );
  }

  const requestedPage = url.searchParams.get("page") ?? "1";
  const requestedLimit = url.searchParams.get("limit") ?? "10";

  if (
    !/^[1-9]\d*$/.test(requestedPage) ||
    !/^[1-9]\d*$/.test(requestedLimit)
  ) {
    return NextResponse.json(
      { error: "Invalid page or limit" },
      { status: 400 }
    );
  }

  const page = Number(requestedPage);
  const limit = Number(requestedLimit);

  if (
    !Number.isSafeInteger(page) ||
    !Number.isSafeInteger(limit) ||
    limit > 100 ||
    !Number.isSafeInteger((page - 1) * limit) ||
    (page - 1) * limit > 100000
  ) {
    return NextResponse.json(
      { error: "Invalid page or limit" },
      { status: 400 }
    );
  }

  const { apiUrl, adminKey } = tryLoadMeteringEnvironment() ?? {};

  if (!apiUrl || !adminKey) {
    return NextResponse.json(
      { error: "Project service unavailable" },
      { status: 503 }
    );
  }

  const query = new URLSearchParams({
    organizationId: authorization.organizationId,
    month,
    page: String(page),
    limit: String(limit)
  });

  try {
    const response = await fetch(
      `${apiUrl.replace(/\/$/, "")}/projects/${encodeURIComponent(projectId)}/dashboard?${query}`,
      {
        method: "GET",
        headers: {
          "X-Admin-Key": adminKey
        },
        redirect: "error",
        cache: "no-store",
        signal: AbortSignal.timeout(10000)
      }
    );

    if (!response.ok) {
      if (response.status === 404) {
        return NextResponse.json(
          { error: "Project not found" },
          { status: 404 }
        );
      }

      if (response.status === 409) {
        return NextResponse.json(
          { error: "Project metering account is not available" },
          { status: 409 }
        );
      }

      if (response.status === 400) {
        return NextResponse.json(
          { error: "Invalid dashboard request" },
          { status: 400 }
        );
      }

      console.error(
        "Project dashboard service returned:",
        response.status
      );

      return NextResponse.json(
        { error: "Unable to retrieve project dashboard" },
        { status: 502 }
      );
    }

    const result: unknown = await response.json();

    if (!result || typeof result !== "object" || Array.isArray(result)) {
      throw new Error("Invalid dashboard response");
    }

    const dashboard = result as Record<string, unknown>;
    const project = dashboard.project;

    if (
      !project ||
      typeof project !== "object" ||
      Array.isArray(project) ||
      !("id" in project) ||
      project.id !== projectId ||
      !("organizationId" in project) ||
      project.organizationId !== authorization.organizationId ||
      !("name" in project) ||
      typeof project.name !== "string" ||
      !("slug" in project) ||
      typeof project.slug !== "string" ||
      !("status" in project) ||
      typeof project.status !== "string" ||
      !("createdAt" in project) ||
      typeof project.createdAt !== "string"
    ) {
      throw new Error("Invalid dashboard project");
    }

    return NextResponse.json({
      project: {
        id: project.id,
        organizationId: project.organizationId,
        name: project.name,
        slug: project.slug,
        status: project.status,
        createdAt: project.createdAt,
      },
      ...sanitizeDashboardResponse(dashboard),
    }, {
      headers: {
        "Cache-Control": "no-store"
      }
    });
  } catch {
    console.error("Project dashboard request failed");

    return NextResponse.json(
      { error: "Unable to connect to project service" },
      { status: 502 }
    );
  }
}
