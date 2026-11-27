"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";

export default function AuthEmailRequest({
  mode,
}: {
  mode: "password-reset" | "verification";
}) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  const recovery = mode === "password-reset";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (loading) return;

    setError("");

    if (!email.trim()) {
      setError("Enter your email address.");
      return;
    }

    setLoading(true);

    try {
      const result = recovery
        ? await authClient.requestPasswordReset({
            email: email.trim(),
            redirectTo: "/reset-password",
          })
        : await authClient.sendVerificationEmail({
            email: email.trim(),
            callbackURL: "/forgot-password",
          });

      if (result.error?.status === 429) {
        setError("Too many requests. Please try again later.");
        return;
      }

      setSubmitted(true);
    } catch {
      setError("Unable to submit your request. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12">
      <section className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-900">
          {submitted
            ? "Check your email"
            : recovery
              ? "Forgot your password?"
              : "Verify your email"}
        </h1>

        {submitted ? (
          <p className="mt-4 text-sm text-slate-600" role="status">
            {recovery
              ? "If an eligible account exists, you will receive a password reset link."
              : "If an eligible account exists, you will receive a verification link."}
          </p>
        ) : (
          <>
            <p className="mt-2 text-sm text-slate-600">
              {recovery
                ? "Enter your email address to request a password reset link."
                : "Enter your email address to request a new verification link."}
            </p>

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div>
                <label
                  htmlFor="email"
                  className="block text-sm font-medium text-slate-700"
                >
                  Email address
                </label>

                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  disabled={loading}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900"
                />
              </div>

              {error && (
                <p role="alert" className="text-sm text-red-700">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {loading
                  ? "Submitting..."
                  : recovery
                    ? "Send password reset link"
                    : "Send verification link"}
              </button>
            </form>
          </>
        )}

        <Link
          href="/sign-in"
          className="mt-6 inline-block text-sm font-medium text-slate-700 underline"
        >
          Return to sign in
        </Link>
      </section>
    </main>
  );
}
