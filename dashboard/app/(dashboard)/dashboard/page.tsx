"use client";

import {
  getCreditTransactions,
  getDevices,
  getSecuritySessions,
  type CreditTransaction,
  type Device,
  type SecuritySession,
} from "@/lib/api";
import { usePairingCode } from "@/lib/usePairingCode";
import { getUserId } from "@/lib/userId";
import { useSubscription } from "@/lib/useSubscription";
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Brain,
  Check,
  CheckCircle,
  CheckCircle2,
  ChevronRight,
  Circle,
  Clock,
  Copy,
  CreditCard,
  Download,
  History,
  Landmark,
  Languages,
  Lightbulb,
  Link,
  Loader2,
  Map,
  MessageCircle,
  Mic,
  Monitor,
  MonitorPlay,
  Palette,
  PartyPopper,
  PlayCircle,
  Plus,
  QrCode,
  Shield,
  X,
  Zap
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { Card, CardHeader, Badge, Button, EmptyState } from "@/components/ui";

function timeAgo(date: Date, t: ReturnType<typeof useTranslations>): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return t("common.justNow");
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return t("common.minutesAgo", { n: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t("common.hoursAgo", { n: hours });
  const days = Math.floor(hours / 24);
  return t("common.daysAgo", { n: days });
}

export default function Overview() {
  const t = useTranslations();
  const router = useRouter();
  const userId = getUserId();

  const {
    plan,
    planTier,
    planConfig,
    subscription,
    user,
    mongoUser,
    maxCredits,
    isUnlimited,
    isOnTrial,
    trialDaysLeft,
    trialEndsAt,
    trialStartedAt,
    trialDurationDays,
    isAmbassador,
    ambassadorExpiresAt,
    ambassadorDaysLeft,
    loading: subLoading,
  } = useSubscription();

  const [sessions, setSessions] = useState<SecuritySession[]>([]);
  const [recentTx, setRecentTx] = useState<CreditTransaction[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [showToast, setShowToast] = useState(false);

  const handlePaired = useCallback(() => {
    setShowToast(true);
    if (userId) {
      getSecuritySessions(userId).then(setSessions).catch(() => { });
      getDevices().then(setDevices).catch(() => { });
    }
    setTimeout(() => setShowToast(false), 4000);
  }, [userId]);

  const pairing = usePairingCode({ onPaired: handlePaired });

  const trialFeatures = [
    { icon: Mic, label: t("dashboard.trialFeatureSpeechToScripture"), desc: t("dashboard.trialFeatureSpeechToScriptureDesc") },
    { icon: Languages, label: t("dashboard.trialFeatureLiveTranslation"), desc: t("dashboard.trialFeatureLiveTranslationDesc") },
    { icon: Brain, label: t("dashboard.trialFeatureAISummaries"), desc: t("dashboard.trialFeatureAISummariesDesc") },
    { icon: MonitorPlay, label: t("dashboard.trialFeatureOBSIntegration"), desc: t("dashboard.trialFeatureOBSIntegrationDesc") },
    { icon: Palette, label: t("dashboard.trialFeaturePremiumThemes"), desc: t("dashboard.trialFeaturePremiumThemesDesc") },
    { icon: BookOpen, label: t("dashboard.trialFeatureSongLibrary"), desc: t("dashboard.trialFeatureSongLibraryDesc") },
  ];

  useEffect(() => {
    if (!userId) { setLoading(false); return; }
    Promise.all([
      getSecuritySessions(userId),
      getCreditTransactions(userId, { limit: 4 }),
      getDevices(),
    ])
      .then(([sess, tx, devs]) => {
        setSessions(sess);
        setRecentTx(tx.transactions);
        setDevices(devs);
      })
      .catch(() => { })
      .finally(() => setLoading(false));
  }, [userId]);

  // Use mongoUser.credits (dynamically calculated from plan + transactions)
  // instead of user.credits (legacy raw field on the MongoDB document)
  const credits = mongoUser?.credits ?? 0;
  const CREDIT_LIMIT = mongoUser?.totalAvailable ?? maxCredits;
  const isCreditUnlimited = CREDIT_LIMIT === -1;
  const creditPct = isCreditUnlimited ? 0 : CREDIT_LIMIT > 0 ? Math.round(((CREDIT_LIMIT - credits) / CREDIT_LIMIT) * 100) : 0;

  const totalDevices = devices.length;
  const rawDeviceLimit = Number(planTier?.entitlements?.devices ?? 1);
  const deviceLimit = rawDeviceLimit === -1 ? Infinity : rawDeviceLimit;
  const isDeviceUnlimited = deviceLimit === Infinity;
  const deviceUsagePct = isDeviceUnlimited ? 0 : deviceLimit > 0 ? Math.min(100, Math.round((totalDevices / deviceLimit) * 100)) : 100;
  const isAtDeviceLimit = !isDeviceUnlimited && totalDevices >= deviceLimit;

  const memberSince = user?.createdAt
    ? new Date(user.createdAt).toLocaleDateString("en-US", { month: "long", year: "numeric" })
    : "";

  const trialDayLabel = trialDaysLeft === 1 ? "1 day" : `${trialDaysLeft} days`;
  const trialDuration = trialDurationDays || 14;
  const currentTrialDay = trialDuration - trialDaysLeft + 1;
  const trialEndDate = trialEndsAt
    ? trialEndsAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : "";

  const isTrialExpired = isOnTrial && trialDaysLeft <= 0;
  const isFinalDay = isOnTrial && trialDaysLeft === 1;
  const isUrgentWarning = isOnTrial && trialDaysLeft <= 3 && trialDaysLeft > 1;
  const isFeatureDiscovery = isOnTrial && trialDaysLeft > 4 && trialDaysLeft <= 10;
  const showTrialModal = isFinalDay && !localStorage.getItem("trialModalDismissed");

  const formatTime = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return t("common.justNow");
    if (mins < 60) return t("common.minutesAgo", { n: mins });
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return t("common.hoursAgo", { n: hrs });
    const days = Math.floor(hrs / 24);
    return t("common.daysAgo", { n: days });
  };

  const hasChurchProfile = !!(user?.churchName && user.churchName !== "Your Church");
  const hasPairedDevice = sessions.length > 0;
  const hasUsedCredits = recentTx.some((tx) => tx.amount < 0);
  const hasDownloadedStudio = mongoUser?.onboarding?.downloadedStudio || false;
  const activeDeviceCount = devices.length;
  const onboardingSteps = [
    { key: "account", label: t("dashboard.stepCreateAccount"), done: true, href: "/profile" },
    { key: "profile", label: t("dashboard.stepChurchProfile"), done: hasChurchProfile, href: "/church-profile" },
    { key: "download", label: t("dashboard.stepDownloadStudio"), done: mongoUser?.onboarding?.downloadedStudio || false, href: "/downloads" },
    { key: "pair", label: t("dashboard.stepPairFirstDevice"), done: hasPairedDevice, href: "/devices" },
    { key: "obs", label: t("dashboard.stepConnectOBS"), done: hasPairedDevice, href: "/devices" },
    { key: "present", label: t("dashboard.stepRunFirstPresentation"), done: hasUsedCredits, href: "/credits" },
  ];

  if (subLoading || loading) {
    return (
      <div className="p-6 md:p-8 max-w-7xl mx-auto w-full flex-1 flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto w-full space-y-6 pb-16">

      {/* Trial expiry modal */}
      {showTrialModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => {
            localStorage.setItem("trialModalDismissed", "true");
            window.location.reload();
          }} />
          <div className="relative bg-white rounded-2xl border border-slate-200 max-w-md w-full p-6 md:p-8">
            <div className="flex justify-between items-start mb-4">
              <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center">
                <Clock className="w-5 h-5 text-orange-600" />
              </div>
              <button
                onClick={() => {
                  localStorage.setItem("trialModalDismissed", "true");
                  window.location.reload();
                }}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <h3 className="text-lg font-bold text-slate-900 mb-1">{t("dashboard.trialEndsToday")}</h3>
            <p className="text-sm text-slate-700 mb-4">{t("dashboard.upgradeNowDescription")}</p>
            <div className="space-y-2 mb-6">
              {[
                { icon: Languages, label: t("dashboard.trialFeatureLiveTranslation") },
                { icon: Mic, label: t("dashboard.trialFeatureSpeechToScripture") },
                { icon: Brain, label: t("dashboard.trialFeatureAISummaries") },
              ].map(({ icon: Icon, label }) => (
                <li key={label} className="flex items-center gap-2 text-sm text-slate-700 list-none">
                  <Check className="w-4 h-4 text-green-500" />
                  {label}
                </li>
              ))}
            </div>
            <div className="flex gap-3">
              <Button onClick={() => router.push("/subscription")} className="flex-1">
                {t("dashboard.upgradeNow")}
              </Button>
              <Button variant="secondary" onClick={() => {
                localStorage.setItem("trialModalDismissed", "true");
                window.location.reload();
              }}>
                {t("dashboard.continueTrial")}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Success toast */}
      {showToast && (
        <div className="fixed top-4 right-4 z-50">
          <div className="flex items-center gap-3 bg-green-600 text-white px-4 py-3 rounded-xl">
            <PartyPopper className="w-4 h-4 shrink-0" />
            <span className="text-sm font-semibold">{t("dashboard.deviceConnected")}</span>
          </div>
        </div>
      )}

      {/* Welcome header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">
            {t("dashboard.welcomeBack")}, {user?.name || t("common.user")}
          </h2>
          <p className="text-sm text-slate-500 mt-1">{user?.churchName || t("dashboard.yourChurch")} · {memberSince && `${t("dashboard.memberSince")} ${memberSince}`}</p>
        </div>
        <div className="flex items-center gap-2">
          {isAmbassador && (
            <Badge variant="info" dot>
              <Shield className="w-3 h-3 mr-1 inline" />
              {t("dashboard.ambassadorBadge", { days: ambassadorDaysLeft })}
            </Badge>
          )}
          {isOnTrial && (
            <Badge variant="warning" dot>{trialDayLabel} {t("dashboard.trialLeft")}</Badge>
          )}
          {planTier?.label && !isOnTrial && !isAmbassador && (
            <Badge variant="info" dot>{planTier.label}</Badge>
          )}
          <Badge variant="default">{sessions.length} device{sessions.length !== 1 ? "s" : ""}</Badge>
        </div>
      </div>

      {/* State-driven pairing hero */}
      {!hasDownloadedStudio ? (
        /* State A: Download Studio */
        <Card padding="lg">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center shrink-0">
                <Download className="w-5 h-5 text-indigo-700" />
              </div>
              <h3 className="text-sm font-semibold text-slate-900">
                {t("dashboard.installStudio")}
              </h3>
              <p className="text-sm text-slate-500">
                {t("dashboard.installStudioDesc")}
              </p>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => router.push("/downloads")}>
                {t("dashboard.downloadStudio")}
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
              <a target="_blank" href="https://www.youtube.com/watch?v=NmneQhxY2jQ&t=2s">
                <Button variant="secondary">{t("dashboard.watchDemo")}</Button>
              </a>
            </div>
          </div>
        </Card>
      ) : activeDeviceCount === 0 ? (
        /* State B: Connect First Device */
        <Card padding="lg">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center shrink-0">
                <Monitor className="w-5 h-5 text-blue-700" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-900">{t("dashboard.connectFirstDevice")}</h3>
                {pairing.isActive ? (
                  <div className="flex items-center gap-3 mt-2">
                    <div className="inline-flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2">
                      <span className="font-mono text-lg font-bold tracking-[0.15em] text-slate-900">{pairing.code}</span>
                      <button
                        onClick={pairing.copyCode}
                        className="p-1 rounded hover:bg-slate-200 transition-colors text-slate-400 hover:text-slate-600"
                        title={t("dashboard.copyCode")}
                      >
                        {pairing.copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                      </button>
                    </div>
                    <span className="text-xs text-slate-500">{t("dashboard.expiresIn")} <span className="font-semibold text-slate-700">{pairing.countdown}</span></span>
                  </div>
                ) : (
                  <p className="text-sm text-slate-500 mt-0.5">{t("dashboard.generateCodeDesc")}</p>
                )}
              </div>
            </div>
            <Button
              onClick={pairing.generate}
              disabled={pairing.generating || pairing.isActive}
              icon={pairing.generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <QrCode className="w-4 h-4" />}
            >
              {pairing.generating ? t("dashboard.generating") : pairing.isActive ? `${t("dashboard.expiresIn")} ${pairing.countdown}` : t("dashboard.generatePairingCode")}
            </Button>
          </div>
        </Card>
      ) : (
        /* State C: Connect Another Device */
        <Card padding="lg">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center shrink-0">
                  <Monitor className="w-5 h-5 text-blue-700" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">{t("dashboard.connectAnotherDevice")}</h3>
                  <p className="text-sm text-slate-500">{t("dashboard.devicesConnected", { count: activeDeviceCount })}</p>
                </div>
              </div>
              <Button
                onClick={pairing.generate}
                disabled={pairing.generating || pairing.isActive}
                icon={pairing.generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              >
                {pairing.generating ? t("dashboard.generating") : pairing.isActive ? `${t("dashboard.expiresIn")} ${pairing.countdown}` : t("dashboard.generateNewPairingCode")}
              </Button>
            </div>
            {pairing.isActive && (
              <div className="flex items-center gap-3 ml-14">
                <div className="inline-flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2">
                  <span className="font-mono text-lg font-bold tracking-[0.15em] text-slate-900">{pairing.code}</span>
                  <button
                    onClick={pairing.copyCode}
                    className="p-1 rounded hover:bg-slate-200 transition-colors text-slate-400 hover:text-slate-600"
                    title={t("dashboard.copyCode")}
                  >
                    {pairing.copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
                <span className="text-xs text-slate-500">{t("dashboard.expiresIn")} <span className="font-semibold text-slate-700">{pairing.countdown}</span></span>
              </div>
            )}
            <div className="border-t border-slate-100 pt-3">
              <p className="text-xs text-slate-400 mb-2">{t("dashboard.activeDevices")}</p>
              <div className="flex flex-col gap-2">
                {devices.map((device) => (
                  <div key={device.deviceId} className="flex items-center justify-between py-1.5 px-3 rounded-lg bg-slate-50">
                    <div className="flex items-center gap-2">
                      <Monitor className="w-4 h-4 text-slate-400" />
                      <span className="text-sm text-slate-700">{device.deviceName}</span>
                    </div>
                    <span className="text-xs text-slate-400">
                      {device.lastSeen ? timeAgo(new Date(device.lastSeen), t) : t("common.never")}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Trial expired banner */}
      {isOnTrial && isTrialExpired && (
        <Card padding="md" className="border-amber-200 bg-amber-50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
              <div>
                <p className="text-sm font-semibold text-amber-900">{t("dashboard.trialExpired")}</p>
                <p className="text-xs text-amber-700">{t("dashboard.trialExpiredDesc")}</p>
              </div>
            </div>
            <Button size="sm" onClick={() => router.push("/subscription")}>
              {t("dashboard.upgrade")} <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </Button>
          </div>
        </Card>
      )}

      {/* Feature discovery (days 5-10) */}
      {isFeatureDiscovery && (
        <Card padding="md">
          <CardHeader
            title={t("dashboard.recommendedFeatures")}
            description={t("dashboard.recommendedFeaturesDesc")}
            icon={<Lightbulb className="w-4 h-4" />}
          />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              { icon: Mic, label: t("dashboard.trialFeatureSpeechToScripture"), desc: t("dashboard.trialFeatureSpeechToScriptureDesc"), color: "blue" },
              { icon: Languages, label: t("dashboard.trialFeatureLiveTranslation"), desc: t("dashboard.trialFeatureLiveTranslationDesc"), color: "purple" },
              { icon: Brain, label: t("dashboard.trialFeatureAISummaries"), desc: t("dashboard.trialFeatureAISummariesDesc"), color: "green" },
            ].map(({ icon: Icon, label, desc, color }) => (
              <button
                key={label}
                onClick={() => router.push("/credits")}
                className="flex items-start gap-3 p-3 rounded-xl border border-slate-200 hover:border-blue-300 hover:bg-blue-50/50 transition-colors text-left"
              >
                <div className={`w-8 h-8 bg-${color}-100 rounded-xl flex items-center justify-center shrink-0`}>
                  <Icon className={`w-4 h-4 text-${color}-600`} />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-900">{label}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{desc}</p>
                </div>
              </button>
            ))}
          </div>
        </Card>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Plan card */}
        <Card padding="md" className="flex flex-col justify-between h-[120px]">
          <div className="flex items-center gap-2 text-slate-500 text-[11px] font-semibold uppercase tracking-wider">
            {isOnTrial ? <Clock className="w-3.5 h-3.5 text-amber-500" /> : <CreditCard className="w-3.5 h-3.5 text-blue-500" />}
            {isOnTrial ? t("dashboard.trialStatus") : t("dashboard.plan")}
          </div>
          <div className="flex items-end justify-between">
            <div className="text-xl font-bold text-slate-900">
              {isAmbassador ? t("dashboard.ambassadorPlan") : isOnTrial ? t("dashboard.growthTrial") : (planTier?.label || plan)}
            </div>
            <Badge variant={isAmbassador ? "info" : isOnTrial ? "warning" : (subscription?.status === "active" ? "success" : "default")} size="sm">
              {isAmbassador
                ? t("dashboard.ambassadorDaysLeft", { days: ambassadorDaysLeft })
                : isOnTrial
                  ? trialDayLabel + " " + t("dashboard.trialLeft")
                  : (subscription?.status === "active" ? t("dashboard.active") : t("dashboard.inactive"))}
            </Badge>
          </div>
        </Card>

        {/* Credits card */}
        <Card padding="md" className="flex flex-col justify-between h-[120px]">
          <div className="flex items-center gap-2 text-slate-500 text-[11px] font-semibold uppercase tracking-wider">
            <Zap className="w-3.5 h-3.5 text-yellow-500" />
            {isOnTrial ? t("dashboard.trialCredits") : t("dashboard.aiCredits")}
          </div>
          <div>
            <div className="flex items-baseline gap-1 mb-2">
              <span className="text-2xl font-bold text-slate-900">{isCreditUnlimited ? t("dashboard.unlimited") : credits}</span>
              <span className="text-xs text-slate-400">/ {isCreditUnlimited ? t("dashboard.unlimited") : CREDIT_LIMIT}</span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-1.5">
              <div className="bg-blue-700 h-1.5 rounded-full" style={{ width: `${isCreditUnlimited ? 100 : creditPct}%` }} />
            </div>
          </div>
        </Card>

        {/* Devices card */}
        <Card padding="md" className="flex flex-col justify-between h-[120px]">
          <div className="flex items-center gap-2 text-slate-500 text-[11px] font-semibold uppercase tracking-wider">
            <Monitor className="w-3.5 h-3.5 text-blue-500" /> {t("dashboard.devicesLabel")}
          </div>
          <div>
            <div className="flex items-baseline gap-1 mb-2">
              <span className="text-2xl font-bold text-slate-900">{totalDevices}</span>
              <span className="text-xs text-slate-400">/ {isDeviceUnlimited ? t("dashboard.unlimited") : deviceLimit}</span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-1.5">
              <div
                className={`h-1.5 rounded-full ${isAtDeviceLimit ? "bg-red-500" : deviceUsagePct > 70 ? "bg-amber-500" : "bg-blue-700"}`}
                style={{ width: `${deviceUsagePct}%` }}
              />
            </div>
          </div>
        </Card>

        {/* Credits used card */}
        <Card padding="md" className="flex flex-col justify-between h-[120px]">
          <div className="flex items-center gap-2 text-slate-500 text-[11px] font-semibold uppercase tracking-wider">
            <Zap className="w-3.5 h-3.5 text-rose-500" /> {t("dashboard.creditsUsed")}
          </div>
          <div className="flex items-end justify-between">
            <div className="text-3xl font-bold text-slate-900">{isCreditUnlimited ? t("dashboard.unlimited") : CREDIT_LIMIT - credits}</div>
            <span className="text-[11px] text-slate-500">{t("dashboard.totalConsumed")}</span>
          </div>
        </Card>
      </div>

      {/* Trial features + after trial (trial users only) */}
      {isOnTrial && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card padding="md">
            <CardHeader title={t("dashboard.includedInTrial")} icon={<Clock className="w-4 h-4 text-amber-600" />} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {trialFeatures.map((f) => {
                const Icon = f.icon;
                return (
                  <div key={f.label} className="flex items-start gap-2.5 p-2.5 rounded-xl bg-slate-50">
                    <div className="w-7 h-7 bg-amber-100 rounded flex items-center justify-center shrink-0 mt-0.5">
                      <Icon className="w-3.5 h-3.5 text-amber-600" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-900">{f.label}</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">{f.desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          <Card padding="md">
            <CardHeader title={t("dashboard.afterTrial")} icon={<AlertTriangle className="w-4 h-4 text-slate-500" />} />
            <div className="border border-slate-200 rounded-xl p-3 mb-3">
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">{t("dashboard.freePlanWhatYouKeep")}</p>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <CheckCircle2 className="w-3.5 h-3.5 text-slate-400" /> {t("dashboard.creditsPerMonth", { count: (planConfig?.plans.free?.credits ?? 50).toLocaleString() })}
                </div>
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <CheckCircle2 className="w-3.5 h-3.5 text-slate-400" /> {t("dashboard.oneDevice")}
                </div>
              </div>
            </div>
            <div className="border border-amber-200 bg-amber-50 rounded-xl p-3">
              <p className="text-[11px] font-bold text-amber-700 uppercase tracking-wider mb-2">{t("dashboard.growthPlanWhatYouUnlock")}</p>
              <div className="space-y-1.5">
                {[t("dashboard.growthFeatureCredits"), t("dashboard.growthFeatureDevices"), t("dashboard.growthFeatureSpeech"), t("dashboard.growthFeatureTranslation"), t("dashboard.growthFeatureSummaries"), t("dashboard.growthFeatureThemes")].map((item) => (
                  <div key={item} className="flex items-center gap-2 text-sm text-amber-800">
                    <CheckCircle2 className="w-3.5 h-3.5 text-amber-500" /> {item}
                  </div>
                ))}
              </div>
              <Button className="w-full mt-3" size="sm" onClick={() => router.push("/subscription")}>
                {t("dashboard.upgradeToGrowth")}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Credits explanation (trial users) */}
      {isOnTrial && (
        <Card padding="md">
          <CardHeader title={t("dashboard.whatAreCreditsFor")} icon={<Zap className="w-4 h-4 text-yellow-600" />} />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-50">
              <Languages className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-slate-900">{t("dashboard.translation")}</p>
                <p className="text-[11px] text-slate-500">{t("dashboard.translationDesc")}</p>
              </div>
            </div>
            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-50">
              <Mic className="w-4 h-4 text-purple-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-slate-900">{t("dashboard.sermonTranscription")}</p>
                <p className="text-[11px] text-slate-500">{t("dashboard.sermonTranscriptionDesc")}</p>
              </div>
            </div>
            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-50">
              <Brain className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-slate-900">{t("dashboard.aiSummaries")}</p>
                <p className="text-[11px] text-slate-500">{t("dashboard.aiSummariesDesc")}</p>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Main content grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Onboarding checklist (trial) or Recent Activity (paid) */}
        {isOnTrial ? (
          <Card padding="none" className="flex flex-col">
            <div className="px-5 py-4 border-b border-slate-100">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <CheckCircle2 className="w-4 h-4 text-slate-400" /> {t("dashboard.gettingStarted")}
              </div>
            </div>
            <div className="flex-1 p-3 flex flex-col gap-0.5">
              {onboardingSteps.map((step) => (
                <button
                  key={step.key}
                  onClick={() => router.push(step.href)}
                  className="flex items-center gap-3 px-3 h-[44px] rounded-xl hover:bg-slate-50 transition-colors text-left w-full cursor-pointer group"
                >
                  {step.done ? (
                    <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                  ) : (
                    <Circle className="w-4 h-4 text-slate-300 shrink-0" />
                  )}
                  <span className={`text-sm ${step.done ? "text-slate-500 line-through" : "text-slate-900 font-medium"}`}>
                    {step.label}
                  </span>
                  {!step.done && (
                    <ArrowUpRight className="w-3.5 h-3.5 text-slate-300 ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
                  )}
                  {step.done && (
                    <Badge variant="success" size="sm" className="ml-auto">{t("dashboard.done")}</Badge>
                  )}
                </button>
              ))}
            </div>
          </Card>
        ) : (
          <Card padding="none" className="flex flex-col">
            <div className="px-5 py-4 border-b border-slate-100 flex justify-between items-center">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <History className="w-4 h-4 text-slate-400" /> {t("dashboard.recentActivity")}
              </div>
              <button onClick={() => router.push("/credits/history")} className="text-xs font-medium text-blue-700 hover:underline cursor-pointer">{t("dashboard.viewAll")}</button>
            </div>
            <div className="flex-1">
              {recentTx.length === 0 ? (
                <EmptyState
                  icon={<Zap className="w-5 h-5" />}
                  title={t("dashboard.noRecentActivity")}
                  description={t("dashboard.creditTransactionsAppear")}
                />
              ) : (
                recentTx.map((tx, i) => (
                  <div key={tx._id || i} className="flex items-center gap-3 px-5 h-[52px] hover:bg-slate-50 transition-colors border-b border-slate-50 last:border-0">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center ${tx.amount > 0 ? "text-green-700 bg-green-100" : "text-yellow-700 bg-yellow-100"}`}>
                      <Zap className="w-3.5 h-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">{tx.description}</p>
                    </div>
                    <span className="text-xs text-slate-500 whitespace-nowrap">{formatTime(tx.createdAt)}</span>
                  </div>
                ))
              )}
            </div>
          </Card>
        )}

        {/* Connected Devices */}
        <Card padding="none" className="flex flex-col">
          <div className="px-5 py-4 border-b border-slate-100 flex justify-between items-center">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Monitor className="w-4 h-4 text-slate-400" /> {t("dashboard.connectedDevices")}
            </div>
            <button onClick={() => router.push("/security")} className="text-xs font-medium text-blue-700 hover:underline cursor-pointer">{t("dashboard.manage")}</button>
          </div>
          <div className="flex-1 p-3 flex flex-col gap-2">
            {pairing.isActive && (
              <div className="border border-dashed border-amber-300 rounded-xl p-3 flex items-center justify-between bg-amber-50/50">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 bg-amber-100 rounded flex items-center justify-center text-amber-600 shrink-0">
                    <Link className="w-4 h-4" />
                  </div>
                  <div className="truncate">
                    <p className="text-sm font-medium text-amber-900 truncate">{t("dashboard.pendingPairing")}</p>
                    <p className="text-xs font-mono text-amber-700 tracking-wider">{pairing.code}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant="warning" size="sm" dot>{pairing.countdown}</Badge>
                  <button onClick={pairing.copyCode} className="text-amber-400 hover:text-amber-700 p-1" title={t("dashboard.copyCode")}>
                    {pairing.copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            )}
            {sessions.length === 0 && !pairing.isActive ? (
              <EmptyState
                icon={<Monitor className="w-5 h-5" />}
                title={t("dashboard.noDevicesConnected")}
                description={t("dashboard.pairFirstDeviceDesc")}
              />
            ) : (
              sessions.slice(0, 3).map((s, i) => {
                const deviceLabel = s.deviceName || s.devicePlatform || t("common.unknownDevice");
                const osInfo = s.deviceOs || s.devicePlatform || t("common.unknownOS");
                const isCurrent = s.isCurrent;
                return (
                  <div key={s._id || i} className="border border-slate-200 rounded-xl p-3 flex items-center justify-between hover:border-blue-300 transition-colors">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 bg-slate-100 rounded flex items-center justify-center text-slate-600 shrink-0">
                        <Monitor className="w-4 h-4" />
                      </div>
                      <div className="truncate">
                        <p className="text-sm font-medium text-slate-900 truncate">{deviceLabel}</p>
                        <p className="text-[11px] text-slate-500 truncate">{osInfo}</p>
                      </div>
                    </div>
                    <Badge variant={isCurrent ? "success" : "default"} size="sm" dot>
                      {isCurrent ? t("dashboard.current") : t("dashboard.online")}
                    </Badge>
                  </div>
                );
              })
            )}
            {sessions.length > 3 && (
              <button onClick={() => router.push("/security")} className="text-xs font-medium text-blue-700 hover:underline flex items-center justify-center gap-1 w-full py-2 cursor-pointer">
                View all ({sessions.length}) <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </Card>
      </div>

      {/* Bottom row: Quick Actions + Tutorials + Community */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card padding="md">
          <CardHeader title={t("dashboard.quickActions")} icon={<Zap className="w-4 h-4 text-slate-500" />} />
          <div className="space-y-2">
            <button onClick={() => router.push("/devices")} className="w-full flex items-center justify-between p-3 border border-slate-200 rounded-xl hover:border-blue-300 transition-colors group text-left cursor-pointer">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center">
                  <Link className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-900">{t("dashboard.pairDevice")}</p>
                  <p className="text-[11px] text-slate-500">{t("dashboard.connectNewDevice")}</p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-blue-500" />
            </button>
            {isOnTrial ? (
              <button onClick={() => router.push("/subscription")} className="w-full flex items-center justify-between p-3 border border-amber-200 bg-amber-50 rounded-xl hover:border-amber-400 transition-colors group text-left cursor-pointer">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center">
                    <Zap className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-amber-900">{t("dashboard.upgradeToGrowth")}</p>
                    <p className="text-[11px] text-amber-600">{t("dashboard.unlockPremium", { days: trialDayLabel })}</p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-amber-400 group-hover:text-amber-600" />
              </button>
            ) : plan === "pro" ? (
              <div className="w-full flex items-center justify-between p-3 border border-emerald-200 bg-emerald-50 rounded-xl group text-left">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center">
                    <Zap className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-emerald-900">{t("dashboard.proPlanActive")}</p>
                    <p className="text-[11px] text-emerald-600">{isCreditUnlimited ? t("dashboard.unlimited") : CREDIT_LIMIT.toLocaleString()} {t("dashboard.aiCredits")}</p>
                  </div>
                </div>
                <CheckCircle className="w-4 h-4 text-emerald-500" />
              </div>
            ) : (
              <button onClick={() => router.push("/credits")} className="w-full flex items-center justify-between p-3 border border-slate-200 rounded-xl hover:border-yellow-300 transition-colors group text-left cursor-pointer">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-yellow-50 text-yellow-600 flex items-center justify-center">
                    <Zap className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-900">{t("dashboard.buyCredits")}</p>
                    <p className="text-[11px] text-slate-500">{t("dashboard.addMoreCredits")}</p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-yellow-600" />
              </button>
            )}
          </div>
        </Card>

        <Card padding="md">
          <CardHeader
            title={t("dashboard.tutorials")}
            icon={<PlayCircle className="w-4 h-4 text-slate-500" />}
            action={<button onClick={() => router.push("/tutorials")} className="text-xs font-medium text-blue-700 hover:underline cursor-pointer">{t("dashboard.viewAll")}</button>}
          />
          <div className="space-y-3">
            {[t("dashboard.tutorialGettingStarted"), t("dashboard.tutorialSpeechToScripture"), t("dashboard.tutorialTranslationFeatures")].map((title, i) => (
              <button key={i} onClick={() => router.push("/tutorials")} className="flex items-center gap-3 group text-left w-full cursor-pointer">
                <div className="relative w-16 h-10 bg-slate-100 rounded-xl overflow-hidden shrink-0">
                  <div className="absolute inset-0 bg-slate-800/10 group-hover:bg-slate-800/20 transition-colors" />
                  <PlayCircle className="w-4 h-4 text-white absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 drop-shadow-md" />
                </div>
                <span className="text-sm font-medium text-slate-700 group-hover:text-blue-700 transition-colors line-clamp-2">
                  {title}
                </span>
              </button>
            ))}
          </div>
        </Card>

        <Card padding="md">
          <CardHeader
            title={t("dashboard.community")}
            icon={<MessageCircle className="w-4 h-4 text-slate-500" />}
            action={<button onClick={() => router.push("/community")} className="text-xs font-medium text-blue-700 hover:underline cursor-pointer">{t("dashboard.joinUs")}</button>}
          />
          <div className="space-y-2">
            <button onClick={() => router.push("/community")} className="w-full flex items-center gap-3 group text-left cursor-pointer p-2 rounded-xl hover:bg-slate-50 transition-colors">
              <div className="w-8 h-8 rounded-xl bg-green-100 text-green-700 flex items-center justify-center shrink-0">
                <MessageCircle className="w-4 h-4" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-900 group-hover:text-green-700 transition-colors">{t("dashboard.whatsappCommunity")}</p>
                <p className="text-[11px] text-slate-500">{t("dashboard.membersCount")}</p>
              </div>
            </button>
            <button onClick={() => router.push("/community")} className="w-full flex items-center gap-3 group text-left cursor-pointer p-2 rounded-xl hover:bg-slate-50 transition-colors">
              <div className="w-8 h-8 rounded-xl bg-yellow-100 text-yellow-700 flex items-center justify-center shrink-0">
                <Lightbulb className="w-4 h-4" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-900 group-hover:text-yellow-700 transition-colors">{t("dashboard.featureRequests")}</p>
                <p className="text-[11px] text-slate-500">{t("dashboard.voteForUpcoming")}</p>
              </div>
            </button>
            <button onClick={() => router.push("/community")} className="w-full flex items-center gap-3 group text-left cursor-pointer p-2 rounded-xl hover:bg-slate-50 transition-colors">
              <div className="w-8 h-8 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center shrink-0">
                <Map className="w-4 h-4" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-900 group-hover:text-purple-700 transition-colors">{t("dashboard.roadmap")}</p>
                <p className="text-[11px] text-slate-500">{t("dashboard.seeWhatsNext")}</p>
              </div>
            </button>
          </div>
        </Card>
      </div>
    </div>
  );
}
