"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";

function makeSlug(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50)
    .replace(/-+$/g, "");
}

export default function CreateOrganizationForm() {
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;

    setError("");

    const cleanName = name.trim();
    const slug = makeSlug(cleanName);

    if (cleanName.length < 2 || cleanName.length > 100 || !slug) {
      setError("Enter a name of 2-100 characters containing letters or numbers.");
      return;
    }

    setLoading(true);

    try {
      const result = await authClient.organization.create({
        name: cleanName,
        slug,
      });

      if (result.error || !result.data) {
        setError(
          "Unable to create organization. Check the name and try again."
        );
        return;
      }

      setCreated(result.data.name);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-5 py-12">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        {created ? (
          <>
            <h1 className="text-2xl font-bold text-slate-900">
              Organization created!
            </h1>
            <p className="mt-4 text-slate-600">
              {created} was created successfully.
            </p>
            <Link
              href="/"
              className="mt-6 inline-block rounded-lg bg-violet-600 px-5 py-3 font-semibold text-white"
            >
              Return to dashboard
            </Link>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-bold text-slate-900">
              Create your organization
            </h1>
            <p className="mt-2 text-sm text-slate-500">
              Set up a workspace for your applications and team.
            </p>

            <form onSubmit={handleSubmit} className="mt-8 space-y-5">
              <label className="block text-sm font-medium text-slate-700">
                Organization name
                <input
                  required
                  maxLength={100}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Example: AI Studio"
                  className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-slate-900 outline-none focus:border-violet-500"
                />
              </label>

              <p className="text-sm text-slate-500">
                Workspace identifier: {makeSlug(name) || "your-organization"}
              </p>

              {error && (
                <p role="alert" className="text-sm text-red-600">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-xl bg-violet-600 px-5 py-3 font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
              >
                {loading ? "Creating..." : "Create organization"}
              </button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
