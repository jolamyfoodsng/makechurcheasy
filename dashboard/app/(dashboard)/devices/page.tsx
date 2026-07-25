"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Monitor,
  Laptop,
  Smartphone,
  Plus,
  Trash2,
  Copy,
  Check,
  Clock,
  Link,
  Loader2,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Wifi,
  WifiOff,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/contexts/AuthContext";
import { usePairingCode } from "@/lib/usePairingCode";
import {
  getDevices,
  deleteDevice,
  getSecuritySessions,
  type Device,
  type SecuritySession,
} from "@/lib/api";
import { Badge } from "@/components/ui/Badge";

type Translator = ReturnType<typeof useTranslations>;

function detectDeviceIcon(platform: string) {
  const lower = (platform || "").toLowerCase();
  if (lower.includes("mac")) return "laptop";
  if (lower.includes("windows") || lower.includes("win")) return "desktop";
  if (lower.includes("linux")) return "desktop";
  if (lower.includes("android") || lower.includes("ios")) return "phone";
  return "desktop";
}

function DeviceIcon({ type, className }: { type: string; className?: string }) {
  switch (type) {
    case "laptop":
      return <Laptop className={className} />;
    case "phone":
      return <Smartphone className={className} />;
    default:
      return <Monitor className={className} />;
  }
}

function timeAgo(date: Date, t: Translator): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return t("devices.activeJustNow");
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return t("devices.minutesAgo", { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t("devices.hoursAgo", { count: hours });
  const days = Math.floor(hours / 24);
  return t("devices.daysAgo", { count: days });
}

function formatDate(dateStr: string, t: Translator): string {
  try {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return t("common.unknown");
  }
}

export default function DevicesPage() {
  const t = useTranslations();
  const { mongoUser } = useAuth();
  const router = useRouter();
  const userId = mongoUser?._id || "";

  const [devices, setDevices] = useState<Device[]>([]);
  const [sessions, setSessions] = useState<SecuritySession[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showPairingSuccess, setShowPairingSuccess] = useState(false);

  const pairing = usePairingCode({
    onPaired: () => {
      setShowPairingSuccess(true);
      setTimeout(() => setShowPairingSuccess(false), 4000);
      fetchData();
    },
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [devicesData, sessionsData] = await Promise.all([
        getDevices(),
        userId ? getSecuritySessions(userId) : Promise.resolve([]),
      ]);
      setDevices(devicesData);
      setSessions(sessionsData);
    } catch {
      setDevices([]);
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleDelete = async (deviceId: string) => {
    setDeleting(deviceId);
    try {
      await deleteDevice(deviceId);
      setDevices((prev) => prev.filter((d) => d.id !== deviceId));
    } catch {
      // keep current state
    } finally {
      setDeleting(null);
    }
  };

  const copyCode = () => {
    if (pairing.code) {
      navigator.clipboard.writeText(pairing.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Group sessions into active (last 24h) and history
  const now = Date.now();
  const activeSessions = sessions.filter(
    (s) => now - new Date(s.lastActive).getTime() < 24 * 60 * 60 * 1000
  );
  const historySessions = sessions.filter(
    (s) => now - new Date(s.lastActive).getTime() >= 24 * 60 * 60 * 1000
  );

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto w-full pb-16">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-blue-50 text-blue-600 rounded-xl shrink-0">
            <Monitor className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-slate-900 tracking-tight">
              {t("devices.title")}
            </h1>
            <p className="text-slate-500 mt-1 text-sm md:text-base">
              {t("devices.pageDescription")}
            </p>
          </div>
        </div>
        <button
          onClick={pairing.generate}
          disabled={pairing.generating || pairing.isActive}
          className="h-11 px-6 rounded-xl bg-blue-700 text-sm font-semibold text-white transition-colors hover:bg-blue-800 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {pairing.generating ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Plus className="w-4 h-4" />
          )}
          {t("devices.generatePairingCode")}
        </button>
      </div>

      {/* Pairing Success */}
      {showPairingSuccess && (
        <div className="mb-6 p-4 rounded-xl bg-green-50 border border-green-200 flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0" />
          <p className="text-sm font-medium text-green-800">
            {t("devices.devicePairedSuccess")}
          </p>
        </div>
      )}

      {/* Pairing Code Card */}
      {pairing.isActive && (
        <div className="mb-6 p-6 rounded-2xl border border-amber-200 bg-amber-50/50">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center">
                <Link className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-amber-900">
                  {t("devices.pairingCodeActive")}
                </h3>
                <p className="text-xs text-amber-700">
                  {t("devices.enterCodeInApp")}
                </p>
              </div>
            </div>
            <Badge variant="warning" size="sm" dot>
              {pairing.countdown}
            </Badge>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex-1 p-4 bg-white rounded-xl border border-amber-200 text-center">
              <p className="font-mono text-2xl font-bold tracking-[0.3em] text-slate-900">
                {pairing.code}
              </p>
            </div>
            <button
              onClick={copyCode}
              className="h-12 px-4 rounded-xl border border-amber-200 bg-white text-amber-700 hover:bg-amber-100 transition-colors flex items-center gap-2"
            >
              {copied ? (
                <Check className="w-4 h-4 text-green-600" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
              <span className="text-sm font-medium">
                {copied ? t("devices.copied") : t("devices.copy")}
              </span>
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20">
          <Loader2 className="w-8 h-8 text-blue-600 animate-spin mb-4" />
          <p className="text-sm text-slate-500">{t("devices.loadingDevices")}</p>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Active Devices */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Wifi className="w-5 h-5 text-green-600" />
                {t("devices.activeDevices")}
                <span className="text-sm font-normal text-slate-500">
                  ({devices.length})
                </span>
              </h2>
              <button
                onClick={fetchData}
                className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                {t("devices.refresh")}
              </button>
            </div>

            {devices.length === 0 ? (
              <div className="p-8 bg-white rounded-2xl border border-slate-200 text-center">
                <Monitor className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <p className="text-sm font-medium text-slate-900 mb-1">
                  {t("devices.noDevicesConnected")}
                </p>
                <p className="text-xs text-slate-500">
                  {t("devices.noDevicesConnectedDescription")}
                </p>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                {devices.map((device, i) => {
                  const deviceType = detectDeviceIcon(device.deviceName);
                  const isActive =
                    now - new Date(device.lastSeen).getTime() <
                    5 * 60 * 1000;
                  return (
                    <div
                      key={device.id || i}
                      className={`flex items-center gap-4 p-4 hover:bg-slate-50 transition-colors ${i < devices.length - 1 ? "border-b border-slate-100" : ""
                        }`}
                    >
                      <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center shrink-0">
                        <DeviceIcon
                          type={deviceType}
                          className="w-5 h-5 text-slate-600"
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-slate-900 truncate">
                            {device.deviceName || t("devices.unknownDevice")}
                          </p>
                          <Badge
                            variant={isActive ? "success" : "default"}
                            size="sm"
                            dot
                          >
                            {isActive ? t("devices.online") : t("devices.offline")}
                          </Badge>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {t("devices.lastSeenPrefix", { time: timeAgo(new Date(device.lastSeen), t) })}
                        </p>
                      </div>
                      <button
                        onClick={() => handleDelete(device.id)}
                        disabled={deleting === device.id}
                        className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                        title={t("devices.removeDeviceConfirm")}
                      >
                        {deleting === device.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Connection History */}
          {sessions.length > 0 && (
            <div>
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2 mb-4">
                <Clock className="w-5 h-5 text-slate-400" />
                {t("devices.connectionHistory")}
              </h2>

              {/* Active in last 24h */}
              {activeSessions.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
                    {t("devices.activeToday")}
                  </h3>
                  <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                    {activeSessions.map((s, i) => (
                      <div
                        key={s._id || s.sessionId || i}
                        className={`flex items-center gap-4 p-4 ${i < activeSessions.length - 1
                          ? "border-b border-slate-100"
                          : ""
                          }`}
                      >
                        <div
                          className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${s.isCurrent
                            ? "bg-green-50 text-green-600"
                            : "bg-slate-50 text-slate-500"
                            }`}
                        >
                          <DeviceIcon
                            type={detectDeviceIcon(s.devicePlatform)}
                            className="w-5 h-5"
                          />
                          {s.isCurrent && (
                            <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-green-500 border-2 border-white rounded-full" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-slate-900 truncate">
                              {s.deviceName || t("devices.unknownDevice")}
                            </p>
                            {s.isCurrent && (
                              <Badge variant="success" size="sm">
                                {t("devices.currentDevice")}
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-slate-500 mt-0.5 truncate">
                            {s.deviceOs} {s.browser ? `• ${s.browser}` : ""} •{" "}
                            {s.location || s.ipAddress}
                          </p>
                        </div>
                        <p className="text-xs text-slate-500 shrink-0">
                          {timeAgo(new Date(s.lastActive), t)}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Older history */}
              {historySessions.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
                    {t("devices.older")}
                  </h3>
                  <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                    {historySessions.slice(0, 10).map((s, i) => (
                      <div
                        key={s._id || s.sessionId || i}
                        className={`flex items-center gap-4 p-4 ${i < Math.min(historySessions.length, 10) - 1
                          ? "border-b border-slate-100"
                          : ""
                          }`}
                      >
                        <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center shrink-0 text-slate-400">
                          <DeviceIcon
                            type={detectDeviceIcon(s.devicePlatform)}
                            className="w-5 h-5"
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-700 truncate">
                            {s.deviceName || t("devices.unknownDevice")}
                          </p>
                          <p className="text-xs text-slate-400 mt-0.5 truncate">
                            {s.deviceOs} {s.browser ? `• ${s.browser}` : ""} •{" "}
                            {s.location || s.ipAddress}
                          </p>
                        </div>
                        <p className="text-xs text-slate-400 shrink-0">
                          {formatDate(s.lastActive, t)}
                        </p>
                      </div>
                    ))}
                  </div>
                  {historySessions.length > 10 && (
                    <p className="text-xs text-slate-400 text-center mt-3">
                      {t("devices.showingOfSessions", { count: historySessions.length })}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Pairing Instructions */}
          {devices.length === 0 && !pairing.isActive && (
            <div className="p-6 bg-blue-50 rounded-2xl border border-blue-100">
              <h3 className="text-sm font-bold text-blue-900 mb-3">
                {t("devices.howToPairDevice")}
              </h3>
              <ol className="space-y-2 text-sm text-blue-800">
                <li className="flex items-start gap-2">
                  <span className="font-bold text-blue-600">1.</span>
                  {t("devices.pairStep1")}
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-bold text-blue-600">2.</span>
                  {t("devices.pairStep2")}
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-bold text-blue-600">3.</span>
                  {t("devices.pairStep3")}
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-bold text-blue-600">4.</span>
                  {t("devices.pairStep4")}
                </li>
              </ol>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
