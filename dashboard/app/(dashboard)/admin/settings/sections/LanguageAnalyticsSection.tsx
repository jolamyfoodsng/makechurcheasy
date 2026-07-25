"use client";

import { useState, useEffect, useCallback } from "react";
import { RefreshCw, Info } from "lucide-react";
import { Card, CardHeader, Badge, Button, Skeleton } from "@/components/ui";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { LOCALES } from "@/i18n/routing";

interface LanguageEntry {
  code: string;
  name: string;
  count: number;
  percentage: number;
}

interface LanguageDistributionResponse {
  totalUsers: number;
  languages: LanguageEntry[];
}

interface DrillDownUser {
  userName: string;
  userEmail: string;
  createdAt: string | null;
  lastLogin: string | null;
}

interface DrillDownResponse {
  drillDownLanguage: string;
  users: DrillDownUser[];
}

const LANGUAGE_COLORS = [
  "bg-blue-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-purple-500",
  "bg-rose-500",
  "bg-cyan-500",
  "bg-indigo-500",
];

function getFlag(code: string): string {
  return LOCALES.find((l) => l.code === code)?.flag || "🌐";
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}

export function LanguageAnalyticsSection() {
  const t = useTranslations("admin.settings.languageDistribution");
  const tc = useTranslations("common");
  const [data, setData] = useState<LanguageDistributionResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [drillDown, setDrillDown] = useState<DrillDownResponse | null>(null);
  const [drillDownLoading, setDrillDownLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/language-distribution");
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleDrillDown = async (language: string) => {
    setDrillDownLoading(true);
    setDrillDown(null);
    try {
      const params = new URLSearchParams({ language });
      const res = await fetch(`/api/admin/language-distribution?${params}`);
      if (res.ok) {
        const json = await res.json();
        setDrillDown(json);
      }
    } catch {
      // ignore
    } finally {
      setDrillDownLoading(false);
    }
  };

  const handleClearDrillDown = () => {
    setDrillDown(null);
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <Skeleton className="h-7 w-48 rounded-lg" />
          <Skeleton className="h-4 w-64 mt-1 rounded-lg" />
        </div>
        <div className="grid grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-12 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  if (!data) return null;

  const mostPopular = data.languages[0];
  const leastPopular = data.languages[data.languages.length - 1];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">{t("title")}</h2>
          <p className="text-sm text-slate-500 mt-0.5">{t("description")}</p>
        </div>
        <Button
          size="sm"
          variant="secondary"
          onClick={fetchData}
          icon={<RefreshCw className="w-3.5 h-3.5" />}
        >
          {t("refresh")}
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="p-4">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            {t("totalUsers")}
          </p>
          <p className="text-2xl font-bold text-slate-900 mt-1">
            {data.totalUsers.toLocaleString()}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            {t("mostPopular")}
          </p>
          <p className="text-2xl font-bold text-slate-900 mt-1">
            {mostPopular
              ? `${getFlag(mostPopular.code)} ${mostPopular.name}`
              : tc("unknown")}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            {t("leastPopular")}
          </p>
          <p className="text-2xl font-bold text-slate-900 mt-1">
            {leastPopular
              ? `${getFlag(leastPopular.code)} ${leastPopular.name}`
              : tc("unknown")}
          </p>
        </Card>
      </div>

      {/* Distribution Bar */}
      {data.languages.length > 0 && (
        <Card padding="none">
          <div className="px-6 py-4 border-b border-slate-100">
            <CardHeader
              title={t("distribution")}
              description={t("distributionDescription")}
              icon={<Info className="w-4 h-4" />}
            />
          </div>
          <div className="px-6 py-4">
            <div className="flex h-8 rounded-full overflow-hidden bg-slate-100">
              {data.languages.map((l, i) => (
                <button
                  key={l.code}
                  className={cn(
                    "h-full transition-opacity hover:opacity-80 cursor-pointer",
                    LANGUAGE_COLORS[i % LANGUAGE_COLORS.length],
                  )}
                  style={{ width: `${Math.max(l.percentage, 0.5)}%` }}
                  title={`${l.name}: ${l.count} (${l.percentage}%)`}
                  onClick={() => handleDrillDown(l.code)}
                />
              ))}
            </div>
            <div className="flex flex-wrap gap-3 mt-3">
              {data.languages.map((l, i) => (
                <button
                  key={l.code}
                  className="flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-900"
                  onClick={() => handleDrillDown(l.code)}
                >
                  <span
                    className={cn(
                      "w-2.5 h-2.5 rounded-full shrink-0",
                      LANGUAGE_COLORS[i % LANGUAGE_COLORS.length],
                    )}
                  />
                  <span>{getFlag(l.code)}</span>
                  <span className="font-medium">{l.name}</span>
                  <span className="text-slate-400">({l.percentage}%)</span>
                </button>
              ))}
            </div>
          </div>
        </Card>
      )}

      {/* Language Table */}
      <Card padding="none">
        <div className="px-6 py-4 border-b border-slate-100">
          <CardHeader
            title={t("languageBreakdown")}
            description={t("languageBreakdownDescription")}
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider px-6 py-3">
                  {t("language")}
                </th>
                <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider px-6 py-3">
                  {t("users")}
                </th>
                <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider px-6 py-3">
                  {t("percentage")}
                </th>
                <th className="text-right text-xs font-semibold text-slate-400 uppercase tracking-wider px-6 py-3">
                  {t("actions")}
                </th>
              </tr>
            </thead>
            <tbody>
              {data.languages.map((l) => (
                <tr
                  key={l.code}
                  className="border-b border-slate-50 last:border-0 hover:bg-slate-50 transition-colors"
                >
                  <td className="px-6 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-base">{getFlag(l.code)}</span>
                      <span className="text-sm font-semibold text-slate-900">
                        {l.name}
                      </span>
                      <Badge variant="default" className="text-[10px]">
                        {l.code}
                      </Badge>
                    </div>
                  </td>
                  <td className="px-6 py-3">
                    <span className="text-sm text-slate-700">
                      {l.count.toLocaleString()}
                    </span>
                  </td>
                  <td className="px-6 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-500 rounded-full"
                          style={{ width: `${Math.max(l.percentage, 0.5)}%` }}
                        />
                      </div>
                      <span className="text-xs text-slate-500">{l.percentage}%</span>
                    </div>
                  </td>
                  <td className="px-6 py-3 text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDrillDown(l.code)}
                    >
                      {t("viewUsers")}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Drill-Down Modal */}
      {drillDown && (
        <Card padding="none">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                {t("drillDownTitle", {
                  language:
                    LOCALES.find((l) => l.code === drillDown.drillDownLanguage)
                      ?.name || drillDown.drillDownLanguage,
                })}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                {t("drillDownCount", { count: drillDown.users.length })}
              </p>
            </div>
            <Button size="sm" variant="ghost" onClick={handleClearDrillDown}>
              {tc("close")}
            </Button>
          </div>
          {drillDownLoading ? (
            <div className="p-6">
              <Skeleton className="h-48 rounded-xl" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider px-6 py-3">
                      {t("user")}
                    </th>
                    <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider px-6 py-3">
                      {t("email")}
                    </th>
                    <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider px-6 py-3">
                      Joined
                    </th>
                    <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider px-6 py-3">
                      Last Login
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {drillDown.users.map((u, i) => (
                    <tr
                      key={`${u.userEmail}-${i}`}
                      className="border-b border-slate-50 last:border-0 hover:bg-slate-50 transition-colors"
                    >
                      <td className="px-6 py-3 text-sm text-slate-900 font-medium">
                        {u.userName}
                      </td>
                      <td className="px-6 py-3 text-sm text-slate-600">
                        {u.userEmail}
                      </td>
                      <td className="px-6 py-3 text-xs text-slate-500">
                        {formatDate(u.createdAt)}
                      </td>
                      <td className="px-6 py-3 text-xs text-slate-500">
                        {formatDate(u.lastLogin)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
