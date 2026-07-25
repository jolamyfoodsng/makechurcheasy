import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 flex items-center justify-center px-6">
      <div className="max-w-xl rounded-3xl border border-slate-800 bg-slate-900/80 p-10 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-blue-300">
          MakeChurchEasy
        </p>
        <h1 className="text-3xl font-semibold mt-4">Page not found</h1>
        <p className="text-sm text-slate-400 mt-3">
          The page you requested does not exist or is no longer available.
        </p>
        <div className="flex items-center justify-center gap-3 mt-8">
          <Link
            href="/dashboard"
            className="inline-flex items-center rounded-2xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-500"
          >
            Go to Dashboard
          </Link>
          <Link
            href="/admin"
            className="inline-flex items-center rounded-2xl border border-slate-700 px-5 py-3 text-sm font-semibold text-slate-200 hover:border-slate-500"
          >
            Open Admin
          </Link>
        </div>
      </div>
    </div>
  );
}
