import { headers } from "next/headers";
import { APIError } from "better-auth/api";
import { auth } from "@/lib/auth";

export async function authorizeProjectCreation() {
  const requestHeaders = await headers();

  const session = await auth.api.getSession({
    headers: requestHeaders,
  });

  if (!session?.user) {
    return {
      allowed: false as const,
      status: 401,
      error: "Authentication required",
    };
  }

  const organizationId = session.session.activeOrganizationId;

  if (!organizationId) {
    return {
      allowed: false as const,
      status: 403,
      error: "Select an organization first",
    };
  }

  let member;

  try {
    member = await auth.api.getActiveMember({
      headers: requestHeaders,
    });
  } catch (error) {
    if (
      error instanceof APIError &&
      error.statusCode === 400 &&
      error.body?.code === "MEMBER_NOT_FOUND"
    ) {
      return {
        allowed: false as const,
        status: 403,
        error: "Organization access denied",
      };
    }

    throw error;
  }

  if (
    !member ||
    member.organizationId !== organizationId ||
    member.userId !== session.user.id
  ) {
    return {
      allowed: false as const,
      status: 403,
      error: "Organization access denied",
    };
  }

  const roles = member.role.split(",").map((role) => role.trim());

  if (!roles.includes("owner") && !roles.includes("admin")) {
    return {
      allowed: false as const,
      status: 403,
      error: "Insufficient permissions",
    };
  }

  return {
    allowed: true as const,
    userId: session.user.id,
    organizationId,
  };
}
