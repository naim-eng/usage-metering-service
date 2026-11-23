import { headers } from "next/headers";
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

  const member = await auth.api.getActiveMember({
    headers: requestHeaders,
  });

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
