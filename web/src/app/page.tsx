import { Suspense } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import DashboardPreview from "./dashboard-preview";

async function AuthenticatedDashboard() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    redirect("/sign-in");
  }

  return <DashboardPreview />;
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
