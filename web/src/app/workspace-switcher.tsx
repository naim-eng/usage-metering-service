"use client";

import { useRef, useState } from "react";
import { authClient } from "@/lib/auth-client";

type Organization = {
  id: string;
  name: string;
};

export default function WorkspaceSwitcher({
  organizations,
  activeOrganizationId,
}: {
  organizations: Organization[];
  activeOrganizationId: string;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const switching = useRef(false);

  async function switchWorkspace(organizationId: string) {
    if (switching.current || organizationId === activeOrganizationId) {
      return;
    }

    switching.current = true;
    setPending(true);
    setError("");

    try {
      const result = await authClient.organization.setActive({
        organizationId,
      });

      if (result.error) {
        throw new Error("Workspace activation failed");
      }

      window.location.replace("/?workspaceActivation=attempted");
    } catch {
      setError("Unable to switch workspace. Please try again.");
      setPending(false);
      switching.current = false;
    }
  }

  if (organizations.length <= 1) {
    return null;
  }

  return (
    <div className="w-full sm:w-auto">
      <label
        htmlFor="workspace-switcher"
        className="block text-xs font-medium text-slate-500"
      >
        Active workspace
      </label>

      <select
        id="workspace-switcher"
        value={activeOrganizationId}
        disabled={pending}
        onChange={(event) => void switchWorkspace(event.target.value)}
        className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 disabled:opacity-60"
      >
        {organizations.map((organization) => (
          <option key={organization.id} value={organization.id}>
            {organization.name}
          </option>
        ))}
      </select>

      {pending && (
        <p role="status" className="mt-1 text-xs text-slate-500">
          Switching workspace...
        </p>
      )}

      {error && (
        <p role="alert" className="mt-1 text-xs text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
