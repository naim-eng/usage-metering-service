"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";

type Project = {
  id: string;
  organizationId: string;
  name: string;
  slug: string;
  status: string;
  createdAt: string;
};

export default function ProjectsClient({
  organizationName,
}: {
  organizationName: string;
}) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [apiKey, setApiKey] = useState("");

  const loadProjects = useCallback(async (): Promise<Project[]> => {
    const response = await fetch("/api/projects", {
      cache: "no-store",
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || "Unable to load projects.");
    }

    return result.projects;
  }, []);

  useEffect(() => {
    let active = true;

    loadProjects()
      .then((items) => {
        if (active) setProjects(items);
      })
      .catch((err: Error) => {
        if (active) setError(err.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [loadProjects]);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (creating || !name.trim()) return;

    setCreating(true);
    setError("");
    setSuccess("");
    setApiKey("");

    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: name.trim() }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Project creation failed.");
      }

      if (typeof result.apiKey === "string") {
        setApiKey(result.apiKey);
      }

      setName("");
      setSuccess("Your project was created successfully.");

      setProjects(await loadProjects());
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Something went wrong."
      );
    } finally {
      setCreating(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f7f8fc] text-slate-900">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 bg-white px-6 py-5 md:px-10">
        <div>
          <Link href="/" className="text-xs font-medium text-indigo-600 hover:underline">
            {organizationName} / Overview
          </Link>
          <h1 className="mt-1 text-xl font-bold">Projects</h1>
        </div>

        <Link
          href="/"
          className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium hover:bg-slate-50"
        >
          Back to Dashboard
        </Link>
      </header>

      <div className="mx-auto max-w-7xl space-y-8 px-6 py-10 md:px-10">
        <section>
          <h2 className="text-2xl font-bold tracking-tight">
            Manage your projects
          </h2>
          <p className="mt-2 text-sm text-slate-500">
            Create and manage applications connected to your metering workspace.
          </p>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="text-lg font-bold">Create a project</h2>
          <p className="mt-1 text-sm text-slate-500">
            Each project receives its own metering account and API key.
          </p>

          <form onSubmit={handleCreate} className="mt-6 flex flex-col gap-3 sm:flex-row">
            <input
              type="text"
              required
              minLength={2}
              maxLength={100}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Enter your project name"
              className="min-w-0 flex-1 rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
            />

            <button
              type="submit"
              disabled={creating || name.trim().length < 2}
              className="rounded-xl bg-indigo-600 px-6 py-3 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {creating ? "Creating..." : "Create Project"}
            </button>
          </form>

          {error && (
            <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
              {error}
            </p>
          )}

          {success && (
            <p className="mt-4 rounded-lg bg-green-50 p-3 text-sm text-green-700">
              {success}
            </p>
          )}

          {apiKey && (
            <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-5">
              <h3 className="font-semibold text-amber-900">
                Your new API key
              </h3>
              <p className="mt-1 text-sm text-amber-800">
                Copy and securely save this key. Treat it as a secret.
              </p>
              <code className="mt-3 block break-all rounded-lg bg-white p-4 text-sm text-slate-800">
                {apiKey}
              </code>
            </div>
          )}
        </section>

        <section>
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold">Your projects</h2>
              <p className="mt-1 text-sm text-slate-500">
                {projects.length} {projects.length === 1 ? "project" : "projects"} in this workspace
              </p>
            </div>
          </div>

          {loading ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
              Loading projects...
            </div>
          ) : projects.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-50 text-2xl text-indigo-600">
                +
              </div>
              <h3 className="mt-5 text-lg font-bold">No projects yet</h3>
              <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
                Create your first project to start managing its API usage,
                quotas, and metering activity.
              </p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {projects.map((project) => (
                <Link
                  key={project.id}
                  href={`/projects/${encodeURIComponent(project.id)}`}
                  className="block rounded-2xl border border-slate-200 bg-white p-6 transition hover:border-indigo-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-50 font-bold text-indigo-600">
                      {project.name.charAt(0).toUpperCase()}
                    </div>

                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        project.status === "active"
                          ? "bg-green-50 text-green-700"
                          : project.status === "failed"
                            ? "bg-red-50 text-red-700"
                            : "bg-amber-50 text-amber-700"
                      }`}
                    >
                      {project.status}
                    </span>
                  </div>

                  <h3 className="mt-5 text-lg font-bold">{project.name}</h3>
                  <p className="mt-1 text-sm text-slate-500">{project.slug}</p>

                  <div className="mt-6 border-t border-slate-100 pt-4">
                    <p className="text-xs text-slate-400">Created</p>
                    <p className="mt-1 text-sm text-slate-600">
                      {new Date(project.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
