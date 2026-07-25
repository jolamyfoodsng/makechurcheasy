"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import {
  Activity,
  CalendarClock,
  CreditCard,
  Eye,
  ReceiptText,
  Search,
  ShieldCheck,
} from "lucide-react";

interface SubscriptionEntry {
  id: string;
  userId: string;
  user: {
    name: string;
    email: string;
    churchName?: string;
  };
  plan: string;
  status: string;
  billingCycle: string;
  source: string;
  adminManaged: boolean;
  amount: number;
  currency: string;
  paymentReference?: string;
  currentPeriodStart?: string | null;
  currentPeriodEnd?: string | null;
  nextBillingDate?: string | null;
  autoRenew: boolean;
  startedAt?: string | null;
  renewedAt?: string | null;
  endedAt?: string | null;
  note?: string;
  emailSentAt?: string | null;
  managedBy?: {
    name: string;
    email: string;
  } | null;
}

interface SubscriptionsResponse {
  stats: {
    total: number;
    active: number;
    cancelled: number;
    adminManaged: number;
    monthlyRevenue: number;
  };
  subscriptions: SubscriptionEntry[];
}

function SkeletonBlock({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-2xl bg-gray-800 ${className}`} />;
}

function formatDate(value?: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString();
}

function formatMoney(amount: number, currency: string): string {
  if (!amount) return "-";
  // Extract valid 3-letter currency code (handles "NGN3500" → "NGN")
  const raw = (currency || "NGN").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3);
  const code = raw.length === 3 ? raw : "NGN";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: code,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${code} ${amount.toLocaleString("en-US")}`;
  }
}

function titleCase(value: string): string {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function statusClasses(status: string): string {
  if (status === "active" || status === "trialing") {
    return "bg-emerald-900/50 text-emerald-300 border-emerald-700/50";
  }
  if (status === "expired" || status === "past_due") {
    return "bg-amber-900/50 text-amber-300 border-amber-700/50";
  }
  return "bg-slate-800 text-slate-300 border-slate-700";
}

export default function AdminSubscriptionsPage() {
  const t = useTranslations();
  const [data, setData] = useState<SubscriptionsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (statusFilter !== "all") params.set("status", statusFilter);
        if (sourceFilter !== "all") params.set("provider", sourceFilter);

        const suffix = params.toString() ? `?${params.toString()}` : "";
        const res = await fetch(`/api/admin/subscriptions${suffix}`, { credentials: "include" });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed");
        setData(await res.json());
      } catch (err: any) {
        setError(err?.message || "Failed to load subscriptions");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [statusFilter, sourceFilter]);

  const filtered = useMemo(() => {
    const rows = data?.subscriptions || [];
    if (!search.trim()) return rows;
    const query = search.toLowerCase();
    return rows.filter((row) =>
      row.user.name.toLowerCase().includes(query) ||
      row.user.email.toLowerCase().includes(query) ||
      (row.user.churchName || "").toLowerCase().includes(query) ||
      row.plan.toLowerCase().includes(query) ||
      row.status.toLowerCase().includes(query) ||
      (row.paymentReference || "").toLowerCase().includes(query),
    );
  }, [data?.subscriptions, search]);

  if (loading) {
    return (
      <div className="p-6 lg:p-8 space-y-6 max-w-[1400px] mx-auto">
        <div>
          <SkeletonBlock className="h-8 w-56 mb-2" />
          <SkeletonBlock className="h-4 w-72" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          {[...Array(4)].map((_, index) => <SkeletonBlock key={index} className="h-[120px]" />)}
        </div>
        <SkeletonBlock className="h-11 w-full" />
        <SkeletonBlock className="h-[460px] w-full" />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1400px] mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-slate-50">
          {t("admin.subscriptions.title")}
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          {t("admin.subscriptions.description")}
        </p>
      </div>

      {error && (
        <div className="rounded-2xl bg-red-950/40 border border-red-800/60 p-4 text-sm text-red-200">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <StatCard icon={ReceiptText} label="Total subscriptions" value={data?.stats.total ?? 0} />
        <StatCard icon={Activity} label="Active" value={data?.stats.active ?? 0} tone="emerald" />
        <StatCard icon={ShieldCheck} label="Admin-managed" value={data?.stats.adminManaged ?? 0} tone="indigo" />
        <StatCard
          icon={CreditCard}
          label="Monthly revenue"
          value={formatMoney(data?.stats.monthlyRevenue ?? 0, "NGN")}
          tone="amber"
        />
      </div>

      <div className="flex flex-col lg:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="Search name, email, church, plan, or reference"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="w-full h-11 pl-9 pr-3 rounded-xl border border-slate-700 text-sm bg-gray-900 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-colors"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
          className="h-11 px-3 rounded-xl border border-slate-700 text-sm bg-gray-900 text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-colors"
        >
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="trialing">Trialing</option>
          <option value="past_due">Past due</option>
          <option value="cancelled">Cancelled</option>
          <option value="expired">Expired</option>
        </select>
        <select
          value={sourceFilter}
          onChange={(event) => setSourceFilter(event.target.value)}
          className="h-11 px-3 rounded-xl border border-slate-700 text-sm bg-gray-900 text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-colors"
        >
          <option value="all">All sources</option>
          <option value="admin_collected">Admin collected</option>
          <option value="paystack">Paystack</option>
        </select>
      </div>

      <div className="bg-gray-900 border border-slate-700 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700/50">
                <TableHead>User</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden lg:table-cell">Source</TableHead>
                <TableHead className="hidden xl:table-cell">Amount</TableHead>
                <TableHead className="hidden lg:table-cell">Period end</TableHead>
                <TableHead className="hidden xl:table-cell">Reference</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </tr>
            </thead>
            <tbody>
              {filtered.map((subscription) => (
                <tr key={subscription.id} className="border-b border-slate-800/60 hover:bg-gray-800/50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-indigo-500/20 rounded-full flex items-center justify-center text-indigo-300 text-xs font-bold shrink-0">
                        {subscription.user.name?.charAt(0)?.toUpperCase() || "?"}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-slate-100 truncate">
                          {subscription.user.name || "Unnamed user"}
                        </p>
                        <p className="text-[11px] text-slate-500 truncate">
                          {subscription.user.email}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-medium text-slate-200">{titleCase(subscription.plan)}</span>
                    <p className="text-[11px] text-slate-500">{titleCase(subscription.billingCycle)}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-xl text-[11px] font-semibold border ${statusClasses(subscription.status)}`}>
                      {titleCase(subscription.status)}
                    </span>
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell">
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                      {subscription.adminManaged ? <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" /> : <CreditCard className="w-3.5 h-3.5 text-slate-500" />}
                      <span>{subscription.adminManaged ? "Admin collected" : titleCase(subscription.source)}</span>
                    </div>
                    {subscription.managedBy && (
                      <p className="text-[11px] text-slate-600 mt-0.5">
                        by {subscription.managedBy.name}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3 hidden xl:table-cell text-slate-300">
                    {formatMoney(subscription.amount, subscription.currency)}
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell">
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                      <CalendarClock className="w-3.5 h-3.5 text-slate-500" />
                      {formatDate(subscription.currentPeriodEnd)}
                    </div>
                  </td>
                  <td className="px-4 py-3 hidden xl:table-cell">
                    <span className="block max-w-[180px] truncate text-xs text-slate-500">
                      {subscription.paymentReference || "-"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end">
                      <Link
                        href={`/admin/users/${subscription.userId}`}
                        className="p-1.5 rounded-xl text-slate-500 hover:text-indigo-400 hover:bg-indigo-500/10 transition-colors"
                        title="View user"
                      >
                        <Eye className="w-4 h-4" />
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center">
                    <CreditCard className="w-10 h-10 text-slate-600 mx-auto mb-3" />
                    <p className="text-sm font-medium text-slate-300">
                      {data?.subscriptions.length ? "No subscriptions match your filters." : t("admin.subscriptions.noData")}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      Admin-started subscriptions and Paystack subscriptions will appear here.
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  tone = "slate",
}: {
  icon: typeof CreditCard;
  label: string;
  value: string | number;
  tone?: "slate" | "emerald" | "indigo" | "amber";
}) {
  const iconTone = {
    slate: "text-slate-400",
    emerald: "text-emerald-400",
    indigo: "text-indigo-400",
    amber: "text-amber-400",
  }[tone];

  return (
    <div className="min-h-[120px] rounded-2xl bg-gray-900 border border-slate-700 p-6 flex flex-col justify-between">
      <div className="flex items-center gap-2 text-slate-400 text-sm">
        <Icon className={`w-4 h-4 ${iconTone}`} />
        {label}
      </div>
      <p className="text-3xl font-bold text-slate-50 tabular-nums">{value}</p>
    </div>
  );
}

function TableHead({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th className={`text-left px-4 py-3 font-semibold text-slate-400 text-xs uppercase tracking-wide ${className}`}>
      {children}
    </th>
  );
}
