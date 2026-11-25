"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";

export default function SignOutButton() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function handleSignOut() {
    if (pending) return;

    setPending(true);
    setError("");

    try {
      const result = await authClient.signOut();

      if (result.error) {
        setError("Sign out failed. Please try again.");
        return;
      }

      window.location.replace("/sign-in");
    } catch {
      setError("Sign out failed. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleSignOut}
        disabled={pending}
        className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
      >
        {pending ? "Signing out..." : "Sign out"}
      </button>
      {error && (
        <p role="alert" className="mt-1 text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
