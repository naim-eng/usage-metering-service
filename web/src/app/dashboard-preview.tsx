import SignOutButton from "./sign-out-button";

const navigation = [
  "Overview",
  "Projects",
  "Usage Analytics",
  "Quotas & Plans",
  "API Keys",
  "Notifications",
  "Settings",
];

const activity = [
  { day: "Mon", height: 46 },
  { day: "Tue", height: 70 },
  { day: "Wed", height: 55 },
  { day: "Thu", height: 85 },
  { day: "Fri", height: 65 },
  { day: "Sat", height: 95 },
  { day: "Sun", height: 75 },
];

const metrics = [
  {
    label: "Total API Requests",
    value: "1,248",
    detail: "Example monthly activity",
  },
  {
    label: "Credits Consumed",
    value: "12,480",
    detail: "Across all sample users",
  },
  {
    label: "Active Users",
    value: "84",
    detail: "Example workspace",
  },
  {
    label: "Quota Utilization",
    value: "62.4%",
    detail: "12,480 of 20,000 credits",
  },
];

export default function DashboardPreview({
  organizationName,
}: {
  organizationName: string | null;
}) {
  return (
    <div className="min-h-screen bg-[#f7f8fc] text-slate-900">
      <div className="flex min-h-screen">
        <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-200 bg-white lg:flex">
          <div className="border-b border-slate-100 px-6 py-7">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-xl font-bold text-white">
                U
              </div>
              <div>
                <p className="text-sm font-bold">Usage Metering</p>
                <p className="text-xs text-slate-500">Developer Platform</p>
              </div>
            </div>
          </div>

          <div className="px-4 py-6">
            <p className="mb-3 px-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
              Workspace
            </p>

            <nav className="space-y-1" aria-label="Dashboard navigation">
              {navigation.map((item, index) => (
                <div
                  key={item}
                  className={`flex items-center justify-between rounded-lg px-3 py-3 text-sm ${
                    index === 0
                      ? "bg-indigo-50 font-semibold text-indigo-700"
                      : "text-slate-500"
                  }`}
                >
                  <span>{item}</span>
                  {index !== 0 && (
                    <span className="text-[10px] text-slate-400">
                      Soon
                    </span>
                  )}
                </div>
              ))}
            </nav>
          </div>

          <div className="mt-auto border-t border-slate-100 p-6">
            <div className="rounded-xl bg-slate-50 p-4">
              <p className="text-sm font-semibold">Development Preview</p>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                This dashboard is not connected to live customer data yet.
              </p>
            </div>
          </div>
        </aside>

        <main className="min-w-0 flex-1">
          <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 bg-white px-6 py-5 md:px-10">
            <div>
              <p className="text-xs font-medium text-slate-400">
                {organizationName
                  ? `${organizationName} / Overview`
                  : "Workspace / Overview"}
              </p>
              <h1 className="mt-1 text-xl font-bold tracking-tight">
                Dashboard
              </h1>
            </div>

            <div className="flex items-center gap-3">
              <div className="rounded-full border border-indigo-200 bg-indigo-50 px-4 py-2 text-xs font-semibold text-indigo-700">
                Preview Mode
              </div>
              <SignOutButton />
            </div>
          </header>

          <div className="mx-auto max-w-7xl space-y-8 px-6 py-8 md:px-10">
            <section className="rounded-2xl bg-gradient-to-r from-indigo-700 to-violet-600 p-7 text-white md:p-9">
              <p className="text-sm font-medium text-indigo-100">
                Usage Metering Platform
              </p>
              <h2 className="mt-3 text-2xl font-bold tracking-tight md:text-3xl">
                Your usage, under control.
              </h2>
              <p className="mt-3 max-w-xl text-sm leading-6 text-indigo-100">
                Monitor API consumption, manage credit quotas, and keep
                track of your applications from one workspace.
              </p>
              <div className="mt-6 inline-flex rounded-lg bg-white/15 px-3 py-2 text-xs font-medium">
                Sample workspace data
              </div>
            </section>

            <section>
              <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-bold">Overview</h2>
                <span className="text-xs text-slate-500">
                  Illustrative data, not live metrics
                </span>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {metrics.map((metric) => (
                  <div
                    key={metric.label}
                    className="rounded-2xl border border-slate-200 bg-white p-6"
                  >
                    <p className="text-sm font-medium text-slate-500">
                      {metric.label}
                    </p>
                    <p className="mt-4 text-3xl font-bold tracking-tight">
                      {metric.value}
                    </p>
                    <p className="mt-2 text-xs text-slate-400">
                      {metric.detail}
                    </p>
                  </div>
                ))}
              </div>
            </section>

            <div className="grid gap-6 xl:grid-cols-3">
              <section className="rounded-2xl border border-slate-200 bg-white p-6 xl:col-span-2">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-bold">Usage Activity</h2>
                    <p className="mt-1 text-sm text-slate-500">
                      Example daily consumption trend
                    </p>
                  </div>
                  <span className="rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-600">
                    Last 7 days
                  </span>
                </div>

                <div className="mt-8 flex h-60 items-end justify-between gap-3 border-b border-slate-200 pb-3">
                  {activity.map((item) => (
                    <div
                      key={item.day}
                      className="flex h-full flex-1 flex-col items-center justify-end gap-3"
                    >
                      <div className="flex h-full w-full max-w-12 items-end">
                        <div
                          className="w-full rounded-t-lg bg-indigo-500"
                          style={{ height: `${item.height}%` }}
                        />
                      </div>
                      <span className="text-xs text-slate-500">
                        {item.day}
                      </span>
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-2xl border border-slate-200 bg-white p-6">
                <h2 className="text-lg font-bold">Monthly Quota</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Example project allowance
                </p>

                <div className="mt-9">
                  <p className="text-3xl font-bold">12,480</p>
                  <p className="mt-1 text-sm text-slate-500">
                    of 20,000 credits used
                  </p>

                  <div className="mt-5 h-3 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full w-[62.4%] rounded-full bg-indigo-600" />
                  </div>

                  <div className="mt-3 flex justify-between text-xs text-slate-500">
                    <span>62.4% used</span>
                    <span>7,520 remaining</span>
                  </div>
                </div>

                <div className="mt-10 rounded-xl bg-indigo-50 p-4">
                  <p className="text-sm font-semibold text-indigo-800">
                    Quota monitoring
                  </p>
                  <p className="mt-2 text-xs leading-5 text-indigo-700">
                    Your existing backend already enforces quotas and
                    records threshold notifications. Live dashboard
                    integration is coming next.
                  </p>
                </div>
              </section>
            </div>

            <section className="rounded-2xl border border-slate-200 bg-white p-6">
              <h2 className="text-lg font-bold">Projects</h2>
              <p className="mt-1 text-sm text-slate-500">
                Project management will be available after account
                authentication is implemented.
              </p>

              <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-5">
                <div>
                  <p className="font-semibold">Your first project</p>
                  <p className="mt-1 text-sm text-slate-500">
                    Create projects, configure quotas, and generate API keys.
                  </p>
                </div>
                <span className="rounded-lg bg-white px-4 py-2 text-xs font-semibold text-slate-500 shadow-sm">
                  Coming Soon
                </span>
              </div>
            </section>

            <footer className="pb-4 text-center text-xs text-slate-400">
              Usage Metering Platform · Development Preview
            </footer>
          </div>
        </main>
      </div>
    </div>
  );
}
