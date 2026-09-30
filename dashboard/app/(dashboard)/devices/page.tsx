"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Monitor,
  Laptop,
  Smartphone,
  Plus,
  Trash2,
  Copy,
  Check,
  Clock,
  Loader2,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Wifi,
  Download,
  Shield,
  HelpCircle,
  ExternalLink,
  Radio,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/contexts/AuthContext";
import { useSubscription } from "@/lib/useSubscription";
import { usePairingCode } from "@/lib/usePairingCode";
import {
  getDevices,
  deleteDevice,
  getSecuritySessions,
  formatPairingCodeForDisplay,
  type Device,
  type SecuritySession,
} from "@/lib/api";
import { Card, Button, Badge, ConfirmDialog } from "@/components/ui";

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
  if (seconds < 60) return t("devices.activeJustNow") || "Active just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return t("devices.minutesAgo", { count: minutes }) || `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t("devices.hoursAgo", { count: hours }) || `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return t("devices.daysAgo", { count: days }) || `${days}d ago`;
}

function formatDate(dateStr: string, t: Translator): string {
  try {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return t("common.unknown") || "Unknown";
  }
}

export default function DevicesPage() {
  const t = useTranslations();
  const { mongoUser } = useAuth();
  const { planLabel, planTier, isUnlimited } = useSubscription();
  const userId = mongoUser?._id || "";

  const [devices, setDevices] = useState<Device[]>([]);
  const [sessions, setSessions] = useState<SecuritySession[]>([]);
  const [loading, setLoading] = useState(true);
  const [deviceToDelete, setDeviceToDelete] = useState<Device | null>(null);
  const [deleting, setDeleting] = useState(false);
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

  const confirmDelete = async () => {
    if (!deviceToDelete) return;
    setDeleting(true);
    try {
      await deleteDevice(deviceToDelete.id);
      setDevices((prev) => prev.filter((d) => d.id !== deviceToDelete.id));
    } catch {
      // keep current state
    } finally {
      setDeleting(false);
      setDeviceToDelete(null);
    }
  };

  const copyCode = () => {
    if (pairing.code) {
      navigator.clipboard.writeText(pairing.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const deviceLimit = planTier?.entitlements?.devices ?? 1;
  const isDeviceUnlimited = deviceLimit === -1 || isUnlimited;
  const now = Date.now();

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto w-full space-y-8 pb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 bg-blue-50 border border-blue-100 text-blue-600 rounded-2xl flex items-center justify-center shrink-0 shadow-xs">
            <Monitor className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
                {t("devices.title") || "Devices & Displays"}
              </h1>
              <Badge variant={isDeviceUnlimited ? "purple" : devices.length >= deviceLimit ? "warning" : "info"} size="sm">
                {isDeviceUnlimited ? "Unlimited Devices" : `${devices.length} of ${deviceLimit} Paired`}
              </Badge>
            </div>
            <p className="text-slate-500 text-xs sm:text-sm mt-0.5">
              {t("devices.pageDescription") || "Manage computers running MakeChurchEasy Studio and remote stage controllers."}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <Button
            variant="secondary"
            size="sm"
            onClick={fetchData}
            icon={<RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />}
          >
            {t("devices.refresh") || "Refresh"}
          </Button>
          <Button
            size="sm"
            onClick={pairing.generate}
            disabled={pairing.generating || pairing.isActive}
            loading={pairing.generating}
            icon={<Plus className="w-4 h-4" />}
          >
            {pairing.isActive ? "Pairing Active" : t("devices.generatePairingCode") || "Pair New Device"}
          </Button>
        </div>
      </div>

      {/* Pairing Success Alert */}
      {showPairingSuccess && (
        <div className="p-4 rounded-2xl bg-green-50 border border-green-200 flex items-center gap-3 animate-in fade-in slide-in-from-top-2 duration-300">
          <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0" />
          <div>
            <p className="text-sm font-bold text-green-900">
              {t("devices.devicePairedSuccess") || "Device Paired Successfully!"}
            </p>
            <p className="text-xs text-green-700 mt-0.5">
              Your presentation library, offline Bibles, and sermon AI credentials have synced to the device.
            </p>
          </div>
        </div>
      )}

      {pairing.error && (
        <div className="p-4 rounded-2xl bg-red-50 border border-red-200 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
          <p className="text-sm font-medium text-red-800">{pairing.error}</p>
        </div>
      )}

      {/* Active 6-Digit Pairing Card */}
      {pairing.isActive && (
        <div className="p-6 sm:p-8 rounded-2xl border-2 border-blue-500/30 bg-gradient-to-br from-blue-50/70 via-indigo-50/40 to-white shadow-md relative overflow-hidden">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-2 max-w-xl">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-600 animate-ping" />
                <span className="text-xs font-bold uppercase tracking-wider text-blue-700">
                  {t("devices.pairingCodeActive") || "Pairing Code Ready"}
                </span>
                <Badge variant="warning" size="sm" dot>
                  {pairing.countdown}
                </Badge>
              </div>
              <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">
                Pair MakeChurchEasy Studio in 30 Seconds
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 text-xs text-slate-600">
                <div className="flex items-start gap-2 bg-white/70 p-2.5 rounded-xl border border-blue-100">
                  <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center shrink-0 text-[11px]">1</span>
                  <span>Open MakeChurchEasy Studio on your computer</span>
                </div>
                <div className="flex items-start gap-2 bg-white/70 p-2.5 rounded-xl border border-blue-100">
                  <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center shrink-0 text-[11px]">2</span>
                  <span>Click <strong>Remote Sync</strong> in the top header</span>
                </div>
                <div className="flex items-start gap-2 bg-white/70 p-2.5 rounded-xl border border-blue-100">
                  <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center shrink-0 text-[11px]">3</span>
                  <span>Enter the 6-digit code shown here</span>
                </div>
              </div>
            </div>

            {/* Code Box */}
            <div className="flex flex-col items-center gap-2.5 shrink-0 bg-white p-5 rounded-2xl border border-blue-200 shadow-sm min-w-[240px]">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Pairing Code</span>
              <p className="font-mono text-3xl font-extrabold tracking-[0.3em] text-slate-900">
                {formatPairingCodeForDisplay(pairing.code)}
              </p>
              <button
                type="button"
                onClick={copyCode}
                className="w-full mt-1 h-9 px-4 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5 text-slate-500" />}
                <span>{copied ? "Copied to clipboard" : "Copy Code"}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 bg-white rounded-2xl border border-slate-200">
          <Loader2 className="w-8 h-8 text-blue-600 animate-spin mb-3" />
          <p className="text-sm font-medium text-slate-500">{t("devices.loadingDevices") || "Loading connected devices..."}</p>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Computers & Companions */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <Wifi className="w-5 h-5 text-blue-600" />
                  <span>Presentation Devices</span>
                  <span className="text-sm font-semibold text-slate-400">
                    ({devices.length})
                  </span>
                </h2>
                <p className="text-xs text-slate-500">
                  Desktops and laptops authorized to project scriptures, lyric themes, and sermon AI.
                </p>
              </div>

              {!isDeviceUnlimited && devices.length >= deviceLimit && (
                <Link
                  href="/subscription/plans"
                  className="text-xs font-semibold text-blue-600 hover:underline flex items-center gap-1"
                >
                  Need more devices? Upgrade plan →
                </Link>
              )}
            </div>

            {devices.length === 0 ? (
              <Card padding="lg" className="text-center py-14">
                <div className="w-16 h-16 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center mx-auto mb-4 text-blue-600">
                  <Monitor className="w-8 h-8" />
                </div>
                <h3 className="text-base font-bold text-slate-900 mb-1">
                  {t("devices.noDevicesConnected") || "No Presentation Devices Paired Yet"}
                </h3>
                <p className="text-xs sm:text-sm text-slate-500 max-w-md mx-auto mb-6 leading-relaxed">
                  {t("devices.noDevicesConnectedDescription") ||
                    "Pair MakeChurchEasy Studio on your laptop to unlock automated OBS sync, unlimited offline Bibles, and sermon speech-to-scripture."}
                </p>
                <div className="flex flex-wrap items-center justify-center gap-3">
                  <Button
                    size="sm"
                    onClick={pairing.generate}
                    disabled={pairing.generating || pairing.isActive}
                    icon={<Plus className="w-4 h-4" />}
                  >
                    Generate Pairing Code
                  </Button>
                  <Link href="/downloads">
                    <Button variant="secondary" size="sm" icon={<Download className="w-4 h-4" />}>
                      Download Studio for Mac / Windows
                    </Button>
                  </Link>
                </div>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {devices.map((device) => {
                  const deviceType = detectDeviceIcon(device.deviceName);
                  const isOnline = now - new Date(device.lastSeen).getTime() < 5 * 60 * 1000;

                  return (
                    <Card key={device.id} padding="md" className="flex flex-col justify-between hover:border-slate-300 transition-all shadow-xs">
                      <div>
                        <div className="flex items-start justify-between gap-3 mb-3">
                          <div className="flex items-center gap-3">
                            <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 border ${
                              isOnline ? "bg-emerald-50 border-emerald-100 text-emerald-600" : "bg-slate-50 border-slate-200 text-slate-500"
                            }`}>
                              <DeviceIcon type={deviceType} className="w-5 h-5" />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <h3 className="text-sm font-bold text-slate-900 truncate max-w-[180px] sm:max-w-[220px]">
                                  {device.deviceName || t("devices.unknownDevice") || "Device"}
                                </h3>
                              </div>
                              <p className="text-xs text-slate-500">
                                {t("devices.lastSeenPrefix", { time: timeAgo(new Date(device.lastSeen), t) })}
                              </p>
                            </div>
                          </div>

                          <Badge variant={isOnline ? "success" : "default"} size="sm" dot>
                            {isOnline ? t("devices.online") || "Online" : t("devices.offline") || "Offline"}
                          </Badge>
                        </div>

                        <div className="bg-slate-50 rounded-xl p-3 text-xs text-slate-600 space-y-1 mb-4">
                          <div className="flex items-center justify-between">
                            <span className="text-slate-400">Node Type</span>
                            <span className="font-medium text-slate-800">MakeChurchEasy Studio</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-slate-400">Paired</span>
                            <span className="font-medium text-slate-800">{formatDate(device.createdAt, t)}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                        <span className="text-[11px] text-slate-400 font-mono">
                          ID: {device.id.slice(0, 8)}...
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeviceToDelete(device)}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50 text-xs"
                          icon={<Trash2 className="w-3.5 h-3.5 text-red-500" />}
                        >
                          Unpair Device
                        </Button>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </section>

          {/* Web Dashboard Sessions — distinct secondary section */}
          {sessions.length > 0 && (
            <section className="pt-4 border-t border-slate-200">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <Shield className="w-4 h-4 text-slate-500" />
                    <span>Web Dashboard Logins</span>
                  </h2>
                  <p className="text-xs text-slate-500">
                    Browsers currently signed into your online account portal.
                  </p>
                </div>
                <Link
                  href="/security"
                  className="text-xs font-semibold text-blue-600 hover:underline flex items-center gap-1"
                >
                  Manage Security & 2FA →
                </Link>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden divide-y divide-slate-100">
                {sessions.slice(0, 5).map((s, i) => (
                  <div key={s._id || s.sessionId || i} className="flex items-center justify-between p-4 hover:bg-slate-50/70 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500 shrink-0">
                        <DeviceIcon type={detectDeviceIcon(s.devicePlatform)} className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-900">
                            {s.browser || "Web Browser"} on {s.deviceOs || "Desktop"}
                          </span>
                          {s.isCurrent && (
                            <Badge variant="success" size="sm">This Browser</Badge>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          {s.location || s.ipAddress || "Active session"} · {timeAgo(new Date(s.lastActive), t)}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {/* Confirmation Dialog for Unpairing */}
      <ConfirmDialog
        open={!!deviceToDelete}
        title="Unpair Device?"
        description={`Are you sure you want to disconnect "${deviceToDelete?.deviceName || "this device"}"? It will lose access to offline Bible synchronization and sermon AI until paired again.`}
        confirmLabel="Unpair Device"
        cancelLabel="Keep Device"
        destructive
        loading={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setDeviceToDelete(null)}
      />
    </div>
  );
}
