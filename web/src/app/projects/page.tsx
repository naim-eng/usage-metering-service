import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import ProjectsClient from "./projects-client";

export const instant = false;

export default async function ProjectsPage() {
  const requestHeaders = await headers();

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
    <ProjectsClient
      organizationName={activeOrganization?.name ?? "Workspace"}
    />
  );
}
