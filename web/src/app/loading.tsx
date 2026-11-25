export default function Loading() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div role="status" className="flex flex-col items-center gap-4">
        <div
          aria-hidden="true"
          className="h-10 w-10 animate-spin rounded-full border-4 border-indigo-100 border-t-indigo-600 motion-reduce:animate-none"
        />
        <p className="text-sm font-medium text-slate-600">
          Loading workspace...
        </p>
      </div>
    </main>
  );
}
