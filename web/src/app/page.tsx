import { Suspense } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import DashboardPreview from "./dashboard-preview";

async function AuthenticatedDashboard() {
  const requestHeaders = await headers();
  const session = await auth.api.getSession({
    headers: requestHeaders,
  });

  if (!session?.user) {
    redirect("/sign-in");
  }

  const organizations = await auth.api.listOrganizations({
    headers: requestHeaders,
  });

  if (organizations.length === 0) {
    redirect("/create-organization");
  }

  const activeOrganization = organizations.find(
    (organization) => organization.id === session.session.activeOrganizationId
  );

  return (
    <DashboardPreview organizationName={activeOrganization?.name ?? null} />
  );
}

export default function HomePage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen p-8 text-slate-600">
          Checking your session...
        </main>
      }
    >
      <AuthenticatedDashboard />
    </Suspense>
  );
}
