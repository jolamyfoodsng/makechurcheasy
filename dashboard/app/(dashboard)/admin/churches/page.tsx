"use client";

import { useEffect, useState, useMemo } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import {
  Landmark,
  Search,
  Filter,
  Download,
  Users,
  MapPin,
  Calendar,
  TrendingUp,
  ChevronRight,
} from "lucide-react";
import { getCountryDisplayName } from "@/lib/countryDisplay";

interface Church {
  id: string;
  name: string;
  country: string;
  pastor: string;
  members: number;
  plan: string;
  status: "active" | "inactive" | "trial";
  createdAt: string;
  lastActivity: string;
}

function SkeletonCard() {
  return (
    <div className="animate-pulse rounded-2xl bg-gray-800 border border-slate-700 min-h-[200px]" />
  );
}

export default function AdminChurchesPage() {
  const t = useTranslations();
  const [churches, setChurches] = useState<Church[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "inactive" | "trial">("all");

  useEffect(() => {
    fetch("/api/admin/users?role=admin&summary=churches", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((data) => {
        const churchList: Church[] = (Array.isArray(data) ? data : data.users || [])
          .filter((u: Record<string, unknown>) => u.churchName)
          .map((u: Record<string, unknown>) => ({
            id: u.id as string,
            name: u.churchName as string,
            country: getCountryDisplayName(u.country as string),
            pastor: (u.name as string) || "Unknown",
            members: 0,
            plan: (u.plan as string) || "free",
            status: u.isActive ? "active" : "inactive",
            createdAt: u.createdAt as string,
            lastActivity: u.lastLogin as string || u.createdAt as string,
          }));
        setChurches(churchList);
      })
      .catch(() => { })
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    return churches.filter((c) => {
      const matchSearch =
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.pastor.toLowerCase().includes(search.toLowerCase()) ||
        c.country.toLowerCase().includes(search.toLowerCase());
      const matchFilter = filter === "all" || c.status === filter;
      return matchSearch && matchFilter;
    });
  }, [churches, search, filter]);

  const stats = useMemo(() => {
    const active = churches.filter((c) => c.status === "active").length;
    const trial = churches.filter((c) => c.status === "trial").length;
    const countries = new Set(churches.map((c) => c.country)).size;
    return { total: churches.length, active, trial, countries };
  }, [churches]);

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "—";
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const planColors: Record<string, string> = {
    free: "bg-slate-500/15 text-slate-400",
    basic: "bg-sky-500/15 text-sky-400",
    growth: "bg-green-500/15 text-green-400",
    pro: "bg-violet-500/15 text-violet-400",
    ambassador: "bg-purple-500/15 text-purple-400",
    unlimited: "bg-amber-500/15 text-amber-400",
  };

  const statusColors: Record<string, string> = {
    active: "bg-emerald-500/15 text-emerald-400",
    inactive: "bg-red-500/15 text-red-400",
    trial: "bg-amber-500/15 text-amber-400",
  };

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-50">
            {t("admin.churches.title")}
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            {t("admin.churches.description")}
          </p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gray-800 border border-slate-700 text-sm font-medium text-slate-300 hover:bg-gray-700 hover:text-slate-50 transition-colors">
          <Download className="w-4 h-4" />
          {t("admin.churches.export")}
        </button>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {loading ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : (
          <>
            <div className="rounded-2xl bg-gray-900 border border-slate-700 p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 rounded-xl bg-violet-500/15 flex items-center justify-center">
                  <Landmark className="w-4.5 h-4.5 text-violet-400" />
                </div>
                <span className="text-xs font-medium text-slate-400">{t("admin.churches.totalChurches")}</span>
              </div>
              <p className="text-2xl font-bold text-slate-50">{stats.total}</p>
            </div>
            <div className="rounded-2xl bg-gray-900 border border-slate-700 p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/15 flex items-center justify-center">
                  <TrendingUp className="w-4.5 h-4.5 text-emerald-400" />
                </div>
                <span className="text-xs font-medium text-slate-400">{t("admin.churches.activeChurches")}</span>
              </div>
              <p className="text-2xl font-bold text-slate-50">{stats.active}</p>
            </div>
            <div className="rounded-2xl bg-gray-900 border border-slate-700 p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 rounded-xl bg-amber-500/15 flex items-center justify-center">
                  <Users className="w-4.5 h-4.5 text-amber-400" />
                </div>
                <span className="text-xs font-medium text-slate-400">{t("admin.churches.onTrial")}</span>
              </div>
              <p className="text-2xl font-bold text-slate-50">{stats.trial}</p>
            </div>
            <div className="rounded-2xl bg-gray-900 border border-slate-700 p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 rounded-xl bg-sky-500/15 flex items-center justify-center">
                  <MapPin className="w-4.5 h-4.5 text-sky-400" />
                </div>
                <span className="text-xs font-medium text-slate-400">{t("admin.churches.countries")}</span>
              </div>
              <p className="text-2xl font-bold text-slate-50">{stats.countries}</p>
            </div>
          </>
        )}
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("admin.churches.searchPlaceholder")}
            className="w-full h-11 pl-10 pr-4 rounded-xl bg-gray-900 border border-slate-700 text-sm text-slate-50 placeholder:text-slate-500 focus:outline-none focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/20 transition-colors"
          />
        </div>
        <div className="flex gap-1 bg-gray-900 rounded-xl p-1 border border-slate-700">
          {(["all", "active", "trial", "inactive"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3.5 py-2 rounded-lg text-xs font-medium capitalize transition-all ${filter === f
                ? "bg-gray-800 text-slate-50 shadow-sm"
                : "text-slate-400 hover:text-slate-300"
                }`}
            >
              {t(`admin.churches.filter.${f}`)}
            </button>
          ))}
        </div>
      </div>

      {/* Churches Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl bg-gray-900 border border-slate-700 p-12 text-center">
          <Landmark className="w-10 h-10 text-slate-500 mx-auto mb-3" />
          <p className="text-sm text-slate-400">{t("admin.churches.noResults")}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((church) => (
            <Link
              key={church.id}
              href={`/admin/churches/${church.id}`}
              className="group rounded-2xl bg-gray-900 border border-slate-700 p-6 hover:border-slate-600 transition-colors"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="w-12 h-12 rounded-xl bg-violet-500/15 flex items-center justify-center">
                  <Landmark className="w-6 h-6 text-violet-400" />
                </div>
                <span
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${statusColors[church.status]}`}
                >
                  {church.status}
                </span>
              </div>

              <h3 className="text-base font-semibold text-slate-50 mb-1 group-hover:text-violet-400 transition-colors">
                {church.name}
              </h3>
              <p className="text-xs text-slate-400 mb-4">{church.pastor}</p>

              <div className="space-y-2.5 mb-4">
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <MapPin className="w-3.5 h-3.5" />
                  <span>{church.country}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <Users className="w-3.5 h-3.5" />
                  <span>{church.members} {t("admin.churches.members")}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <Calendar className="w-3.5 h-3.5" />
                  <span>{formatDate(church.createdAt)}</span>
                </div>
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-slate-700/50">
                <span
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${planColors[church.plan] || planColors.free}`}
                >
                  {church.plan}
                </span>
                <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-slate-400 transition-colors" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
