"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import {
  Crown,
  Search,
  Eye,
  CalendarPlus,
  ShieldOff,
  X,
  Users,
  Activity,
  Clock,
} from "lucide-react";

interface AmbassadorEntry {
  id: string;
  name: string;
  email: string;
  churchName?: string;
  ambassador: {
    active: boolean;
    grantedBy: string;
    grantedAt: string;
    expiresAt: string;
    creditsGranted: number;
    previousPlan: string;
    notes?: string;
  };
  credits: number;
}

function exceedsSixMonths(grantedAt: string): boolean {
  if (!grantedAt) return false;
  const SIX_MONTHS_MS = 6 * 30 * 24 * 60 * 60 * 1000;
  return Date.now() - new Date(grantedAt).getTime() > SIX_MONTHS_MS;
}

interface AmbassadorsResponse {
  stats: { total: number; active: number; expired: number };
  ambassadors: AmbassadorEntry[];
}

function SkeletonBlock({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-2xl bg-gray-800 ${className}`} />;
}

export default function AdminAmbassadorsPage() {
  const t = useTranslations();
  const [data, setData] = useState<AmbassadorsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "expired">("all");

  const [showExtend, setShowExtend] = useState<string | null>(null);
  const [extendDuration, setExtendDuration] = useState("3");
  const [extendCredits, setExtendCredits] = useState("");
  const [extending, setExtending] = useState(false);

  const [showRevoke, setShowRevoke] = useState<string | null>(null);
  const [revoking, setRevoking] = useState(false);

  const [toast, setToast] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/admin/ambassadors", { credentials: "include" });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed");
        const json = await res.json();
        setData(json);
      } catch (err: any) {
        setError(err?.message || "Failed to load ambassadors");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  function flash(type: "success" | "error", text: string) {
    setToast({ type, text });
    setTimeout(() => setToast(null), 3000);
  }

  async function handleExtend(id: string) {
    const creditsNum = extendCredits ? parseInt(extendCredits) : undefined;
    if (creditsNum !== undefined && creditsNum <= 0) return;
    setExtending(true);
    try {
      const res = await fetch(`/api/admin/users/${id}/ambassador`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          durationMonths: parseInt(extendDuration),
          credits: creditsNum,
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed");
      const updated = await res.json();
      setData((prev) => {
        if (!prev) return prev;
        const ambassadors = prev.ambassadors.map((a) =>
          a.id === id
            ? {
              ...a,
              ambassador: {
                ...a.ambassador,
                expiresAt: updated.ambassador.expiresAt,
                creditsGranted: updated.ambassador.creditsGranted,
                active: true,
              },
            }
            : a
        );
        const active = ambassadors.filter((a) => new Date(a.ambassador.expiresAt) > new Date()).length;
        return {
          stats: { total: ambassadors.length, active, expired: ambassadors.length - active },
          ambassadors,
        };
      });
      flash("success", t("admin.ambassadors.toast.ambassadorExtended"));
      setShowExtend(null);
      setExtendCredits("");
    } catch (err: any) {
      flash("error", err?.message || t("admin.ambassadors.toast.extendFailed"));
    } finally {
      setExtending(false);
    }
  }

  async function handleRevoke(id: string) {
    setRevoking(true);
    try {
      const res = await fetch(`/api/admin/users/${id}/ambassador`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed");
      setData((prev) => {
        if (!prev) return prev;
        const ambassadors = prev.ambassadors.map((a) =>
          a.id === id ? { ...a, ambassador: { ...a.ambassador, active: false } } : a
        );
        const active = ambassadors.filter((a) => a.ambassador.active).length;
        return {
          stats: { total: ambassadors.length, active, expired: ambassadors.length - active },
          ambassadors,
        };
      });
      flash("success", t("admin.ambassadors.toast.ambassadorRevoked"));
      setShowRevoke(null);
    } catch (err: any) {
      flash("error", err?.message || t("admin.ambassadors.toast.revokeFailed"));
    } finally {
      setRevoking(false);
    }
  }

  const now = Date.now();
  const filtered = (data?.ambassadors || []).filter((a) => {
    const isActive = new Date(a.ambassador.expiresAt).getTime() > now;
    const matchesStatus =
      statusFilter === "all" ||
      (statusFilter === "active" && isActive) ||
      (statusFilter === "expired" && !isActive);
    const matchesSearch =
      !search ||
      a.name?.toLowerCase().includes(search.toLowerCase()) ||
      a.email?.toLowerCase().includes(search.toLowerCase()) ||
      a.churchName?.toLowerCase().includes(search.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  if (loading) {
    return (
      <div className="p-6 lg:p-8 space-y-6 max-w-[1400px] mx-auto">
        <div>
          <SkeletonBlock className="h-8 w-48 mb-2" />
          <SkeletonBlock className="h-4 w-64" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <SkeletonBlock key={i} className="h-[120px]" />
          ))}
        </div>
        <SkeletonBlock className="h-11 w-full mb-4" />
        <SkeletonBlock className="h-[480px] w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 lg:p-8 space-y-6 max-w-[1400px] mx-auto">
        <div>
          <h1 className="text-2xl font-bold text-slate-50">{t("admin.ambassadors.title")}</h1>
          <p className="text-sm text-slate-400 mt-1">{t("admin.ambassadors.description")}</p>
        </div>
        <div className="rounded-2xl bg-gray-900 border border-slate-700 p-12 text-center">
          <Crown className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h2 className="text-base font-semibold text-slate-50 mb-1">{error}</h2>
        </div>
      </div>
    );
  }

  if (!data || data.ambassadors.length === 0) {
    return (
      <div className="p-6 lg:p-8 space-y-6 max-w-[1400px] mx-auto">
        <div>
          <h1 className="text-2xl font-bold text-slate-50">{t("admin.ambassadors.title")}</h1>
          <p className="text-sm text-slate-400 mt-1">{t("admin.ambassadors.description")}</p>
        </div>
        <div className="rounded-2xl bg-gray-900 border border-slate-700 p-12 text-center">
          <Crown className="w-12 h-12 text-slate-500 mx-auto mb-4" />
          <h2 className="text-base font-semibold text-slate-50 mb-1">
            {t("admin.ambassadors.noAmbassadors")}
          </h2>
          <p className="text-sm text-slate-400">
            {t("admin.ambassadors.noAmbassadorsDescription")}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-50">{t("admin.ambassadors.title")}</h1>
        <p className="text-sm text-slate-400 mt-1">{t("admin.ambassadors.description")}</p>
      </div>

      {/* Toast */}
      {toast && (
        <div
          className={`px-4 py-2.5 rounded-xl text-sm flex items-center gap-2 ${toast.type === "success"
              ? "bg-emerald-900/40 text-emerald-300 border border-emerald-700/50"
              : "bg-red-900/40 text-red-300 border border-red-700/50"
            }`}
        >
          {toast.text}
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="min-h-[120px] rounded-2xl bg-gray-900 border border-slate-700 p-6 flex flex-col justify-between">
          <div className="flex items-center gap-2 text-slate-400 text-sm">
            <Users className="w-4 h-4" />
            {t("admin.ambassadors.stats.totalAmbassadors")}
          </div>
          <p className="text-3xl font-bold text-slate-50">{data.stats.total}</p>
        </div>
        <div className="min-h-[120px] rounded-2xl bg-gray-900 border border-slate-700 p-6 flex flex-col justify-between">
          <div className="flex items-center gap-2 text-slate-400 text-sm">
            <Activity className="w-4 h-4" />
            {t("admin.ambassadors.stats.active")}
          </div>
          <p className="text-3xl font-bold text-emerald-400">{data.stats.active}</p>
        </div>
        <div className="min-h-[120px] rounded-2xl bg-gray-900 border border-slate-700 p-6 flex flex-col justify-between">
          <div className="flex items-center gap-2 text-slate-400 text-sm">
            <Clock className="w-4 h-4" />
            {t("admin.ambassadors.stats.expired")}
          </div>
          <p className="text-3xl font-bold text-slate-500">{data.stats.expired}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder={t("admin.users.searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-11 pl-9 pr-3 rounded-xl border border-slate-700 text-sm bg-gray-900 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-colors"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as "all" | "active" | "expired")}
          className="h-11 px-3 rounded-xl border border-slate-700 text-sm bg-gray-900 text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-colors"
        >
          <option value="all">{t("admin.users.filters.all")}</option>
          <option value="active">{t("admin.ambassadors.status.active")}</option>
          <option value="expired">{t("admin.ambassadors.status.expired")}</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-gray-900 border border-slate-700 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700/50">
                <th className="text-left px-4 py-3 font-semibold text-slate-400 text-xs uppercase tracking-wide">
                  {t("admin.ambassadors.table.name")}
                </th>
                <th className="text-left px-4 py-3 font-semibold text-slate-400 text-xs uppercase tracking-wide hidden md:table-cell">
                  {t("admin.ambassadors.table.email")}
                </th>
                <th className="text-left px-4 py-3 font-semibold text-slate-400 text-xs uppercase tracking-wide hidden lg:table-cell">
                  {t("admin.ambassadors.table.grantedOn")}
                </th>
                <th className="text-left px-4 py-3 font-semibold text-slate-400 text-xs uppercase tracking-wide hidden lg:table-cell">
                  {t("admin.ambassadors.table.expiresOn")}
                </th>
                <th className="text-left px-4 py-3 font-semibold text-slate-400 text-xs uppercase tracking-wide hidden xl:table-cell">
                  {t("admin.ambassadors.table.credits")}
                </th>
                <th className="text-left px-4 py-3 font-semibold text-slate-400 text-xs uppercase tracking-wide">
                  {t("admin.ambassadors.table.status")}
                </th>
                <th className="text-right px-4 py-3 font-semibold text-slate-400 text-xs uppercase tracking-wide">
                  {t("admin.ambassadors.table.actions")}
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((amb) => {
                const isActive = new Date(amb.ambassador.expiresAt).getTime() > now;
                return (
                  <tr key={amb.id} className="border-b border-slate-800/60 hover:bg-gray-800/50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-amber-500/20 rounded-full flex items-center justify-center text-amber-400 text-xs font-bold shrink-0">
                          {amb.name?.charAt(0)?.toUpperCase() || "?"}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="font-medium text-slate-100 truncate">
                              {amb.name || t("common.unnamed")}
                            </p>
                            <Crown className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                          </div>
                          {amb.churchName && (
                            <p className="text-[11px] text-slate-600 truncate">{amb.churchName}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <span className="text-xs text-slate-400 truncate block max-w-[200px]">
                        {amb.email}
                      </span>
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <span className="text-xs text-slate-400">
                        {new Date(amb.ambassador.grantedAt).toLocaleDateString()}
                      </span>
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <span className={`text-xs ${isActive ? "text-slate-400" : "text-red-400"}`}>
                        {new Date(amb.ambassador.expiresAt).toLocaleDateString()}
                      </span>
                    </td>
                    <td className="px-4 py-3 hidden xl:table-cell">
                      <span className="text-slate-300 font-medium">
                        {amb.ambassador.creditsGranted.toLocaleString()}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-xl text-[11px] font-semibold ${isActive
                              ? "bg-emerald-900/50 text-emerald-300 border border-emerald-700/50"
                              : "bg-red-900/50 text-red-300 border border-red-700/50"
                            }`}
                        >
                          {isActive
                            ? t("admin.ambassadors.status.active")
                            : t("admin.ambassadors.status.expired")}
                        </span>
                        {isActive && exceedsSixMonths(amb.ambassador.grantedAt) && (
                          <span className="inline-flex px-2 py-0.5 rounded-xl text-[11px] font-semibold bg-amber-900/50 text-amber-300 border border-amber-700/50">
                            6+ months
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Link
                          href={`/admin/users/${amb.id}`}
                          className="p-1.5 rounded-xl text-slate-500 hover:text-indigo-400 hover:bg-indigo-500/10 transition-colors"
                          title={t("admin.ambassadors.actions.view")}
                        >
                          <Eye className="w-4 h-4" />
                        </Link>
                        <button
                          onClick={() => {
                            setShowExtend(amb.id);
                            setExtendDuration("3");
                            setExtendCredits("");
                          }}
                          className="p-1.5 rounded-xl text-slate-500 hover:text-amber-400 hover:bg-amber-500/10 transition-colors"
                          title={t("admin.ambassadors.actions.extend")}
                        >
                          <CalendarPlus className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setShowRevoke(amb.id)}
                          className="p-1.5 rounded-xl text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                          title={t("admin.ambassadors.actions.revoke")}
                        >
                          <ShieldOff className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-sm text-slate-500">
                    {t("admin.ambassadors.noAmbassadors")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Extend Modal */}
      {showExtend && (
        <Modal onClose={() => setShowExtend(null)} title={t("admin.ambassadors.extend.title")}>
          <div className="space-y-4">
            <p className="text-xs text-slate-400">{t("admin.ambassadors.extend.description")}</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">
                  {t("admin.ambassadors.extend.duration")}
                </label>
                <select
                  value={extendDuration}
                  onChange={(e) => setExtendDuration(e.target.value)}
                  className="w-full h-11 px-3 rounded-xl border border-slate-700 text-sm bg-gray-800 text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-colors"
                >
                  <option value="1">{t("admin.ambassadors.durations.oneMonth")}</option>
                  <option value="3">{t("admin.ambassadors.durations.threeMonths")}</option>
                  <option value="6">{t("admin.ambassadors.durations.sixMonths")}</option>
                  <option value="12">{t("admin.ambassadors.durations.twelveMonths")}</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">
                  {t("admin.ambassadors.extend.credits")}
                </label>
                <input
                  type="number"
                  min="1"
                  value={extendCredits}
                  onChange={(e) => setExtendCredits(e.target.value)}
                  placeholder={t("admin.ambassadors.extend.credits")}
                  className="w-full h-11 px-3 rounded-xl border border-slate-700 text-sm bg-gray-800 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-colors"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowExtend(null)}
                className="px-5 py-2.5 text-sm font-medium text-slate-400 hover:text-slate-200 hover:bg-gray-800 rounded-xl transition-colors"
              >
                {t("common.cancel")}
              </button>
              <button
                onClick={() => handleExtend(showExtend)}
                disabled={extending}
                className="px-5 py-2.5 text-sm font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-xl disabled:opacity-50 transition-colors"
              >
                {extending ? t("admin.ambassadors.extend.extending") : t("admin.ambassadors.extend.button")}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Revoke Confirmation Modal */}
      {showRevoke && (
        <Modal onClose={() => setShowRevoke(null)} title={t("admin.ambassadors.revoke.title")}>
          <div className="space-y-4">
            <p className="text-xs text-slate-400">{t("admin.ambassadors.revoke.description")}</p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowRevoke(null)}
                className="px-5 py-2.5 text-sm font-medium text-slate-400 hover:text-slate-200 hover:bg-gray-800 rounded-xl transition-colors"
              >
                {t("common.cancel")}
              </button>
              <button
                onClick={() => handleRevoke(showRevoke)}
                disabled={revoking}
                className="px-5 py-2.5 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 rounded-xl disabled:opacity-50 transition-colors"
              >
                {revoking ? t("admin.ambassadors.revoke.revoking") : t("admin.ambassadors.revoke.button")}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Modal({
  onClose,
  title,
  children,
}: {
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-gray-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700/50">
          <h3 className="text-sm font-semibold text-slate-50">{title}</h3>
          <button
            onClick={onClose}
            className="p-1 rounded-xl text-slate-500 hover:text-slate-200 hover:bg-gray-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-6 py-4">{children}</div>
      </div>
    </div>
  );
}
