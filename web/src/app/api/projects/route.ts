import { tryLoadMeteringEnvironment } from "@/lib/environment";
import { NextResponse } from "next/server";
import { authorizeProjectCreation } from "@/lib/authorize-project-creation";


export async function POST(request: Request) {
  const authorization = await authorizeProjectCreation();

  if (!authorization.allowed) {
    return NextResponse.json(
      { error: authorization.error },
      { status: authorization.status }
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
      { error: "Invalid project details" },
      { status: 400 }
    );
  }

  const input = body as Record<string, unknown>;
  const name = typeof input.name === "string"
    ? input.name.trim()
    : "";

  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100)
    .replace(/-+$/g, "");

  if (name.length < 2 || name.length > 100 || !slug) {
    return NextResponse.json(
      { error: "Enter a valid project name" },
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

  try {
    const response = await fetch(
      `${apiUrl.replace(/\/$/, "")}/projects`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Admin-Key": adminKey,
        },
        body: JSON.stringify({
          organizationId: authorization.organizationId,
          name,
          slug,
          planId: 1,
        }),
        cache: "no-store",
        signal: AbortSignal.timeout(10000),
      }
    );

    if (!response.ok) {
      const status =
        response.status === 409 ? 409 :
        response.status === 400 ? 400 : 502;

      return NextResponse.json(
        {
          error: status === 409
            ? "A project with this name already exists"
            : status === 400
              ? "Invalid project configuration"
              : "Project service unavailable",
        },
        { status }
      );
    }

    const result = await response.json();

    return NextResponse.json(result, {
      status: 201,
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Unable to connect to project service" },
      { status: 502 }
    );
  }
}


export async function GET() {
  const authorization = await authorizeProjectCreation();

  if (!authorization.allowed) {
    return NextResponse.json(
      { error: authorization.error },
      { status: authorization.status }
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
  });

  try {
    const response = await fetch(
      `${apiUrl.endsWith("/") ? apiUrl.slice(0, -1) : apiUrl}/projects?${query.toString()}`,
      {
        method: "GET",
        headers: {
          "X-Admin-Key": adminKey,
        },
        cache: "no-store",
        signal: AbortSignal.timeout(10000),
      }
    );

    if (!response.ok) {
      console.error("Project listing service returned:", response.status);

      return NextResponse.json(
        { error: "Unable to retrieve projects" },
        { status: 502 }
      );
    }

    const payload: unknown = await response.json();

    if (
      !payload ||
      typeof payload !== "object" ||
      !("projects" in payload) ||
      !Array.isArray(payload.projects)
    ) {
      throw new Error("Invalid project listing response");
    }

    const projects = payload.projects.map((item: unknown) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        throw new Error("Invalid project record");
      }

      const project = item as Record<string, unknown>;

      if (
        typeof project.id !== "string" ||
        project.organizationId !== authorization.organizationId ||
        typeof project.name !== "string" ||
        typeof project.slug !== "string" ||
        typeof project.status !== "string" ||
        typeof project.createdAt !== "string"
      ) {
        throw new Error("Invalid project record");
      }

      return {
        id: project.id,
        organizationId: project.organizationId,
        name: project.name,
        slug: project.slug,
        status: project.status,
        createdAt: project.createdAt,
      };
    });

    return NextResponse.json(
      { projects },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (error) {
    console.error("Project listing failed:", error);

    return NextResponse.json(
      { error: "Unable to retrieve projects" },
      { status: 502 }
    );
  }
}
