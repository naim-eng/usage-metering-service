"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import ProjectApiKeys from "./project-api-keys";

type Project = {
  id: string;
  organizationId: string;
  name: string;
  slug: string;
  status: string;
  createdAt: string;
};

type AccountAllowance = {
  id: string;
  name: string;
  plan_id: string;
  plan_name: string;
  monthly_limit: string;
  max_per_request: string;
  units_used: string;
  units_remaining: string;
  month_start: string;
};

type UserAllowance = {
  user_id: string;
  plan_id: string;
  plan_name: string;
  monthly_limit: string;
  max_per_request: string;
  units_used: string;
  units_remaining: string;
  month_start: string;
};

type PlanChange = {
  plan_name: string;
  monthly_limit: string;
  max_per_request: string;
  change_type: string;
  effective_at: string;
};

type MonthlyAccount = {
  name: string;
  plan_name: string | null;
  monthly_limit: string | null;
  max_per_request: string | null;
  historical_limits_available: boolean;
  plan_changes: PlanChange[];
  units_used: string;
};

type MonthlyUser = {
  user_id: string;
  plan_name: string | null;
  monthly_limit: string | null;
  max_per_request: string | null;
  historical_limits_available: boolean;
  plan_changes: PlanChange[];
  units_used: string;
};

type UsageRecord = {
  request_id: string;
  user_id: string;
  units_requested: string;
  accepted: boolean;
  rejection_scope: string | null;
  rejection_rule: string | null;
  created_at: string;
};

type Notification = {
  id: string;
  scope: string;
  userId: string | null;
  month: string;
  thresholdPercent: number;
  monthlyLimit: string;
  unitsUsed: string;
  remainingCredits: string;
  createdAt: string;
};

type DashboardData = {
  project: Project;
  account: {
    account: AccountAllowance;
  };
  users: {
    users: UserAllowance[];
  };
  monthlyReport: {
    month: string;
    account: MonthlyAccount;
    users: MonthlyUser[];
  };
  usageHistory: {
    page: number;
    limit: number;
    history: UsageRecord[];
    hasMore: boolean;
  };
  notifications: {
    notifications: Notification[];
  };
};

function credits(value: string | null | undefined): string {
  if (value === null || value === undefined) return "Unavailable";

  const number = Number(value);

  return Number.isFinite(number)
    ? new Intl.NumberFormat("en-US").format(number)
    : value;
}

function percentage(used: string, limit: string | null): number {
  if (!limit) return 0;

  const usedNumber = Number(used);
  const limitNumber = Number(limit);

  if (
    !Number.isFinite(usedNumber) ||
    !Number.isFinite(limitNumber) ||
    limitNumber <= 0
  ) {
    return 0;
  }

  return Math.min(100, Math.max(0, (usedNumber / limitNumber) * 100));
}

function dateTime(value: string): string {
  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString();
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-5">
        <h2 className="text-lg font-bold text-slate-900">{title}</h2>
        {description && (
          <p className="mt-1 text-sm text-slate-500">{description}</p>
        )}
      </div>
      {children}
    </section>
  );
}

function MetricCard({
  label,
  value,
  description,
}: {
  label: string;
  value: string;
  description: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className="mt-3 text-3xl font-bold tracking-tight text-slate-900">
        {value}
      </p>
      <p className="mt-2 text-xs text-slate-500">{description}</p>
    </div>
  );
}

function ProgressBar({
  used,
  limit,
}: {
  used: string;
  limit: string | null;
}) {
  const value = percentage(used, limit);

  return (
    <div>
      <div className="mb-2 flex justify-between text-xs text-slate-500">
        <span>{credits(used)} used</span>
        <span>{limit ? credits(limit) : "Limit unavailable"}</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full transition-all ${
            value >= 90 ? "bg-red-500" : value >= 75 ? "bg-amber-500" : "bg-indigo-600"
          }`}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

export default function ProjectDashboardClient({
  projectId,
  organizationName,
}: {
  projectId: string;
  organizationName: string;
}) {
  const [month, setMonth] = useState(
    () => new Date().toISOString().slice(0, 7)
  );
  const [page, setPage] = useState(1);
  const historyLimit = 10;

  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    async function loadDashboard() {
      try {
        const query = new URLSearchParams({
          month,
          page: String(page),
          limit: String(historyLimit),
        });

        const response = await fetch(
          `/api/projects/${encodeURIComponent(projectId)}/dashboard?${query}`,
          {
            cache: "no-store",
            signal: controller.signal,
          }
        );

        const result = await response.json();

        if (!response.ok) {
          throw new Error(
            result.error || "Unable to load project dashboard."
          );
        }

        if (active) {
          setData(result as DashboardData);
          setError("");
        }
      } catch (err) {
        if (active && !controller.signal.aborted) {
          setError(
            err instanceof Error
              ? err.message
              : "Unable to load dashboard."
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadDashboard();

    return () => {
      active = false;
      controller.abort();
    };
  }, [projectId, month, page, retry]);

  const account = data?.account.account;
  const users = data?.users.users ?? [];
  const report = data?.monthlyReport;
  const history = data?.usageHistory.history ?? [];
  const notifications = data?.notifications.notifications ?? [];

  const monthlyUserMap = new Map(
    (report?.users ?? []).map((user) => [user.user_id, user])
  );

  return (
    <main className="min-h-screen bg-[#f7f8fc] text-slate-900">
      <header className="border-b border-slate-200 bg-white px-6 py-5 md:px-10">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4">
          <div>
            <Link
              href="/projects"
              className="text-xs font-medium text-indigo-600 hover:underline"
            >
              {organizationName} / Projects
            </Link>

            <h1 className="mt-2 text-xl font-bold">
              {data?.project.name ?? "Project dashboard"}
            </h1>

            <p className="mt-1 text-sm text-slate-500">
              {data?.project.slug ?? projectId}
            </p>
          </div>

          <Link
            href="/projects"
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium hover:bg-slate-50"
          >
            Back to Projects
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-7xl space-y-7 px-6 py-9 md:px-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">
              Overview
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Monitor your project&apos;s credit consumption and API activity.
            </p>
          </div>

          <label className="flex flex-col gap-2 text-xs font-semibold text-slate-600">
            Reporting month
            <input
              type="month"
              value={month}
              onChange={(event) => {
                setLoading(true);
                setError("");
                setPage(1);
                setMonth(event.target.value);
              }}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-indigo-500"
            />
          </label>
        </div>

        {loading && (
          <div className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-500">
            Loading project data...
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-5">
            <p role="alert" className="text-sm font-medium text-red-700">
              {error}
            </p>
            <button
              onClick={() => {
                setLoading(true);
                setRetry((value) => value + 1);
              }}
              className="mt-3 text-sm font-semibold text-red-700 underline"
            >
              Try again
            </button>
          </div>
        )}

        {data && !error && (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
                data.project.status === "active"
                  ? "bg-green-50 text-green-700"
                  : "bg-amber-50 text-amber-700"
              }`}>
                {data.project.status}
              </span>
              <span className="text-xs text-slate-500">
                Created {new Date(data.project.createdAt).toLocaleDateString()}
              </span>
              <span className="text-xs text-slate-500">
                Account: {account?.name ?? "Unavailable"}
              </span>
            </div>

            <section>
              <div className="mb-4">
                <h2 className="text-lg font-bold">Account allowance</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Current billing month: {account?.month_start ?? "Unavailable"}
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <MetricCard
                  label="Monthly limit"
                  value={credits(account?.monthly_limit)}
                  description={account?.plan_name ?? "Account plan"}
                />
                <MetricCard
                  label="Credits consumed"
                  value={credits(account?.units_used)}
                  description="Current monthly usage"
                />
                <MetricCard
                  label="Credits remaining"
                  value={credits(account?.units_remaining)}
                  description="Available account credits"
                />
                <MetricCard
                  label="Maximum per request"
                  value={credits(account?.max_per_request)}
                  description="Account request limit"
                />
              </div>
            </section>

            <Section
              title={`Monthly usage: ${report?.month ?? month}`}
              description="Historical reporting based on the selected UTC calendar month."
            >
              <div className="grid gap-6 md:grid-cols-2">
                <div>
                  <div className="mb-3 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold">Account consumption</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {report?.account.plan_name ?? "Historical plan unavailable"}
                      </p>
                    </div>
                    <span className="text-lg font-bold">
                      {credits(report?.account.units_used)}
                    </span>
                  </div>

                  <ProgressBar
                    used={report?.account.units_used ?? "0"}
                    limit={report?.account.monthly_limit ?? null}
                  />

                  {!report?.account.historical_limits_available && (
                    <p className="mt-2 text-xs text-amber-600">
                      Historical plan limit is unavailable.
                    </p>
                  )}
                </div>

                <div className="rounded-xl bg-slate-50 p-4">
                  <p className="text-sm font-semibold">Plan information</p>
                  <p className="mt-3 text-sm text-slate-600">
                    Plan: {report?.account.plan_name ?? "Unavailable"}
                  </p>
                  <p className="mt-2 text-sm text-slate-600">
                    Monthly limit: {credits(report?.account.monthly_limit)}
                  </p>
                  <p className="mt-2 text-sm text-slate-600">
                    Maximum per request: {credits(report?.account.max_per_request)}
                  </p>
                </div>
              </div>
            </Section>

            <ProjectApiKeys projectId={projectId} />

            <Section
              title="User allowances"
              description="Individual user quotas for the current month, alongside selected-month usage."
            >
              {users.length === 0 ? (
                <p className="py-6 text-center text-sm text-slate-500">
                  No registered users yet.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[700px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-xs text-slate-500">
                        <th className="py-3 pr-4">User ID</th>
                        <th className="py-3 pr-4">Plan</th>
                        <th className="py-3 pr-4">Monthly limit</th>
                        <th className="py-3 pr-4">Used</th>
                        <th className="py-3 pr-4">Remaining</th>
                        <th className="py-3">Selected month</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map((user) => {
                        const historical = monthlyUserMap.get(user.user_id);

                        return (
                          <tr key={user.user_id} className="border-b border-slate-100">
                            <td className="py-4 pr-4 font-medium">
                              {user.user_id}
                            </td>
                            <td className="py-4 pr-4">{user.plan_name}</td>
                            <td className="py-4 pr-4">
                              {credits(user.monthly_limit)}
                            </td>
                            <td className="py-4 pr-4">
                              {credits(user.units_used)}
                            </td>
                            <td className="py-4 pr-4 font-semibold">
                              {credits(user.units_remaining)}
                            </td>
                            <td className="py-4">
                              {historical
                                ? credits(historical.units_used)
                                : "Unavailable"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Section>

            <Section
              title="Plan changes"
              description={`Account plan changes recorded during ${month}.`}
            >
              {!report?.account.plan_changes.length ? (
                <p className="text-sm text-slate-500">
                  No account plan changes recorded for this month.
                </p>
              ) : (
                <div className="space-y-4">
                  {report.account.plan_changes.map((change, index) => (
                    <div
                      key={`${change.effective_at}-${index}`}
                      className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4 last:border-0"
                    >
                      <div>
                        <p className="text-sm font-semibold">
                          {change.plan_name}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {change.change_type.replaceAll("_", " ")}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium">
                          {credits(change.monthly_limit)} credits
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {dateTime(change.effective_at)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Section>

            <Section
              title="Recent API requests"
              description="The latest 10 accepted and rejected consumption requests."
            >
              {history.length === 0 ? (
                <p className="py-6 text-center text-sm text-slate-500">
                  No API requests recorded yet.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[700px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-xs text-slate-500">
                        <th className="py-3 pr-4">Request ID</th>
                        <th className="py-3 pr-4">User</th>
                        <th className="py-3 pr-4">Units</th>
                        <th className="py-3 pr-4">Decision</th>
                        <th className="py-3 pr-4">Rejection reason</th>
                        <th className="py-3">Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.map((item) => (
                        <tr key={item.request_id} className="border-b border-slate-100">
                          <td className="max-w-[150px] truncate py-4 pr-4 font-mono text-xs">
                            {item.request_id}
                          </td>
                          <td className="py-4 pr-4">{item.user_id}</td>
                          <td className="py-4 pr-4">
                            {credits(item.units_requested)}
                          </td>
                          <td className="py-4 pr-4">
                            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                              item.accepted
                                ? "bg-green-50 text-green-700"
                                : "bg-red-50 text-red-700"
                            }`}>
                              {item.accepted ? "Accepted" : "Rejected"}
                            </span>
                          </td>
                          <td className="py-4 pr-4 text-xs text-slate-500">
                            {item.accepted
                              ? "—"
                              : `${item.rejection_scope ?? ""} / ${item.rejection_rule ?? ""}`}
                          </td>
                          <td className="whitespace-nowrap py-4 text-xs text-slate-500">
                            {dateTime(item.created_at)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            <div className="flex items-center justify-between border-t border-slate-100 pt-4">
              <p className="text-xs text-slate-500">
                Page {data?.usageHistory.page ?? page}
              </p>

              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={page <= 1 || loading}
                  onClick={() => {
                    setLoading(true);
                    setPage((current) => current - 1);
                  }}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40 hover:bg-slate-50"
                >
                  Previous
                </button>

                <button
                  type="button"
                  disabled={!data?.usageHistory.hasMore || loading}
                  onClick={() => {
                    setLoading(true);
                    setPage((current) => current + 1);
                  }}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40 hover:bg-slate-50"
                >
                  Next
                </button>
              </div>
            </div>
            </Section>

            <Section
              title="Low-credit notifications"
              description="Account and user quota threshold alerts."
            >
              {notifications.length === 0 ? (
                <p className="text-sm text-slate-500">
                  No low-credit notifications recorded.
                </p>
              ) : (
                <div className="space-y-3">
                  {notifications.map((notification) => (
                    <div
                      key={notification.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-4"
                    >
                      <div>
                        <p className="text-sm font-semibold">
                          {notification.scope === "account"
                            ? "Account low-credit alert"
                            : "User low-credit alert"}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {notification.thresholdPercent}% threshold · {notification.month}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {dateTime(notification.createdAt)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-amber-700">
                          {credits(notification.remainingCredits)} remaining
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {credits(notification.unitsUsed)} / {credits(notification.monthlyLimit)} used
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Section>
          </>
        )}
      </div>
    </main>
  );
}
