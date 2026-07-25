"use client";

import {
  Activity,
  AlertTriangle,
  BarChart3,
  CreditCard,
  Crown,
  Globe,
  Landmark,
  Monitor,
  Users,
  Zap,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

/* ── Types ─────────────────────────────────────────────────────────────── */

interface OverviewData {
  totalUsers: number;
  activeUsers: number;
  activeToday: number;
  activeThisWeek: number;
  activeThisMonth: number;
  churches: number;
  paidSubscribers: number;
  trialUsers: number;
  freeUsers: number;
  countries: number;
  devices: number;
  monthlyRevenue: number;
  arr: number;
  aiHoursUsed: number;
  ambassadorCount: number;
  signupChart: Array<{ date: string; signups: number }>;
  recentActivity: Array<{ description: string; timestamp: string }>;
}

interface CountryItem {
  country: string;
  count: number;
}

/* ── Helpers ───────────────────────────────────────────────────────────── */

function SkeletonBlock({ className }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-2xl bg-gray-800 ${className ?? ""}`}
    />
  );
}

function KPICard({
  label,
  value,
  icon: Icon,
  iconColor,
  loading,
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  iconColor: string;
  loading?: boolean;
}) {
  if (loading) {
    return <SkeletonBlock className="min-h-[120px]" />;
  }
  return (
    <div className="min-h-[120px] rounded-2xl bg-gray-900 border border-slate-700 p-6 flex flex-col justify-between transition-colors hover:border-slate-600">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-slate-400">{label}</span>
        <div
          className={`w-10 h-10 rounded-xl flex items-center justify-center ${iconColor}`}
        >
          <Icon className="w-5 h-5" />
        </div>
      </div>
      <div className="mt-4">
        <p className="text-3xl font-bold text-slate-50 tracking-tight">
          {value}
        </p>
      </div>
    </div>
  );
}

/* ── Page ──────────────────────────────────────────────────────────────── */

export default function AdminDashboardPage() {
  const t = useTranslations();
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [countries, setCountries] = useState<CountryItem[]>([]);
  const [countriesLoading, setCountriesLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/overview", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((json) => {
        setData({
          totalUsers: json.kpis?.totalUsers ?? 0,
          activeUsers: json.kpis?.activeUsers ?? 0,
          activeToday: json.kpis?.activeToday ?? 0,
          activeThisWeek: json.kpis?.activeThisWeek ?? 0,
          activeThisMonth: json.kpis?.activeThisMonth ?? json.kpis?.activeUsers ?? 0,
          churches: json.kpis?.churches ?? 0,
          paidSubscribers: json.kpis?.paidSubscribers ?? 0,
          trialUsers: json.kpis?.trialUsers ?? 0,
          freeUsers: json.kpis?.freeUsers ?? 0,
          countries: json.kpis?.countries ?? 0,
          devices: json.kpis?.devices ?? 0,
          monthlyRevenue: json.kpis?.monthlyRevenue ?? 0,
          arr: json.kpis?.arr ?? 0,
          aiHoursUsed: json.kpis?.aiHoursUsed ?? 0,
          ambassadorCount: json.kpis?.ambassadorCount ?? 0,
          signupChart: json.signupChart ?? [],
          recentActivity: json.activity ?? [],
        });
      })
      .catch((err) => console.error("[admin] Failed to load overview:", err))
      .finally(() => setLoading(false));

    fetch("/api/admin/analytics", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((json) => {
        setCountries(json.business?.countryDistribution ?? []);
      })
      .catch((err) => console.error("[admin] Failed to load analytics:", err))
      .finally(() => setCountriesLoading(false));
  }, []);

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "NGN",
      minimumFractionDigits: 0,
    }).format(value);

  const formatNumber = (value: number) =>
    new Intl.NumberFormat("en-US").format(value);

  const chartData = (data?.signupChart ?? []).map((d) => ({
    date: d.date.slice(5),
    signups: d.signups,
  }));

  const alertItems: Array<{
    type: "warning";
    message: string;
    icon: typeof Zap;
  }> = [];

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1400px] mx-auto">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-50">
          {t("admin.dashboard.title")}
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          {t("admin.dashboard.description")}
        </p>
      </div>

      {/* Admin Alerts */}
      <div className="rounded-2xl bg-gray-900 border border-slate-700 p-5">
        <div className="flex items-center gap-2 mb-3">
          <AlertTriangle className="w-[20px] h-[20px] text-amber-400" />
          <h2 className="text-sm font-semibold text-slate-50">
            {t("admin.dashboard.alerts.title")}
          </h2>
        </div>
        {loading ? (
          <SkeletonBlock className="h-10" />
        ) : alertItems.length > 0 ? (
          <div className="space-y-2">
            {alertItems.map((alert, i) => {
              const AlertIcon = alert.icon;
              return (
                <div
                  key={i}
                  className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-gray-800 border border-slate-700"
                >
                  <AlertIcon className="w-4 h-4 text-amber-400 shrink-0" />
                  <span className="text-sm text-slate-300">
                    {alert.message}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-slate-400">
            {t("admin.dashboard.alerts.noAlerts")}
          </p>
        )}
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <KPICard
          label={t("admin.dashboard.totalUsers")}
          value={data ? formatNumber(data.totalUsers) : "—"}
          icon={Users}
          iconColor="bg-indigo-500/15 text-indigo-400"
          loading={loading}
        />
        <KPICard
          label="Active Today"
          value={data ? formatNumber(data.activeToday) : "—"}
          icon={Activity}
          iconColor="bg-emerald-500/15 text-emerald-400"
          loading={loading}
        />
        <KPICard
          label="Active Week"
          value={data ? formatNumber(data.activeThisWeek) : "—"}
          icon={Activity}
          iconColor="bg-teal-500/15 text-teal-400"
          loading={loading}
        />
        <KPICard
          label="Active Month"
          value={data ? formatNumber(data.activeThisMonth) : "—"}
          icon={Activity}
          iconColor="bg-cyan-500/15 text-cyan-400"
          loading={loading}
        />
        <KPICard
          label={t("admin.dashboard.churches")}
          value={data ? formatNumber(data.churches) : "—"}
          icon={Landmark}
          iconColor="bg-violet-500/15 text-violet-400"
          loading={loading}
        />
        <KPICard
          label={t("admin.dashboard.paidSubscribers")}
          value={data ? formatNumber(data.paidSubscribers) : "—"}
          icon={CreditCard}
          iconColor="bg-sky-500/15 text-sky-400"
          loading={loading}
        />
        <KPICard
          label="Trial Users"
          value={data ? formatNumber(data.trialUsers) : "—"}
          icon={Zap}
          iconColor="bg-orange-500/15 text-orange-400"
          loading={loading}
        />
        <KPICard
          label="Free Users"
          value={data ? formatNumber(data.freeUsers) : "—"}
          icon={Users}
          iconColor="bg-slate-500/15 text-slate-400"
          loading={loading}
        />
        <KPICard
          label={t("admin.dashboard.monthlyRevenue")}
          value={data ? formatCurrency(data.monthlyRevenue) : "—"}
          icon={BarChart3}
          iconColor="bg-amber-500/15 text-amber-400"
          loading={loading}
        />
        <KPICard
          label="ARR"
          value={data ? formatCurrency(data.arr) : "—"}
          icon={BarChart3}
          iconColor="bg-lime-500/15 text-lime-400"
          loading={loading}
        />
        <KPICard
          label="Countries"
          value={data ? formatNumber(data.countries) : "—"}
          icon={Globe}
          iconColor="bg-violet-500/15 text-violet-400"
          loading={loading}
        />
        <KPICard
          label="Devices"
          value={data ? formatNumber(data.devices) : "—"}
          icon={Monitor}
          iconColor="bg-rose-500/15 text-rose-400"
          loading={loading}
        />
        <KPICard
          label={t("admin.dashboard.ambassadors")}
          value={data ? formatNumber(data.ambassadorCount) : "—"}
          icon={Crown}
          iconColor="bg-pink-500/15 text-pink-400"
          loading={loading}
        />
      </div>

      {/* Growth Chart — Signups over the last 30 days */}
      <div className="rounded-2xl bg-gray-900 border border-slate-700 p-6">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <h2 className="text-base font-semibold text-slate-50">
            {t("admin.dashboard.growthChart.title")}
          </h2>
        </div>

        {loading ? (
          <SkeletonBlock className="h-[280px]" />
        ) : chartData.length === 0 ? (
          <div className="h-[280px] flex items-center justify-center">
            <p className="text-sm text-slate-400">
              {t("admin.dashboard.growthChart.noData")}
            </p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="signupGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#818CF8" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#818CF8" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis
                dataKey="date"
                stroke="#64748B"
                fontSize={11}
                tickLine={false}
              />
              <YAxis
                stroke="#64748B"
                fontSize={11}
                tickLine={false}
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#1E293B",
                  border: "1px solid #475569",
                  borderRadius: "12px",
                  color: "#E2E8F0",
                  fontSize: 12,
                }}
              />
              <Area
                type="monotone"
                dataKey="signups"
                stroke="#818CF8"
                strokeWidth={2}
                fill="url(#signupGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Two-column row: Recent Activity + Country Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Activity */}
        <div className="rounded-2xl bg-gray-900 border border-slate-700 p-6">
          <h2 className="text-base font-semibold text-slate-50 mb-4">
            Recent Activity
          </h2>
          {loading ? (
            <SkeletonBlock className="h-[280px]" />
          ) : !data?.recentActivity?.length ? (
            <p className="text-sm text-slate-500 text-center py-8">
              No recent activity
            </p>
          ) : (
            <div className="space-y-3 max-h-[280px] overflow-y-auto pr-1">
              {data.recentActivity.map((item, i) => (
                <div
                  key={i}
                  className="flex items-start gap-3 px-4 py-3 rounded-xl bg-gray-800 border border-slate-700/50"
                >
                  <Activity className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-slate-300 truncate">
                      {item.description}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {new Date(item.timestamp).toLocaleString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Country Distribution */}
        <div className="rounded-2xl bg-gray-900 border border-slate-700 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Globe className="w-4 h-4 text-emerald-400" />
            <h2 className="text-base font-semibold text-slate-50">
              {t("admin.dashboard.countryAnalytics.title")}
            </h2>
          </div>
          {countriesLoading ? (
            <SkeletonBlock className="h-[280px]" />
          ) : countries.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-8">
              {t("admin.dashboard.countryAnalytics.noData")}
            </p>
          ) : (
            <div className="space-y-3 max-h-[280px] overflow-y-auto pr-1">
              {countries.slice(0, 10).map((c) => {
                const maxCount = countries[0]?.count || 1;
                const pct = (c.count / maxCount) * 100;
                return (
                  <div key={c.country} className="flex items-center gap-3">
                    <span className="text-xs text-slate-400 w-28 truncate shrink-0">
                      {c.country}
                    </span>
                    <div className="flex-1 h-2 bg-gray-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 rounded-full"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-xs font-bold text-slate-50 w-10 text-right">
                      {c.count}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
