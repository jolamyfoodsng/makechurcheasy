"use client";

import { useState, useEffect, useCallback } from "react";
import { RefreshCw, Info } from "lucide-react";
import { Card, CardHeader, Badge, Button, Skeleton } from "@/components/ui";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

interface VersionEntry {
  version: string;
  deviceCount: number;
  percentage: number;
  platforms: string[];
  isLatest: boolean;
}

interface DeviceVersionsResponse {
  latestVersion: string;
  totalDevices: number;
  latestCount: number;
  outdatedCount: number;
  versions: VersionEntry[];
}

interface DrillDownDevice {
  userName: string;
  userEmail: string;
  platform: string;
  deviceName: string;
  lastSeen: string;
}

interface DrillDownResponse {
  latestVersion: string;
  drillDownVersion: string;
  devices: DrillDownDevice[];
}

const VERSION_COLORS = [
  "bg-blue-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-purple-500",
  "bg-rose-500",
  "bg-cyan-500",
  "bg-indigo-500",
  "bg-orange-500",
  "bg-teal-500",
  "bg-pink-500",
];

function formatDate(dateStr: string): string {
  if (!dateStr) return "—";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

export function VersionAnalyticsSection() {
  const t = useTranslations("admin.settings.versionAnalytics");
  const tc = useTranslations("common");
  const [data, setData] = useState<DeviceVersionsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [drillDown, setDrillDown] = useState<DrillDownResponse | null>(null);
  const [drillDownLoading, setDrillDownLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/device-versions");
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

  const handleDrillDown = async (version: string) => {
    setDrillDownLoading(true);
    setDrillDown(null);
    try {
      const params = new URLSearchParams({ version });
      const res = await fetch(`/api/admin/device-versions?${params}`);
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
        <div className="grid grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-12 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  if (!data) return null;

  const latestPct =
    data.totalDevices > 0
      ? Math.round((data.latestCount / data.totalDevices) * 1000) / 10
      : 0;

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
      <div className="grid grid-cols-4 gap-4">
        <Card className="p-4">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            {t("latestVersion")}
          </p>
          <p className="text-2xl font-bold text-slate-900 mt-1">
            {data.latestVersion ? `v${data.latestVersion}` : tc("unknown")}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            {t("totalDevices")}
          </p>
          <p className="text-2xl font-bold text-slate-900 mt-1">
            {data.totalDevices.toLocaleString()}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            {t("adoptionRate")}
          </p>
          <p className="text-2xl font-bold text-emerald-600 mt-1">
            {data.latestVersion ? `${latestPct}%` : tc("unknown")}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            {t("outdated")}
          </p>
          <p className={cn(
            "text-2xl font-bold mt-1",
            data.outdatedCount > 0 ? "text-amber-600" : "text-emerald-600"
          )}>
            {data.outdatedCount.toLocaleString()}
          </p>
        </Card>
      </div>

      {/* Distribution Bar */}
      {data.versions.length > 0 && (
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
              {data.versions.map((v, i) => (
                <button
                  key={v.version || "unknown"}
                  className={cn(
                    "h-full transition-opacity hover:opacity-80 cursor-pointer",
                    VERSION_COLORS[i % VERSION_COLORS.length]
                  )}
                  style={{ width: `${Math.max(v.percentage, 0.5)}%` }}
                  title={`${v.version || tc("unknown")}: ${v.deviceCount} (${v.percentage}%)`}
                  onClick={() => handleDrillDown(v.version)}
                />
              ))}
            </div>
            <div className="flex flex-wrap gap-3 mt-3">
              {data.versions.map((v, i) => (
                <button
                  key={v.version || "unknown"}
                  className="flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-900"
                  onClick={() => handleDrillDown(v.version)}
                >
                  <span
                    className={cn(
                      "w-2.5 h-2.5 rounded-full shrink-0",
                      VERSION_COLORS[i % VERSION_COLORS.length]
                    )}
                  />
                  <span className="font-medium">{v.version || tc("unknown")}</span>
                  <span className="text-slate-400">({v.percentage}%)</span>
                  {v.isLatest && (
                    <Badge variant="success" className="text-[10px] px-1.5 py-0">
                      {t("latest")}
                    </Badge>
                  )}
                </button>
              ))}
            </div>
          </div>
        </Card>
      )}

      {/* Version Table */}
      <Card padding="none">
        <div className="px-6 py-4 border-b border-slate-100">
          <CardHeader
            title={t("versionBreakdown")}
            description={t("versionBreakdownDescription")}
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider px-6 py-3">
                  {t("version")}
                </th>
                <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider px-6 py-3">
                  {t("devices")}
                </th>
                <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider px-6 py-3">
                  {t("percentage")}
                </th>
                <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider px-6 py-3">
                  {t("platforms")}
                </th>
                <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider px-6 py-3">
                  {t("status")}
                </th>
                <th className="text-right text-xs font-semibold text-slate-400 uppercase tracking-wider px-6 py-3">
                  {t("actions")}
                </th>
              </tr>
            </thead>
            <tbody>
              {data.versions.map((v) => (
                <tr
                  key={v.version || "unknown"}
                  className="border-b border-slate-50 last:border-0 hover:bg-slate-50 transition-colors"
                >
                  <td className="px-6 py-3">
                    <span className="text-sm font-semibold text-slate-900">
                      {v.version ? `v${v.version}` : tc("unknown")}
                    </span>
                  </td>
                  <td className="px-6 py-3">
                    <span className="text-sm text-slate-700">
                      {v.deviceCount.toLocaleString()}
                    </span>
                  </td>
                  <td className="px-6 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-500 rounded-full"
                          style={{ width: `${Math.max(v.percentage, 0.5)}%` }}
                        />
                      </div>
                      <span className="text-xs text-slate-500">{v.percentage}%</span>
                    </div>
                  </td>
                  <td className="px-6 py-3">
                    <div className="flex gap-1">
                      {v.platforms.map((p) => (
                        <Badge key={p} variant="default" className="text-[10px]">
                          {p}
                        </Badge>
                      ))}
                    </div>
                  </td>
                  <td className="px-6 py-3">
                    {v.isLatest ? (
                      <Badge variant="success">{t("latest")}</Badge>
                    ) : v.version ? (
                      <Badge variant="warning">{t("outdated")}</Badge>
                    ) : (
                      <Badge variant="default">{tc("unknown")}</Badge>
                    )}
                  </td>
                  <td className="px-6 py-3 text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDrillDown(v.version)}
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
                {t("drillDownTitle", { version: drillDown.drillDownVersion })}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                {t("drillDownCount", { count: drillDown.devices.length })}
              </p>
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={handleClearDrillDown}
            >
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
                      {t("platform")}
                    </th>
                    <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider px-6 py-3">
                      {t("deviceName")}
                    </th>
                    <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider px-6 py-3">
                      {t("lastSeen")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {drillDown.devices.map((d, i) => (
                    <tr
                      key={`${d.userEmail}-${i}`}
                      className="border-b border-slate-50 last:border-0 hover:bg-slate-50 transition-colors"
                    >
                      <td className="px-6 py-3 text-sm text-slate-900 font-medium">
                        {d.userName}
                      </td>
                      <td className="px-6 py-3 text-sm text-slate-600">
                        {d.userEmail}
                      </td>
                      <td className="px-6 py-3">
                        <Badge variant="default" className="text-[10px]">
                          {d.platform}
                        </Badge>
                      </td>
                      <td className="px-6 py-3 text-sm text-slate-600">
                        {d.deviceName}
                      </td>
                      <td className="px-6 py-3 text-xs text-slate-500">
                        {formatDate(d.lastSeen)}
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
