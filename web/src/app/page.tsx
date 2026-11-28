import { Suspense } from "react";
import { resolveWorkspace } from "@/lib/resolve-workspace";
import WorkspaceOverview from "./workspace-overview";
import WorkspaceSelector from "./workspace-selector";

type SearchParams = Promise<{
  workspaceActivation?: string | string[];
}>;

async function AuthenticatedDashboard({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { organizations, activeOrganization } =
    await resolveWorkspace();

  if (!activeOrganization) {
    const query = await searchParams;
    return (
      <WorkspaceSelector
        activationAttempted={query.workspaceActivation === "attempted"}
        organizations={organizations.map(({ id, name, slug }) => ({
          id,
          name,
          slug,
        }))}
      />
    );
  }

  return (
    <WorkspaceOverview
      key={activeOrganization.id}
      organizationName={activeOrganization.name}
      activeOrganizationId={activeOrganization.id}
      organizations={organizations.map(({ id, name }) => ({
        id,
        name,
      }))}
    />
  );
}

export default function HomePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen p-8 text-slate-600">
          Checking your session...
        </main>
      }
    >
      <AuthenticatedDashboard searchParams={searchParams} />
    </Suspense>
  );
}
