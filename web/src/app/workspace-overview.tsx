import Link from "next/link";
import SignOutButton from "./sign-out-button";
import WorkspaceSwitcher from "./workspace-switcher";

const capabilities = [
  {
    title: "Usage analytics",
    description:
      "Monitor API requests, credit consumption, and monthly usage reports.",
  },
  {
    title: "Quota monitoring",
    description:
      "Review account and user allowances, remaining credits, and quota limits.",
  },
  {
    title: "API key management",
    description:
      "Generate and revoke project API keys for your application integrations.",
  },
  {
    title: "Usage history and notifications",
    description:
      "Review accepted and rejected requests and credit threshold notifications.",
  },
];

export default function WorkspaceOverview({
  organizationName,
  activeOrganizationId,
  organizations,
}: {
  organizationName: string;
  activeOrganizationId: string;
  organizations: { id: string; name: string }[];
}) {
  return (
    <div className="min-h-screen bg-[#f7f8fc] text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-5 md:px-10">
          <Link href="/" className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-xl font-bold text-white">
              U
            </span>
            <span className="font-bold">Usage Metering</span>
          </Link>
          <div className="flex flex-wrap items-center gap-4">
            <WorkspaceSwitcher
              organizations={organizations}
              activeOrganizationId={activeOrganizationId}
            />
            <SignOutButton />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-8 px-5 py-8 md:px-10">
        <nav
          aria-label="Workspace navigation"
          className="flex flex-wrap items-center gap-3"
        >
          <Link
            href="/"
            aria-current="page"
            className="rounded-lg bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-700"
          >
            Overview
          </Link>
          <Link
            href="/projects"
            className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-white"
          >
            Projects
          </Link>
        </nav>

        <section className="rounded-2xl bg-gradient-to-r from-indigo-700 to-violet-600 p-7 text-white md:p-9">
          <p className="text-sm font-medium text-indigo-100">
            Workspace overview
          </p>
          <h1 className="mt-3 break-words text-3xl font-bold">
            {organizationName}
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-indigo-100">
            Manage your application projects, monitor API consumption,
            and review credit quotas from your workspace.
          </p>
          <Link
            href="/projects"
            className="mt-6 inline-block rounded-xl bg-white px-5 py-3 text-sm font-semibold text-indigo-700 hover:bg-indigo-50"
          >
            Manage projects
          </Link>
        </section>

        <section>
          <h2 className="text-lg font-bold">Project capabilities</h2>
          <p className="mt-2 text-sm text-slate-600">
            Open a project to access its usage data and management tools.
          </p>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {capabilities.map((capability) => (
              <article
                key={capability.title}
                className="rounded-2xl border border-slate-200 bg-white p-6"
              >
                <h3 className="font-semibold">{capability.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {capability.description}
                </p>
              </article>
            ))}
          </div>
        </section>

        <footer className="pb-4 text-center text-xs text-slate-400">
          Usage Metering Platform
        </footer>
      </main>
    </div>
  );
}
