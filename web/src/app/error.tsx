"use client";

import Link from "next/link";

export default function ApplicationError({
  retry,
}: {
  retry: () => void;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <section
        role="alert"
        className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm"
      >
        <h1 className="text-2xl font-bold text-slate-900">
          Something went wrong
        </h1>

        <p className="mt-3 text-sm text-slate-600">
          We could not load this page. Please try again.
        </p>

        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={() => retry()}
            className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            Try again
          </button>

          <Link
            href="/"
            className="rounded-lg border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Return home
          </Link>
        </div>
      </section>
    </main>
  );
}
