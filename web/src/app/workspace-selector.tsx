"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { authClient } from "@/lib/auth-client";
import SignOutButton from "./sign-out-button";

type Organization = {
  id: string;
  name: string;
  slug: string;
};

export default function WorkspaceSelector({
  organizations,
  activationAttempted,
}: {
  organizations: Organization[];
  activationAttempted: boolean;
}) {
  const singleOrganizationId =
    organizations.length === 1 && !activationAttempted
      ? organizations[0].id
      : null;

  const [pendingId, setPendingId] =
    useState<string | null>(singleOrganizationId);
  const [error, setError] = useState(
    activationAttempted
      ? "Workspace activation could not be confirmed. Please try again."
      : ""
  );
  const activationInProgress = useRef(false);
  const autoAttempted = useRef(false);

  const activateWorkspace = useCallback(async (organizationId: string) => {
    if (activationInProgress.current) return;

    activationInProgress.current = true;

    try {
      const result = await authClient.organization.setActive({
        organizationId,
      });

      if (result.error) {
        setError("Unable to select workspace. Please try again.");
        setPendingId(null);
        return;
      }

      window.location.replace("/?workspaceActivation=attempted");
    } catch {
      setError("Unable to select workspace. Please try again.");
      setPendingId(null);
    } finally {
      activationInProgress.current = false;
    }
  }, []);

  useEffect(() => {
    if (!singleOrganizationId || autoAttempted.current) return;

    autoAttempted.current = true;

    void activateWorkspace(singleOrganizationId);
  }, [singleOrganizationId, activateWorkspace]);

  function selectWorkspace(organizationId: string) {
    if (pendingId !== null || activationInProgress.current) return;

    setPendingId(organizationId);
    setError("");
    void activateWorkspace(organizationId);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-5 py-12">
      <section className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">
          Select your workspace
        </h1>

        <p className="mt-2 text-sm text-slate-600">
          Choose an organization to manage its projects and API usage.
        </p>

        <div className="mt-6 space-y-3">
          {organizations.map((organization) => (
            <button
              key={organization.id}
              type="button"
              disabled={pendingId !== null}
              onClick={() => selectWorkspace(organization.id)}
              className="w-full rounded-xl border border-slate-200 p-4 text-left transition hover:border-violet-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span className="block font-semibold text-slate-900">
                {organization.name}
              </span>
              <span className="mt-1 block text-sm text-slate-500">
                {pendingId === organization.id
                  ? "Opening workspace..."
                  : organization.slug}
              </span>
            </button>
          ))}
        </div>

        {error && (
          <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        )}

        <div className="mt-6 border-t border-slate-200 pt-6">
          <SignOutButton />
        </div>
      </section>
    </main>
  );
}
