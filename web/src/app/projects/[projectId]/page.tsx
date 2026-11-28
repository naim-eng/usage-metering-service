import { redirect } from "next/navigation";
import { resolveWorkspace } from "@/lib/resolve-workspace";
import ProjectDashboardClient from "./project-dashboard-client";

export const instant = false;

export default async function ProjectDashboardPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const [{ activeOrganization }, { projectId }] =
    await Promise.all([resolveWorkspace(), params]);

  if (!activeOrganization) {
    redirect("/");
  }

  return (
    <ProjectDashboardClient
      key={`${activeOrganization.id}:${projectId}`}
      projectId={projectId}
      organizationName={activeOrganization.name}
    />
  );
}
