
"use client";

import { useCallback, useEffect, useState } from "react";

type ApiKey = {
  id: string;
  projectId: string;
  name: string;
  keyPrefix: string;
  createdAt: string;
  revokedAt: string | null;
};

type CreatedApiKey = ApiKey & {
  apiKey: string;
};

type Props = {
  projectId: string;
};

export default function ProjectApiKeys({ projectId }: Props) {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [name, setName] = useState("");
  const [newKey, setNewKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const endpoint =
    `/api/projects/${encodeURIComponent(projectId)}/api-keys`;

  const loadKeys = useCallback(async (signal?: AbortSignal) => {
    const response = await fetch(endpoint, {
      cache: "no-store",
      signal,
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || "Unable to load API keys");
    }

    setKeys(result.apiKeys as ApiKey[]);
  }, [endpoint]);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      setLoading(true);
      setError("");

      try {
        await loadKeys(controller.signal);
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(
            err instanceof Error ? err.message : "Unable to load API keys"
          );
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => controller.abort();
  }, [loadKeys]);

  async function createKey(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedName = name.trim();

    if (!trimmedName || trimmedName.length > 100) {
      setError("Enter a name between 1 and 100 characters.");
      return;
    }

    setCreating(true);
    setError("");
    setMessage("");
    setNewKey(null);

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmedName }),
        cache: "no-store",
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Unable to create API key");
      }

      const created = result as CreatedApiKey;

      if (
        typeof created.apiKey !== "string" ||
        !created.apiKey.startsWith("um_")
      ) {
        throw new Error("Invalid API key response");
      }

      setNewKey(created.apiKey);
      setName("");
      setKeys((current) => [
        {
          id: created.id,
          projectId: created.projectId,
          name: created.name,
          keyPrefix: created.keyPrefix,
          createdAt: created.createdAt,
          revokedAt: created.revokedAt,
        },
        ...current,
      ]);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to create API key"
      );
    } finally {
      setCreating(false);
    }
  }

  async function revokeKey(key: ApiKey) {
    if (
      !window.confirm(
        `Revoke "${key.name}"? Applications using this key will stop authenticating immediately.`
      )
    ) {
      return;
    }

    setRevokingId(key.id);
    setError("");
    setMessage("");

    try {
      const response = await fetch(
        `${endpoint}/${encodeURIComponent(key.id)}`,
        {
          method: "DELETE",
          cache: "no-store",
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Unable to revoke API key");
      }

      setKeys((current) =>
        current.map((item) =>
          item.id === key.id
            ? { ...item, revokedAt: new Date().toISOString() }
            : item
        )
      );

      setMessage(`API key "${key.name}" was revoked.`);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to revoke API key"
      );
    } finally {
      setRevokingId(null);
    }
  }

  async function copyKey() {
    if (!newKey) return;

    try {
      await navigator.clipboard.writeText(newKey);
      setMessage("API key copied to clipboard.");
    } catch {
      setError("Unable to copy automatically. Select and copy the key.");
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-5">
        <h2 className="text-lg font-bold text-slate-900">
          API Keys
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Create and manage credentials used to authenticate API requests
          for this project.
        </p>
      </div>

      {error && (
        <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {message && (
        <p role="status" className="mb-4 rounded-lg bg-green-50 p-3 text-sm text-green-700">
          {message}
        </p>
      )}

      {newKey && (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-semibold text-amber-900">
            Save your new API key
          </p>
          <p className="mt-1 text-xs text-amber-800">
            This is the only time the complete key will be displayed.
            Store it securely before dismissing this message.
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            <input
              type="text"
              readOnly
              aria-label="New API key"
              value={newKey}
              autoComplete="off"
              spellCheck={false}
              className="min-w-0 flex-1 rounded-lg border border-amber-200 bg-white px-3 py-2 font-mono text-xs"
            />
            <button
              type="button"
              onClick={() => void copyKey()}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
            >
              Copy
            </button>
            <button
              type="button"
              onClick={() => {
                setNewKey(null);
                setMessage("");
              }}
              className="rounded-lg border border-amber-300 px-4 py-2 text-sm font-semibold text-amber-900 hover:bg-amber-100"
            >
              Done
            </button>
          </div>
        </div>
      )}

      <form onSubmit={(event) => void createKey(event)} className="mb-7">
        <label
          htmlFor="api-key-name"
          className="mb-2 block text-sm font-semibold text-slate-700"
        >
          New API key name
        </label>
        <div className="flex flex-wrap gap-3">
          <input
            id="api-key-name"
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={100}
            placeholder="e.g. Production server"
            autoComplete="off"
            className="min-w-[220px] flex-1 rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-500"
          />
          <button
            type="submit"
            disabled={creating || newKey !== null}
            className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {creating ? "Creating..." : "Generate API Key"}
          </button>
        </div>
        {newKey && (
          <p className="mt-2 text-xs text-amber-700">
            Save or dismiss your current key before generating another.
          </p>
        )}
      </form>

      <div className="border-t border-slate-100 pt-5">
        <h3 className="mb-4 text-sm font-semibold text-slate-900">
          Existing API keys
        </h3>

        {loading ? (
          <p className="text-sm text-slate-500">Loading API keys...</p>
        ) : keys.length === 0 ? (
          <p className="text-sm text-slate-500">
            No API keys have been generated yet.
          </p>
        ) : (
          <div className="space-y-3">
            {keys.map((key) => (
              <div
                key={key.id}
                className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 p-4"
              >
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    {key.name}
                  </p>
                  <p className="mt-1 font-mono text-xs text-slate-500">
                    {key.keyPrefix}...
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Created {new Date(key.createdAt).toLocaleString()}
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                      key.revokedAt
                        ? "bg-slate-100 text-slate-600"
                        : "bg-green-50 text-green-700"
                    }`}
                  >
                    {key.revokedAt ? "Revoked" : "Active"}
                  </span>

                  {!key.revokedAt && (
                    <button
                      type="button"
                      disabled={revokingId !== null}
                      onClick={() => void revokeKey(key)}
                      className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                    >
                      {revokingId === key.id ? "Revoking..." : "Revoke"}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
