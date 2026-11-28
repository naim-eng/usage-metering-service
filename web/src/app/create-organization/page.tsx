import { Suspense } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import CreateOrganizationForm from "./create-organization-form";

async function ProtectedOrganizationPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    redirect("/sign-in");
  }

  return <CreateOrganizationForm />;
}

export default function CreateOrganizationPage() {
  return (
    <Suspense fallback={<main className="p-8">Checking your session...</main>}>
      <ProtectedOrganizationPage />
    </Suspense>
  );
}
