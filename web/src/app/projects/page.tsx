import { redirect } from "next/navigation";
import { resolveWorkspace } from "@/lib/resolve-workspace";
import ProjectsClient from "./projects-client";

export const instant = false;

export default async function ProjectsPage() {
  const { activeOrganization } = await resolveWorkspace();

  if (!activeOrganization) {
    redirect("/");
  }

  return (
    <ProjectsClient
      key={activeOrganization.id}
      organizationName={activeOrganization.name}
    />
  );
}
