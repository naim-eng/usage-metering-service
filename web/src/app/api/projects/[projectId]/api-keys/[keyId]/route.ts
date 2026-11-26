import { tryLoadMeteringEnvironment } from "@/lib/environment";

import { NextResponse } from "next/server";
import { authorizeProjectCreation } from "@/lib/authorize-project-creation";

type RouteContext = {
  params: Promise<{
    projectId: string;
    keyId: string;
  }>;
};

export async function DELETE(
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

  const { projectId, keyId } = await context.params;

  if (
    !projectId.trim() ||
    projectId.length > 128 ||
    !keyId.trim() ||
    keyId.length > 128
  ) {
    return NextResponse.json(
      { error: "Invalid project or API key ID" },
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
  });

  try {
    const response = await fetch(
      `${apiUrl.replace(/\/$/, "")}/projects/${encodeURIComponent(projectId)}/api-keys/${encodeURIComponent(keyId)}?${query}`,
      {
        method: "DELETE",
        headers: {
          "X-Admin-Key": adminKey,
        },
        cache: "no-store",
        signal: AbortSignal.timeout(10000),
      }
    );

    if (response.status === 404) {
      return NextResponse.json(
        { error: "Project or API key not found" },
        {
          status: 404,
          headers: { "Cache-Control": "no-store" },
        }
      );
    }

    if (!response.ok) {
      return NextResponse.json(
        { error: "Unable to revoke API key" },
        { status: 502 }
      );
    }

    const payload: unknown = await response.json();

    if (
      !payload ||
      typeof payload !== "object" ||
      !("id" in payload) ||
      payload.id !== keyId ||
      !("revoked" in payload) ||
      payload.revoked !== true
    ) {
      throw new Error("Invalid API key revocation response");
    }

    return NextResponse.json(
      { id: keyId, revoked: true },
      {
        status: 200,
        headers: { "Cache-Control": "no-store" },
      }
    );
  } catch (error) {
    console.error("Project API key revocation failed:", error);

    return NextResponse.json(
      { error: "Unable to revoke API key" },
      { status: 502 }
    );
  }
}
