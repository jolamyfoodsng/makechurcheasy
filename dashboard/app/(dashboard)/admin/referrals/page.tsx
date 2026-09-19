"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Gift,
  Search,
  TrendingUp,
  Users,
} from "lucide-react";
import { getAdminReferrals, type AdminReferralOverview, type ReferralListItem } from "@/lib/api";

type StatusFilter = "all" | "signed_up" | "paid";

function formatDate(value: string | null): string {
  if (!value) return "Not yet";
  try {
    return new Date(value).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return value;
  }
}

function userLabel(user: ReferralListItem["referredUser"]): string {
  return user?.name || user?.email || "Unknown user";
}

function SkeletonBlock({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-2xl bg-gray-800 ${className}`} />;
}

export default function AdminReferralsPage() {
  const [data, setData] = useState<AdminReferralOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const result = await getAdminReferrals();
        if (!cancelled) setData(result);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load referrals");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const rows = data?.referrals || [];
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      const matchesStatus = statusFilter === "all" || row.status === statusFilter;
      const referrer = row.referrerUser;
      const referred = row.referredUser;
      const matchesSearch =
        !q ||
        row.code.toLowerCase().includes(q) ||
        referrer?.name.toLowerCase().includes(q) ||
        referrer?.email.toLowerCase().includes(q) ||
        referrer?.churchName.toLowerCase().includes(q) ||
        referred?.name.toLowerCase().includes(q) ||
        referred?.email.toLowerCase().includes(q) ||
        referred?.churchName.toLowerCase().includes(q);
      return matchesStatus && matchesSearch;
    });
  }, [data?.referrals, search, statusFilter]);

  if (loading) {
    return (
      <div className="mx-auto max-w-[1400px] space-y-6 p-6 lg:p-8">
        <div>
          <SkeletonBlock className="mb-2 h-8 w-48" />
          <SkeletonBlock className="h-4 w-72" />
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <SkeletonBlock className="h-[118px]" />
          <SkeletonBlock className="h-[118px]" />
          <SkeletonBlock className="h-[118px]" />
          <SkeletonBlock className="h-[118px]" />
        </div>
        <SkeletonBlock className="h-[520px]" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 p-6 lg:p-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-50">Referrals</h1>
          <p className="mt-1 text-sm text-slate-400">
            Track referral signups and which referrals became paid subscriptions.
          </p>
        </div>
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-500/30 bg-red-950/30 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <div className="rounded-2xl border border-slate-700 bg-gray-900 p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Signups
            </span>
            <Users className="h-5 w-5 text-blue-400" />
          </div>
          <p className="mt-3 text-3xl font-bold text-slate-50">
            {data?.stats.totalSignups ?? 0}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-700 bg-gray-900 p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Paid
            </span>
            <CheckCircle2 className="h-5 w-5 text-green-400" />
          </div>
          <p className="mt-3 text-3xl font-bold text-slate-50">
            {data?.stats.paidSignups ?? 0}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-700 bg-gray-900 p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Pending
            </span>
            <Gift className="h-5 w-5 text-amber-400" />
          </div>
          <p className="mt-3 text-3xl font-bold text-slate-50">
            {data?.stats.pendingSignups ?? 0}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-700 bg-gray-900 p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Conversion
            </span>
            <TrendingUp className="h-5 w-5 text-violet-400" />
          </div>
          <p className="mt-3 text-3xl font-bold text-slate-50">
            {data?.stats.conversionRate ?? 0}%
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-700 bg-gray-900">
        <div className="flex flex-col gap-3 border-b border-slate-700 p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full lg:max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search referrer, referred user, church, or code..."
              className="h-[44px] w-full rounded-xl border border-slate-700 bg-slate-950 pl-10 pr-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20"
            />
          </div>

          <div className="flex rounded-xl border border-slate-700 bg-slate-950 p-1">
            {(["all", "signed_up", "paid"] as StatusFilter[]).map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => setStatusFilter(status)}
                className={`h-9 rounded-lg px-3 text-xs font-semibold transition ${
                  statusFilter === status
                    ? "bg-violet-500 text-white"
                    : "text-slate-400 hover:bg-gray-800 hover:text-slate-100"
                }`}
              >
                {status === "all" ? "All" : status === "paid" ? "Paid" : "Signed Up"}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[940px] text-left text-sm">
            <thead className="border-b border-slate-700 text-xs font-bold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-5 py-3">Referrer</th>
                <th className="px-5 py-3">Referred User</th>
                <th className="px-5 py-3">Code</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Signed Up</th>
                <th className="px-5 py-3">Paid</th>
                <th className="px-5 py-3 text-right">Plan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {filtered.map((row) => (
                <tr key={row.id} className="h-14">
                  <td className="px-5 py-3">
                    <div className="font-semibold text-slate-100">
                      {userLabel(row.referrerUser || null)}
                    </div>
                    <div className="text-xs text-slate-500">
                      {row.referrerUser?.churchName || row.referrerUser?.email || "No profile"}
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <div className="font-semibold text-slate-100">
                      {userLabel(row.referredUser)}
                    </div>
                    <div className="text-xs text-slate-500">
                      {row.referredUser?.churchName || row.referredUser?.email || "No profile"}
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <span className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 font-mono text-xs font-bold tracking-wider text-slate-200">
                      {row.code}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-1 text-xs font-semibold ${
                        row.status === "paid"
                          ? "border-green-500/30 bg-green-500/10 text-green-300"
                          : "border-amber-500/30 bg-amber-500/10 text-amber-300"
                      }`}
                    >
                      {row.status === "paid" ? "Paid" : "Signed up"}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-slate-300">{formatDate(row.createdAt)}</td>
                  <td className="px-5 py-3 text-slate-300">{formatDate(row.paidAt)}</td>
                  <td className="px-5 py-3 text-right font-semibold capitalize text-slate-100">
                    {row.paidPlan || row.referredUser?.plan || "Free"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
            <Gift className="mb-4 h-10 w-10 text-slate-600" />
            <h2 className="text-sm font-semibold text-slate-100">No referrals found</h2>
            <p className="mt-1 max-w-sm text-xs text-slate-500">
              Referral signups will appear here after users create accounts with a referral code.
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
