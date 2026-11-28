"use client";

import { Suspense, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";
import {
  MIN_PASSWORD_LENGTH,
  MAX_PASSWORD_LENGTH,
} from "@/lib/password-policy";

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const invalidLink = !token || searchParams.has("error");

  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [loading, setLoading] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (loading || invalidLink || !token || completed) return;

    setError("");

    if (
      password.length < MIN_PASSWORD_LENGTH ||
      Array.from(password.normalize("NFKC")).length <
        MIN_PASSWORD_LENGTH
    ) {
      setError(
        `Password must contain at least ${MIN_PASSWORD_LENGTH} characters.`
      );
      return;
    }

    if (password.length > MAX_PASSWORD_LENGTH) {
      setError("Password is too long.");
      return;
    }

    if (password !== confirmation) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      const result = await authClient.resetPassword({
        newPassword: password,
        token,
      });

      if (result.error) {
        switch (result.error.code) {
          case "PASSWORD_COMPROMISED":
            setError(
              "This password has appeared in a data breach. Choose another password."
            );
            break;
          case "PASSWORD_SCREENING_UNAVAILABLE":
            setError(
              "Password security checks are temporarily unavailable. Please try again."
            );
            break;
          case "PASSWORD_TOO_SHORT":
          case "PASSWORD_TOO_LONG":
            setError("Your password does not meet the password requirements.");
            break;
          default:
            setError(
              result.error.status === 429
                ? "Too many requests. Please try again later."
                : "Unable to reset your password. Your link may be invalid or expired."
            );
        }

        return;
      }

      setPassword("");
      setConfirmation("");
      setCompleted(true);

      window.history.replaceState(
        null,
        "",
        "/reset-password"
      );
    } catch {
      setError("Unable to reset your password. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12">
      <section className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-900">
          {completed
            ? "Password reset successful"
            : invalidLink
              ? "Invalid or expired reset link"
              : "Reset your password"}
        </h1>

        {completed ? (
          <p role="status" className="mt-4 text-sm text-slate-600">
            Your password has been updated. Sign in using your new password.
          </p>
        ) : invalidLink ? (
          <p role="alert" className="mt-4 text-sm text-slate-600">
            Request a new password reset link to continue.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-slate-700"
              >
                New password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="new-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={loading}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900"
              />
              <p className="mt-1 text-xs text-slate-600">
                Use at least {MIN_PASSWORD_LENGTH} characters.
              </p>
            </div>

            <div>
              <label
                htmlFor="confirmation"
                className="block text-sm font-medium text-slate-700"
              >
                Confirm new password
              </label>
              <input
                id="confirmation"
                type="password"
                autoComplete="new-password"
                required
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
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
              {loading ? "Resetting password..." : "Reset password"}
            </button>
          </form>
        )}

        <div className="mt-6 flex flex-col gap-3 text-sm">
          {!completed && (
            <Link
              href="/forgot-password"
              className="text-slate-700 underline"
            >
              Request a new reset link
            </Link>
          )}

          <Link
            href="/sign-in"
            className="text-slate-700 underline"
          >
            Return to sign in
          </Link>
        </div>
      </section>
    </main>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<main className="p-8">Loading...</main>}>
      <ResetPasswordForm />
    </Suspense>
  );
}
