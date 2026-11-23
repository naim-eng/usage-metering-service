import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import ProjectDashboardClient from "./project-dashboard-client";
export const instant = false;

export default async function ProjectDashboardPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const [requestHeaders, { projectId }] = await Promise.all([
    headers(),
    params,
  ]);

  const session = await auth.api.getSession({
    headers: requestHeaders,
  });

  if (!session?.user) redirect("/sign-in");

  const organizations = await auth.api.listOrganizations({
    headers: requestHeaders,
  });

  if (organizations.length === 0) redirect("/create-organization");

  const activeOrganization = organizations.find(
    (organization) =>
      organization.id === session.session.activeOrganizationId
  );

  return (
    <ProjectDashboardClient
      projectId={projectId}
      organizationName={activeOrganization?.name ?? "Workspace"}
    />
  );
}
